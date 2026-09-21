'use strict';

const crypto = require('node:crypto');
const { findLabelField } = require('../config/labelFieldRegistry');
const { LABEL_BUILDER_TEXT_CASES } = require('../config/labelBuilder');

const STARTER_PRESETS = Object.freeze([
  Object.freeze({
    id: 'starter-spec-line',
    label: 'Memory / RAM | Storage Capacity | Operating System',
    parts: Object.freeze([
      Object.freeze({ type: 'field', field: 'unit.ram', fallback: '', format: 'plain' }),
      Object.freeze({ type: 'static', value: ' | ' }),
      Object.freeze({ type: 'field', field: 'unit.storage', fallback: '', format: 'plain' }),
      Object.freeze({ type: 'static', value: ' | ' }),
      Object.freeze({ type: 'field', field: 'unit.operating_system', fallback: '', format: 'plain' })
    ])
  }),
  Object.freeze({
    id: 'starter-asset-serial',
    label: 'Asset Tag | Primary Serial',
    parts: Object.freeze([
      Object.freeze({ type: 'field', field: 'unit.asset_tag', fallback: '', format: 'plain' }),
      Object.freeze({ type: 'static', value: ' | ' }),
      Object.freeze({ type: 'field', field: 'unit.primary_serial', fallback: '', format: 'plain' })
    ])
  })
]);

function cloneParts(parts) {
  return (Array.isArray(parts) ? parts : []).map((part) => ({ ...part }));
}

function normalizeParts(parts) {
  if (!Array.isArray(parts)) return [];
  const normalized = [];
  for (const part of parts.slice(0, 40)) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'static') {
      const value = String(part.value ?? '').slice(0, 500);
      if (!value) continue;
      normalized.push({ type: 'static', value });
      continue;
    }
    if (part.type === 'field') {
      const field = String(part.field || '').trim();
      if (!findLabelField(field)) continue;
      const format = LABEL_BUILDER_TEXT_CASES.includes(String(part.format || '').trim())
        ? String(part.format).trim()
        : 'plain';
      normalized.push({
        type: 'field',
        field,
        fallback: String(part.fallback || '').slice(0, 160),
        format
      });
    }
  }
  return normalized;
}

function isUsefulComposition(parts) {
  const normalized = normalizeParts(parts);
  if (!normalized.length) return false;
  const fieldCount = normalized.filter((part) => part.type === 'field').length;
  const staticCount = normalized.filter((part) => part.type === 'static' && String(part.value || '')).length;
  return fieldCount >= 2 || (fieldCount >= 1 && staticCount >= 1);
}

function fingerprintParts(parts) {
  return JSON.stringify(normalizeParts(parts));
}

function describeParts(parts) {
  return normalizeParts(parts).map((part) => {
    if (part.type === 'field') return findLabelField(part.field)?.label || part.field;
    return String(part.value || '');
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function extractCompositions(layout) {
  const output = [];
  for (const element of Array.isArray(layout?.elements) ? layout.elements : []) {
    if (!element || typeof element !== 'object') continue;
    if (element.type === 'composed_text' && isUsefulComposition(element.parts)) {
      output.push(normalizeParts(element.parts));
      continue;
    }
    if ((element.type === 'barcode' || element.type === 'qr')
      && element.payload?.type === 'composed'
      && isUsefulComposition(element.payload.parts)) {
      output.push(normalizeParts(element.payload.parts));
    }
  }
  return output;
}

function buildComposedValuePresets(entries = [], { commonLimit = 6, recentLimit = 6 } = {}) {
  const aggregates = new Map();
  const recentCandidates = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const compositions = extractCompositions(entry?.layout);
    const seenInTemplate = new Set();
    for (const parts of compositions) {
      const fingerprint = fingerprintParts(parts);
      if (!fingerprint) continue;
      const usedAt = entry?.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
      const existing = aggregates.get(fingerprint) || {
        fingerprint,
        parts,
        templateCount: 0,
        lastUsedAt: 0
      };
      if (!seenInTemplate.has(fingerprint)) {
        existing.templateCount += 1;
        seenInTemplate.add(fingerprint);
      }
      existing.lastUsedAt = Math.max(existing.lastUsedAt, Number.isFinite(usedAt) ? usedAt : 0);
      aggregates.set(fingerprint, existing);
      recentCandidates.push({ fingerprint, parts, usedAt: Number.isFinite(usedAt) ? usedAt : 0 });
    }
  }

  const toPreset = (item, prefix) => ({
    // Do not derive the ID from the beginning of the Base64-encoded JSON fingerprint.
    // Compositions share a long JSON prefix, so truncating the beginning produced collisions
    // between otherwise different Common/Recent presets. Hash the full normalized fingerprint
    // so each button deterministically maps back to the exact composition it describes.
    id: `${prefix}-${crypto.createHash('sha256').update(item.fingerprint).digest('hex').slice(0, 20)}`,
    label: describeParts(item.parts) || 'Composed value',
    parts: cloneParts(item.parts),
    usageCount: Number(item.templateCount || 0)
  });

  const commonItems = [...aggregates.values()]
    .filter((item) => item.templateCount >= 2)
    .sort((a, b) => b.templateCount - a.templateCount || b.lastUsedAt - a.lastUsedAt)
    .slice(0, commonLimit);
  const commonFingerprints = new Set(commonItems.map((item) => item.fingerprint));

  const recent = [];
  const seenRecent = new Set();
  for (const item of recentCandidates.sort((a, b) => b.usedAt - a.usedAt)) {
    if (commonFingerprints.has(item.fingerprint) || seenRecent.has(item.fingerprint)) continue;
    const aggregate = aggregates.get(item.fingerprint) || item;
    recent.push(toPreset(aggregate, 'recent'));
    seenRecent.add(item.fingerprint);
    if (recent.length >= recentLimit) break;
  }

  const common = commonItems.map((item) => toPreset(item, 'common'));
  const learnedFingerprints = new Set([
    ...commonItems.map((item) => item.fingerprint),
    ...recent.map((preset) => fingerprintParts(preset.parts))
  ]);
  const starter = STARTER_PRESETS
    .filter((preset) => !learnedFingerprints.has(fingerprintParts(preset.parts)))
    .map((preset) => ({ ...preset, parts: cloneParts(preset.parts) }));

  return { common, recent, starter };
}

module.exports = {
  STARTER_PRESETS,
  normalizeParts,
  describeParts,
  extractCompositions,
  buildComposedValuePresets
};
