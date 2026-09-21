'use strict';

const {
  LABEL_BUILDER_SCHEMA_VERSION,
  LABEL_BUILDER_VERSION,
  DEFAULT_LABEL_BUILDER_MEDIA_CODE,
  LABEL_BUILDER_DEFAULT_LENGTH_MM,
  LABEL_BUILDER_GRID_SIZES,
  LABEL_BUILDER_ROTATIONS,
  LABEL_BUILDER_FONT_WEIGHTS,
  LABEL_BUILDER_TEXT_ALIGNS,
  LABEL_BUILDER_TEXT_CASES,
  LABEL_BUILDER_FONT_FAMILIES,
  DEFAULT_LABEL_BUILDER_FONT_FAMILY,
  DEFAULT_LABEL_BUILDER_FONT_SIZE,
  LABEL_BUILDER_MIN_LENGTH_MM,
  LABEL_BUILDER_MAX_LENGTH_MM,
  findLabelBuilderMediaWidth,
  normalizeLabelBuilderLengthMm,
  buildLabelBuilderGeometry
} = require('../config/labelBuilder');
const { findLabelField } = require('../config/labelFieldRegistry');

const FINAL_ELEMENT_TYPES = new Set([
  'static_text',
  'dynamic_text',
  'composed_text',
  'image',
  'barcode',
  'qr',
  'line',
  'rectangle'
]);
const DRAFT_ELEMENT_TYPES = new Set(['unconfigured', ...FINAL_ELEMENT_TYPES]);
const FONT_FAMILY_CODES = new Set(LABEL_BUILDER_FONT_FAMILIES.map((font) => font.code));
const SHARED_ASSET_KEY_PATTERN = /^shared_([a-f0-9]{64})$/;
const LEGACY_BARCODE_HUMAN_READABLE_FONT_SIZE = 20;
const MIN_BARCODE_HUMAN_READABLE_FONT_SIZE = 8;
const MAX_BARCODE_HUMAN_READABLE_FONT_SIZE = 48;

const PAYLOAD_TYPES = new Set(['static', 'field', 'composed']);
const CODE39_STATIC_PATTERN = /^[0-9A-Z.\- $/+%]*$/i;

function normalizePayloadParts(parts = []) {
  if (!Array.isArray(parts)) return [];
  return parts.slice(0, 40).map((part) => {
    if (!part || typeof part !== 'object') return null;
    const type = String(part.type || '').trim();
    if (type === 'static') {
      return { type: 'static', value: String(part.value ?? '').slice(0, 500) };
    }
    if (type === 'field') {
      const field = String(part.field || '').trim();
      return {
        type: 'field',
        field,
        fallback: String(part.fallback || '').slice(0, 160),
        format: LABEL_BUILDER_TEXT_CASES.includes(String(part.format || '').trim()) ? String(part.format).trim() : 'plain'
      };
    }
    return null;
  }).filter(Boolean);
}

function normalizePayload(payload = {}) {
  const type = PAYLOAD_TYPES.has(String(payload.type || '').trim()) ? String(payload.type).trim() : 'field';
  if (type === 'static') {
    return { type, value: String(payload.value ?? '').slice(0, 500) };
  }
  if (type === 'composed') {
    return { type, parts: normalizePayloadParts(payload.parts) };
  }
  return {
    type: 'field',
    field: String(payload.field || '').trim(),
    fallback: String(payload.fallback || '').slice(0, 160),
    format: LABEL_BUILDER_TEXT_CASES.includes(String(payload.format || '').trim()) ? String(payload.format).trim() : 'plain'
  };
}

function inspectPayloadReadiness(payload, { label, code39 = false } = {}) {
  const issues = [];
  const safeLabel = label || 'Payload';
  if (!payload || !PAYLOAD_TYPES.has(String(payload.type || ''))) {
    return [`${safeLabel} needs a payload source.`];
  }
  if (payload.type === 'static') {
    const value = String(payload.value || '').trim();
    if (!value) issues.push(`${safeLabel} needs a static value.`);
    if (code39 && value && !CODE39_STATIC_PATTERN.test(value)) {
      issues.push(`${safeLabel} static value contains characters that Code 39 cannot encode.`);
    }
    return issues;
  }
  if (payload.type === 'field') {
    const field = String(payload.field || '').trim();
    if (!field || !findLabelField(field)) issues.push(`${safeLabel} needs a valid BWTDallas field.`);
    return issues;
  }
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  if (!parts.length) {
    issues.push(`${safeLabel} needs a composed value.`);
    return issues;
  }
  let hasContent = false;
  for (const part of parts) {
    if (part?.type === 'static') {
      const value = String(part.value || '');
      if (value) hasContent = true;
      if (code39 && value && !CODE39_STATIC_PATTERN.test(value)) {
        issues.push(`${safeLabel} contains composed static characters that Code 39 cannot encode.`);
      }
    } else if (part?.type === 'field') {
      hasContent = true;
      const field = String(part.field || '').trim();
      if (!field || !findLabelField(field)) issues.push(`${safeLabel} contains an invalid BWTDallas field.`);
    } else {
      issues.push(`${safeLabel} contains an unsupported composed-value part.`);
    }
  }
  if (!hasContent) issues.push(`${safeLabel} needs a composed value.`);
  return issues;
}

class LabelBuilderLayoutError extends Error {
  constructor(messages) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join(' '));
    this.name = 'LabelBuilderLayoutError';
    this.messages = list;
  }
}

function normalizeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new LabelBuilderLayoutError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function normalizeLengthMm(value) {
  const normalized = normalizeLabelBuilderLengthMm(value);
  if (normalized === null) {
    throw new LabelBuilderLayoutError(`Label length must be between ${LABEL_BUILDER_MIN_LENGTH_MM} mm and ${LABEL_BUILDER_MAX_LENGTH_MM} mm.`);
  }
  return normalized;
}

function normalizeRotation(value) {
  const rotation = Number(value ?? 0);
  return LABEL_BUILDER_ROTATIONS.includes(rotation) ? rotation : 0;
}

function normalizeTextStyle(style = {}) {
  const fontFamily = FONT_FAMILY_CODES.has(String(style.fontFamily || '').trim())
    ? String(style.fontFamily).trim()
    : DEFAULT_LABEL_BUILDER_FONT_FAMILY;
  const requestedSize = Number(style.fontSize ?? DEFAULT_LABEL_BUILDER_FONT_SIZE);
  const fontSize = Number.isSafeInteger(requestedSize) && requestedSize >= 6 && requestedSize <= 300
    ? requestedSize
    : DEFAULT_LABEL_BUILDER_FONT_SIZE;
  const requestedWeight = Number(style.fontWeight ?? 400);
  const fontWeight = LABEL_BUILDER_FONT_WEIGHTS.includes(requestedWeight) ? requestedWeight : 400;
  const align = LABEL_BUILDER_TEXT_ALIGNS.includes(String(style.align || '').trim())
    ? String(style.align).trim()
    : 'left';
  const textCase = LABEL_BUILDER_TEXT_CASES.includes(String(style.textCase || '').trim())
    ? String(style.textCase).trim()
    : 'plain';
  return {
    ...style,
    fontFamily,
    fontSize,
    fontWeight,
    align,
    textCase,
    overflow: style.overflow === 'clip' ? 'clip' : 'shrink'
  };
}

function constrainTextStyleToElement(style, element) {
  const quarterTurn = Number(element?.rotation) === 90 || Number(element?.rotation) === 270;
  const localHeight = quarterTurn ? Number(element?.width) : Number(element?.height);
  if (!Number.isFinite(localHeight) || localHeight < 6) return style;
  return {
    ...style,
    fontSize: Math.min(Number(style?.fontSize || DEFAULT_LABEL_BUILDER_FONT_SIZE), Math.floor(localHeight))
  };
}

function createBlankBuilderLayout({
  mediaWidthCode = DEFAULT_LABEL_BUILDER_MEDIA_CODE,
  lengthMm = LABEL_BUILDER_DEFAULT_LENGTH_MM
} = {}) {
  const media = findLabelBuilderMediaWidth(mediaWidthCode);
  if (!media) throw new LabelBuilderLayoutError('Choose a supported continuous roll width.');
  const safeLengthMm = normalizeLengthMm(lengthMm);
  return {
    schemaVersion: LABEL_BUILDER_SCHEMA_VERSION,
    builderVersion: LABEL_BUILDER_VERSION,
    mediaWidthCode: media.code,
    lengthMm: safeLengthMm,
    elements: []
  };
}

function normalizeBuilderElement(element, index, { width, height }) {
  if (!element || typeof element !== 'object') {
    throw new LabelBuilderLayoutError(`Region ${index + 1} is invalid.`);
  }
  const id = String(element.id || '').trim();
  const type = String(element.type || 'unconfigured').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    throw new LabelBuilderLayoutError(`Region ${index + 1} needs a stable ID.`);
  }
  if (!DRAFT_ELEMENT_TYPES.has(type)) {
    throw new LabelBuilderLayoutError(`Region ${id} has an unsupported type.`);
  }

  const x = normalizeInteger(element.x, `Region ${id} X`, { min: 0, max: width - 1 });
  const y = normalizeInteger(element.y, `Region ${id} Y`, { min: 0, max: height - 1 });
  const regionWidth = normalizeInteger(element.width, `Region ${id} width`, { min: 2, max: width });
  const regionHeight = normalizeInteger(element.height, `Region ${id} height`, { min: 2, max: height });
  if (x + regionWidth > width || y + regionHeight > height) {
    throw new LabelBuilderLayoutError(`Region ${id} must remain inside the label canvas.`);
  }

  const normalized = {
    ...element,
    id,
    type,
    x,
    y,
    width: regionWidth,
    height: regionHeight,
    rotation: normalizeRotation(element.rotation)
  };

  if (type === 'static_text') {
    normalized.text = String(element.text ?? '').slice(0, 500);
    normalized.style = constrainTextStyleToElement(normalizeTextStyle(element.style), normalized);
  } else if (type === 'dynamic_text') {
    const field = String(element.source?.field || '').trim();
    normalized.source = {
      ...(element.source || {}),
      field,
      fallback: String(element.source?.fallback || '').slice(0, 160),
      format: 'plain'
    };
    normalized.style = constrainTextStyleToElement(normalizeTextStyle(element.style), normalized);
  } else if (type === 'composed_text') {
    normalized.parts = normalizePayloadParts(element.parts);
    normalized.style = constrainTextStyleToElement(normalizeTextStyle(element.style), normalized);
  } else if (type === 'image') {
    const assetKey = String(element.assetKey || '').trim().toLowerCase();
    normalized.assetKey = SHARED_ASSET_KEY_PATTERN.test(assetKey) ? assetKey : '';
    normalized.fit = 'contain';
    normalized.lockAspectRatio = element.lockAspectRatio !== false;
  } else if (type === 'barcode') {
    normalized.symbology = 'code39';
    normalized.payload = normalizePayload(element.payload);
    normalized.showText = element.showText === true;
    const requestedHumanReadableFontSize = Number(element.humanReadableFontSize);
    normalized.humanReadableFontSize = Number.isSafeInteger(requestedHumanReadableFontSize)
      && requestedHumanReadableFontSize >= MIN_BARCODE_HUMAN_READABLE_FONT_SIZE
      && requestedHumanReadableFontSize <= MAX_BARCODE_HUMAN_READABLE_FONT_SIZE
      ? requestedHumanReadableFontSize
      : LEGACY_BARCODE_HUMAN_READABLE_FONT_SIZE;
  } else if (type === 'qr') {
    normalized.payload = normalizePayload(element.payload);
    const correction = String(element.errorCorrection || 'M').trim().toUpperCase();
    normalized.errorCorrection = ['L', 'M', 'Q', 'H'].includes(correction) ? correction : 'M';
  } else if (type === 'line') {
    const requestedThickness = Number(element.thickness ?? 2);
    const localHeight = normalized.rotation === 90 || normalized.rotation === 270 ? regionWidth : regionHeight;
    const maxThickness = Math.max(1, Math.min(40, localHeight));
    normalized.thickness = Number.isSafeInteger(requestedThickness) && requestedThickness >= 1
      ? Math.min(requestedThickness, maxThickness)
      : Math.min(2, maxThickness);
  } else if (type === 'rectangle') {
    normalized.fill = element.fill === 'filled' ? 'filled' : 'outline';
    const requestedThickness = Number(element.thickness ?? 2);
    const maxThickness = Math.max(1, Math.min(40, Math.floor(Math.min(regionWidth, regionHeight) / 2)));
    normalized.thickness = Number.isSafeInteger(requestedThickness) && requestedThickness >= 1
      ? Math.min(requestedThickness, maxThickness)
      : Math.min(2, maxThickness);
  }

  return normalized;
}

function normalizeBuilderLayout(layout, {
  template = null,
  mediaWidthCode = null,
  lengthMm = null
} = {}) {
  if (!layout || typeof layout !== 'object') throw new LabelBuilderLayoutError('Label layout JSON is required.');
  if (Number(layout.schemaVersion) !== LABEL_BUILDER_SCHEMA_VERSION) {
    throw new LabelBuilderLayoutError(`Label layout must use schemaVersion ${LABEL_BUILDER_SCHEMA_VERSION}.`);
  }

  const legacyWidthCode = String(layout.mediaPresetCode || '').split('_').slice(0, 2).join('_');
  const resolvedMediaCode = String(mediaWidthCode || layout.mediaWidthCode || legacyWidthCode || '').trim();
  const media = findLabelBuilderMediaWidth(resolvedMediaCode);
  if (!media) throw new LabelBuilderLayoutError('Choose a supported continuous roll width.');

  const legacyLengthMatch = String(layout.mediaPresetCode || '').match(/_(\d+(?:\.\d+)?)mm$/i);
  const resolvedLengthMm = normalizeLengthMm(lengthMm ?? layout.lengthMm ?? legacyLengthMatch?.[1] ?? LABEL_BUILDER_DEFAULT_LENGTH_MM);
  const geometry = buildLabelBuilderGeometry(media.code, resolvedLengthMm);
  if (!geometry) throw new LabelBuilderLayoutError('The selected continuous media geometry is invalid.');

  const elements = Array.isArray(layout.elements) ? layout.elements : [];
  const ids = new Set();
  const normalizedElements = elements.map((element, index) => {
    const normalized = normalizeBuilderElement(element, index, {
      width: geometry.canvasWidthDots,
      height: geometry.canvasHeightDots
    });
    if (ids.has(normalized.id)) throw new LabelBuilderLayoutError(`Duplicate region ID: ${normalized.id}.`);
    ids.add(normalized.id);
    return normalized;
  });

  const { mediaPresetCode: _legacyPresetCode, ...rest } = layout;
  return {
    ...rest,
    schemaVersion: LABEL_BUILDER_SCHEMA_VERSION,
    builderVersion: LABEL_BUILDER_VERSION,
    mediaWidthCode: media.code,
    lengthMm: resolvedLengthMm,
    elements: normalizedElements
  };
}

function inspectLayoutReadiness(layout) {
  const issues = [];
  if (!layout || typeof layout !== 'object' || Number(layout.schemaVersion) !== LABEL_BUILDER_SCHEMA_VERSION) {
    return { ready: false, issues: ['A valid structured layout is required.'] };
  }
  const elements = Array.isArray(layout.elements) ? layout.elements : [];
  if (!elements.length) issues.push('Add at least one printable label element.');
  for (const element of elements) {
    const id = element?.id || '(unnamed)';
    const type = String(element?.type || '');
    if (!element || !FINAL_ELEMENT_TYPES.has(type)) {
      issues.push(`Region ${id} still needs a content type.`);
      continue;
    }
    if (type === 'static_text' && !String(element.text || '').trim()) {
      issues.push(`Static Text region ${id} needs text.`);
    }
    if (type === 'dynamic_text') {
      const field = String(element.source?.field || '').trim();
      if (!field || !findLabelField(field)) issues.push(`Dynamic Text region ${id} needs a valid BWTDallas field.`);
    }
    if (type === 'composed_text') {
      issues.push(...inspectPayloadReadiness({ type: 'composed', parts: element.parts }, { label: `Composed Text region ${id}` }));
    }
    if (type === 'image' && !SHARED_ASSET_KEY_PATTERN.test(String(element.assetKey || '').trim().toLowerCase())) {
      issues.push(`Image region ${id} needs a reusable Shared Asset.`);
    }
    if (type === 'barcode') {
      const symbology = String(element.symbology || 'code39').trim().toLowerCase();
      if (symbology !== 'code39') issues.push(`Barcode region ${id} must use Code 39.`);
      if (element.showText === true && element.humanReadableFontSize !== undefined) {
        const size = Number(element.humanReadableFontSize);
        if (!Number.isSafeInteger(size)
          || size < MIN_BARCODE_HUMAN_READABLE_FONT_SIZE
          || size > MAX_BARCODE_HUMAN_READABLE_FONT_SIZE) {
          issues.push(`Barcode region ${id} payload text size must be ${MIN_BARCODE_HUMAN_READABLE_FONT_SIZE}–${MAX_BARCODE_HUMAN_READABLE_FONT_SIZE} dots.`);
        }
      }
      issues.push(...inspectPayloadReadiness(element.payload, { label: `Barcode region ${id}`, code39: true }));
    }
    if (type === 'qr') {
      const correction = String(element.errorCorrection || 'M').trim().toUpperCase();
      if (!['L', 'M', 'Q', 'H'].includes(correction)) issues.push(`QR region ${id} has an invalid error-correction level.`);
      issues.push(...inspectPayloadReadiness(element.payload, { label: `QR region ${id}` }));
    }
  }
  return { ready: issues.length === 0, issues };
}

function normalizeGridSize(value) {
  const size = Number(value);
  return LABEL_BUILDER_GRID_SIZES.includes(size) ? size : 5;
}

module.exports = {
  FINAL_ELEMENT_TYPES,
  DRAFT_ELEMENT_TYPES,
  LabelBuilderLayoutError,
  createBlankBuilderLayout,
  normalizeBuilderLayout,
  inspectLayoutReadiness,
  normalizeGridSize,
  normalizeRotation,
  normalizeTextStyle,
  normalizePayload,
  inspectPayloadReadiness
};
