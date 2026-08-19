'use strict';

const APPLE_MODEL_FAMILIES = Object.freeze([
  Object.freeze({ modelName: 'MacBook', categoryKind: 'laptop' }),
  Object.freeze({ modelName: 'MacBook Air', categoryKind: 'laptop' }),
  Object.freeze({ modelName: 'MacBook Pro', categoryKind: 'laptop' }),
  Object.freeze({ modelName: 'iMac', categoryKind: 'desktop' }),
  Object.freeze({ modelName: 'iMac Pro', categoryKind: 'desktop' }),
  Object.freeze({ modelName: 'Mac mini', categoryKind: 'desktop' }),
  Object.freeze({ modelName: 'Mac Pro', categoryKind: 'desktop' }),
  Object.freeze({ modelName: 'Mac Studio', categoryKind: 'desktop' }),
  Object.freeze({ modelName: 'iPad', categoryKind: 'tablet' }),
  Object.freeze({ modelName: 'iPad Air', categoryKind: 'tablet' }),
  Object.freeze({ modelName: 'iPad Pro', categoryKind: 'tablet' })
]);

const FAMILY_BY_NAME = new Map(
  APPLE_MODEL_FAMILIES.map((entry) => [entry.modelName.toLowerCase(), entry])
);

const DEFAULT_SCREEN_SIZE_LABELS = Object.freeze([
  '11-inch',
  '12-inch',
  '12.9-inch',
  '13-inch',
  '13.3-inch',
  '13.6-inch',
  '14-inch',
  '15-inch',
  '15.4-inch',
  '15.6-inch',
  '16-inch',
  '17-inch',
  '21.5-inch',
  '24-inch',
  '27-inch'
]);

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getAppleModelFamily(modelName) {
  const normalized = normalizeText(modelName);
  if (!normalized) return null;

  const baseName = normalizeText(normalized.replace(/\s*\([^)]*\)\s*$/, ''));
  return FAMILY_BY_NAME.get(baseName.toLowerCase()) || null;
}

function parseScreenSizeLabel(modelName) {
  const normalized = normalizeText(modelName);
  const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*-?\s*inch\b/i);
  return match ? `${match[1]}-inch` : null;
}

function parseModelYear(modelName) {
  const normalized = normalizeText(modelName);
  const matches = [...normalized.matchAll(/\b(19\d{2}|20\d{2}|21\d{2})\b/g)];
  if (matches.length === 0) return null;
  const year = Number(matches[matches.length - 1][1]);
  return Number.isInteger(year) && year >= 1980 && year <= 2100 ? year : null;
}

function parseDetailedAppleModel(modelName) {
  const normalized = normalizeText(modelName);
  if (!normalized || !/\([^)]*\)/.test(normalized)) return null;

  const family = getAppleModelFamily(normalized);
  if (!family) return null;

  return Object.freeze({
    sourceModelName: normalized,
    targetModelName: family.modelName,
    categoryKind: family.categoryKind,
    screenSizeLabel: parseScreenSizeLabel(normalized),
    modelYear: parseModelYear(normalized)
  });
}

function isGenericAppleModel(modelName) {
  const normalized = normalizeText(modelName);
  if (!normalized || /\([^)]*\)/.test(normalized)) return false;
  return Boolean(getAppleModelFamily(normalized));
}

module.exports = {
  APPLE_MODEL_FAMILIES,
  DEFAULT_SCREEN_SIZE_LABELS,
  getAppleModelFamily,
  isGenericAppleModel,
  parseDetailedAppleModel,
  parseModelYear,
  parseScreenSizeLabel
};
