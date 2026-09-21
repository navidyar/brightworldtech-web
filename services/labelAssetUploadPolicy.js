'use strict';

const path = require('node:path');
const sharp = require('sharp');

const MAX_LABEL_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_LABEL_ASSET_PIXELS = 25_000_000;
const LABEL_IMAGE_ASSET_KINDS = Object.freeze(['logo', 'image', 'background']);
const LABEL_IMAGE_UPLOAD_MIME_TYPES = Object.freeze(['image/png', 'image/svg+xml']);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class LabelAssetUploadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'LabelAssetUploadError';
    this.statusCode = statusCode;
  }
}

function normalizeAssetKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!LABEL_IMAGE_ASSET_KINDS.includes(normalized)) {
    throw new LabelAssetUploadError('Choose Logo, Image, or Background for the asset type.');
  }
  return normalized;
}

function normalizeAssetName(value, sourceFilename = '') {
  const fallback = path.basename(String(sourceFilename || ''), path.extname(String(sourceFilename || ''))).trim();
  const normalized = String(value || fallback || '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new LabelAssetUploadError('Asset name is required.');
  if (normalized.length > 160) throw new LabelAssetUploadError('Asset name cannot exceed 160 characters.');
  return normalized;
}

function normalizeSourceFilename(value) {
  const normalized = path.basename(String(value || '').trim());
  if (!normalized) throw new LabelAssetUploadError('The uploaded file name is required.');
  if (normalized.length > 255) throw new LabelAssetUploadError('The uploaded file name is too long.');
  return normalized;
}

function normalizeUploadMimeType(value) {
  const normalized = String(value || '').split(';', 1)[0].trim().toLowerCase();
  if (!LABEL_IMAGE_UPLOAD_MIME_TYPES.includes(normalized)) {
    throw new LabelAssetUploadError('Only PNG and SVG Label Assets are supported.', 415);
  }
  return normalized;
}

function assertExtensionMatchesMime(sourceFilename, mimeType) {
  const extension = path.extname(sourceFilename).toLowerCase();
  if (mimeType === 'image/png' && extension !== '.png') {
    throw new LabelAssetUploadError('PNG uploads must use a .png file name.');
  }
  if (mimeType === 'image/svg+xml' && extension !== '.svg') {
    throw new LabelAssetUploadError('SVG uploads must use a .svg file name.');
  }
}

function assertUploadBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new LabelAssetUploadError('Choose a PNG or SVG file to upload.');
  }
  if (buffer.length > MAX_LABEL_ASSET_UPLOAD_BYTES) {
    throw new LabelAssetUploadError(`Label Assets cannot exceed ${MAX_LABEL_ASSET_UPLOAD_BYTES / (1024 * 1024)} MB.`, 413);
  }
}

function assertPngSignature(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new LabelAssetUploadError('The selected file is not a valid PNG image.');
  }
}

function sanitizeSvgBuffer(buffer) {
  let svg = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!/<svg(?:\s|>)/i.test(svg)) {
    throw new LabelAssetUploadError('The selected file is not a valid SVG image.');
  }
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(svg)) {
    throw new LabelAssetUploadError('SVG files containing document types, entities, or external stylesheets are not supported.');
  }

  svg = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|audio|video)\b[\s\S]*?<\/(?:iframe|object|embed|audio|video)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|audio|video)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z0-9:_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  if (/javascript\s*:|vbscript\s*:/i.test(svg)) {
    throw new LabelAssetUploadError('SVG files containing script references are not supported.');
  }

  const referencePatterns = [
    /(?:href|xlink:href)\s*=\s*"([^"]+)"/gi,
    /(?:href|xlink:href)\s*=\s*'([^']+)'/gi
  ];
  for (const pattern of referencePatterns) {
    let match;
    while ((match = pattern.exec(svg)) !== null) {
      const reference = String(match[1] || '').trim();
      if (reference && !reference.startsWith('#')) {
        throw new LabelAssetUploadError('SVG files may not reference external files or URLs.');
      }
    }
  }

  const urlPattern = /url\(\s*([^)]+?)\s*\)/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(svg)) !== null) {
    const reference = String(urlMatch[1] || '').trim().replace(/^['"]|['"]$/g, '');
    if (reference && !reference.startsWith('#')) {
      throw new LabelAssetUploadError('SVG files may not reference external files or URLs.');
    }
  }

  if (/@import/i.test(svg)) {
    throw new LabelAssetUploadError('SVG files containing CSS imports are not supported.');
  }

  const sanitized = Buffer.from(svg.trim(), 'utf8');
  if (!sanitized.length) throw new LabelAssetUploadError('The SVG became empty after sanitization.');
  return sanitized;
}

async function inspectImage(buffer, mimeType) {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: MAX_LABEL_ASSET_PIXELS }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new LabelAssetUploadError('The image must have valid width and height dimensions.');
    }
    if (width * height > MAX_LABEL_ASSET_PIXELS) {
      throw new LabelAssetUploadError('The image dimensions are too large for the Label Asset library.');
    }
    if (mimeType === 'image/png' && String(metadata.format || '') !== 'png') {
      throw new LabelAssetUploadError('The selected file is not a valid PNG image.');
    }
    if (mimeType === 'image/svg+xml' && String(metadata.format || '') !== 'svg') {
      throw new LabelAssetUploadError('The selected file is not a valid SVG image.');
    }
    return {
      widthPixels: width,
      heightPixels: height,
      hasTransparency: metadata.hasAlpha === undefined ? null : Boolean(metadata.hasAlpha)
    };
  } catch (error) {
    if (error instanceof LabelAssetUploadError) throw error;
    throw new LabelAssetUploadError(`The image could not be read: ${error.message}`);
  }
}

async function prepareLabelAssetUpload(buffer, { mimeType, sourceFilename, assetKind, name } = {}) {
  assertUploadBuffer(buffer);
  const normalizedMime = normalizeUploadMimeType(mimeType);
  const normalizedFilename = normalizeSourceFilename(sourceFilename);
  assertExtensionMatchesMime(normalizedFilename, normalizedMime);
  const normalizedKind = normalizeAssetKind(assetKind);
  const normalizedName = normalizeAssetName(name, normalizedFilename);

  let safeBuffer = buffer;
  if (normalizedMime === 'image/png') {
    assertPngSignature(buffer);
  } else {
    safeBuffer = sanitizeSvgBuffer(buffer);
  }

  const metadata = await inspectImage(safeBuffer, normalizedMime);
  return Object.freeze({
    buffer: safeBuffer,
    mimeType: normalizedMime,
    sourceFilename: normalizedFilename,
    assetKind: normalizedKind,
    name: normalizedName,
    ...metadata
  });
}

module.exports = {
  MAX_LABEL_ASSET_UPLOAD_BYTES,
  MAX_LABEL_ASSET_PIXELS,
  LABEL_IMAGE_ASSET_KINDS,
  LABEL_IMAGE_UPLOAD_MIME_TYPES,
  LabelAssetUploadError,
  sanitizeSvgBuffer,
  prepareLabelAssetUpload
};
