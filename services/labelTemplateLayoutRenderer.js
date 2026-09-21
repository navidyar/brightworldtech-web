'use strict';

const sharp = require('sharp');
const QRCode = require('qrcode');
const {
  buildCode39BarsToFit,
  buildBrotherQl810wRaster
} = require('./labelPrintingService');
const {
  LABEL_BUILDER_ROTATIONS,
  LABEL_BUILDER_TEXT_CASES,
  LABEL_BUILDER_FONT_FAMILIES,
  DEFAULT_LABEL_BUILDER_FONT_FAMILY
} = require('../config/labelBuilder');

const FONT_FAMILY_CODES = new Set(LABEL_BUILDER_FONT_FAMILIES.map((font) => font.code));

const MAX_TEXT_LENGTH = 500;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeComposedStaticText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function normalizeLayout(layout) {
  if (!layout || typeof layout !== 'object' || Number(layout.schemaVersion) !== 1) {
    throw new Error('Label template layout must use schemaVersion 1.');
  }
  if (!Array.isArray(layout.elements)) {
    throw new Error('Label template layout elements are missing.');
  }
  return layout;
}

function normalizeTemplate(template = {}) {
  const width = Number(template.canvas_width_dots ?? template.canvasWidthDots);
  const height = Number(template.canvas_height_dots ?? template.canvasHeightDots);
  const printableWidthDots = Number(template.printable_width_dots ?? template.printableWidthDots ?? width);
  const horizontalOffsetDots = Number(template.horizontal_offset_dots ?? template.horizontalOffsetDots ?? 0);
  const feedMarginDots = Number(template.feed_margin_dots ?? template.feedMarginDots ?? 35);
  const printerProfileCode = String(template.printer_profile_code ?? template.printerProfileCode ?? '');
  const mediaCode = String(template.media_code ?? template.mediaCode ?? '62mm_continuous');
  const deviceWidthDots = Number(template.device_width_dots ?? template.deviceWidthDots ?? 720);

  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error('Label template canvas dimensions are invalid.');
  }
  if (!Number.isSafeInteger(deviceWidthDots) || deviceWidthDots !== 720) {
    throw new Error('Brother QL-810W device width must be 720 dots.');
  }
  if (!Number.isSafeInteger(printableWidthDots) || printableWidthDots <= 0 || printableWidthDots > deviceWidthDots) {
    throw new Error('Label template printable width is invalid.');
  }
  if (!Number.isSafeInteger(horizontalOffsetDots) || horizontalOffsetDots < 0 || horizontalOffsetDots + printableWidthDots > deviceWidthDots) {
    throw new Error('Label template horizontal print offset is invalid.');
  }

  return Object.freeze({
    width,
    height,
    printableWidthDots,
    horizontalOffsetDots,
    feedMarginDots,
    printerProfileCode,
    mediaCode,
    deviceWidthDots
  });
}

function resolveFieldValue(fieldValues, field, fallback = '') {
  const key = String(field || '').trim();
  if (!key) return normalizeText(fallback);
  if (!Object.prototype.hasOwnProperty.call(fieldValues || {}, key)) return normalizeText(fallback);
  const value = fieldValues[key];
  return normalizeText(value === null || value === undefined || value === '' ? fallback : value);
}

function applyFormat(value, format) {
  const normalized = normalizeText(value);
  switch (String(format || 'plain').trim().toLowerCase()) {
    case 'plain': return normalized;
    case 'upper': return normalized.toUpperCase();
    case 'lower': return normalized.toLowerCase();
    case 'camel': return normalized.toLowerCase().replace(/\b[a-z]+\b/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
    default: throw new Error(`Unsupported label field format: ${format}.`);
  }
}

function normalizeRotation(value) {
  const rotation = Number(value ?? 0);
  return LABEL_BUILDER_ROTATIONS.includes(rotation) ? rotation : 0;
}

function getUnrotatedRenderElement(element = {}) {
  const rotation = normalizeRotation(element.rotation);
  if (rotation !== 90 && rotation !== 270) return element;
  const box = normalizeBox(element);
  const centerX = box.x + (box.width / 2);
  const centerY = box.y + (box.height / 2);
  return {
    ...element,
    x: centerX - (box.height / 2),
    y: centerY - (box.width / 2),
    width: box.height,
    height: box.width
  };
}

function wrapElementRotation(svg, element = {}) {
  if (!svg) return '';
  const rotation = normalizeRotation(element.rotation);
  if (!rotation) return svg;
  const box = normalizeBox(element);
  const centerX = box.x + (box.width / 2);
  const centerY = box.y + (box.height / 2);
  return `<g transform="rotate(${rotation} ${centerX} ${centerY})">${svg}</g>`;
}

function resolvePayload(payload, fieldValues) {
  if (!payload || typeof payload !== 'object') return '';
  if (payload.type === 'static') return normalizeText(payload.value);
  if (payload.type === 'field') {
    return applyFormat(resolveFieldValue(fieldValues, payload.field, payload.fallback || ''), payload.format || 'plain');
  }
  if (payload.type === 'composed') {
    return resolveParts(payload.parts, fieldValues);
  }
  throw new Error(`Unsupported label payload type: ${payload.type || '(blank)'}.`);
}

function resolveParts(parts, fieldValues) {
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => {
    if (!part || typeof part !== 'object') return '';
    if (part.type === 'static') return normalizeComposedStaticText(part.value);
    if (part.type === 'field') {
      return applyFormat(resolveFieldValue(fieldValues, part.field, part.fallback || ''), part.format || 'plain');
    }
    throw new Error(`Unsupported composed label part type: ${part.type || '(blank)'}.`);
  }).join('');
}

function normalizeBox(element = {}) {
  const x = Number(element.x);
  const y = Number(element.y);
  const width = Number(element.width);
  const height = Number(element.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Label element ${element.id || '(unnamed)'} has an invalid position or size.`);
  }
  return { x, y, width, height };
}

function normalizeTextStyle(style = {}, box) {
  const requestedSize = Number(style.fontSize || 20);
  const fontSize = Math.max(6, Math.min(Number.isFinite(requestedSize) ? requestedSize : 20, box.height));
  const weight = Number(style.fontWeight || 400);
  const align = ['left', 'center', 'right'].includes(style.align) ? style.align : 'left';
  const fontFamily = FONT_FAMILY_CODES.has(String(style.fontFamily || '').trim())
    ? String(style.fontFamily).trim()
    : DEFAULT_LABEL_BUILDER_FONT_FAMILY;
  const textCase = LABEL_BUILDER_TEXT_CASES.includes(String(style.textCase || '').trim())
    ? String(style.textCase).trim()
    : 'plain';
  return {
    fontFamily,
    fontSize,
    fontWeight: Number.isFinite(weight) ? Math.max(100, Math.min(900, weight)) : 400,
    align,
    textCase,
    overflow: style.overflow === 'shrink' ? 'shrink' : 'clip'
  };
}

function fitText(value, box, style) {
  const text = normalizeText(value);
  if (!text) return { text: '', fontSize: style.fontSize };
  if (style.overflow !== 'shrink') return { text, fontSize: style.fontSize };

  let fontSize = style.fontSize;
  while (fontSize > 6 && text.length * fontSize * 0.59 > box.width) fontSize -= 1;
  if (text.length * fontSize * 0.59 <= box.width) return { text, fontSize };

  const maxChars = Math.max(1, Math.floor(box.width / (fontSize * 0.59)));
  if (text.length <= maxChars) return { text, fontSize };
  return {
    text: maxChars <= 3 ? text.slice(0, maxChars) : `${text.slice(0, maxChars - 3)}...`,
    fontSize
  };
}

function renderTextSvg(value, element) {
  const box = normalizeBox(element);
  const style = normalizeTextStyle(element.style, box);
  const casedValue = applyFormat(value, style.textCase);
  const fitted = fitText(casedValue, box, style);
  if (!fitted.text) return '';

  const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start';
  const x = style.align === 'center' ? box.x + (box.width / 2) : style.align === 'right' ? box.x + box.width : box.x;
  const baseline = box.y + Math.min(box.height, fitted.fontSize);
  const mediumWeight = style.fontWeight === 500;
  const renderWeight = mediumWeight ? 400 : style.fontWeight;
  const mediumStrokeWidth = mediumWeight ? Math.max(0.7, Math.min(2, fitted.fontSize * 0.025)) : 0;
  const mediumStroke = mediumWeight
    ? ` stroke="#000000" stroke-width="${mediumStrokeWidth.toFixed(2)}" paint-order="stroke fill" stroke-linejoin="round"`
    : '';
  return `<text x="${x}" y="${baseline}" font-family="${escapeXml(style.fontFamily)}" font-size="${fitted.fontSize}" font-weight="${renderWeight}" text-anchor="${anchor}" fill="#000000"${mediumStroke}>${escapeXml(fitted.text)}</text>`;
}

function buildBarcodeSvg(value, element) {
  const box = normalizeBox(element);
  if (String(element.symbology || 'code39').toLowerCase() !== 'code39') {
    throw new Error(`Unsupported barcode symbology: ${element.symbology || '(blank)'}.`);
  }
  const safeValue = normalizeText(value, 48).toUpperCase().replace(/[^0-9A-Z.\- $/+%]/g, '');
  if (!safeValue) return '';

  const requestedHumanReadableFontSize = Number(element.humanReadableFontSize);
  const humanReadableFontSize = Number.isSafeInteger(requestedHumanReadableFontSize)
    && requestedHumanReadableFontSize >= 8
    && requestedHumanReadableFontSize <= 48
    ? requestedHumanReadableFontSize
    : 20;
  const textHeight = element.showText
    ? Math.min(Math.max(0, box.height - 1), Math.max(12, humanReadableFontSize + 4))
    : 0;
  const barHeight = Math.max(1, box.height - textHeight);
  const barcode = buildCode39BarsToFit(safeValue, box.width);
  if (!barcode) throw new Error(`Barcode value does not fit element ${element.id || '(unnamed)'}.`);

  const startX = Math.floor(box.x + ((box.width - barcode.width) / 2));
  const bars = barcode.bars
    .map((bar) => `<rect x="${startX + bar.x}" y="${box.y}" width="${bar.width}" height="${barHeight}" fill="#000000"/>`)
    .join('');

  if (!element.showText) return bars;
  const textElement = {
    ...element,
    y: box.y + barHeight,
    height: textHeight,
    style: { fontFamily: 'Liberation Sans', fontSize: Math.min(humanReadableFontSize, Math.max(6, textHeight - 2)), fontWeight: 700, align: 'center', overflow: 'shrink' }
  };
  return `${bars}${renderTextSvg(safeValue, textElement)}`;
}

function renderImageSvg(element, assetDataUris) {
  const box = normalizeBox(element);
  const assetKey = String(element.assetKey || '').trim();
  const dataUri = assetDataUris && assetDataUris[assetKey];
  if (!assetKey || !dataUri) {
    throw new Error(`Label image asset ${assetKey || '(blank)'} is unavailable.`);
  }
  const preserveAspectRatio = element.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  return `<image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" href="${escapeXml(dataUri)}" preserveAspectRatio="${preserveAspectRatio}"/>`;
}

function renderQrSvg(element, qrDataUris) {
  const box = normalizeBox(element);
  const dataUri = qrDataUris && qrDataUris[String(element.id || '')];
  if (!dataUri) throw new Error(`QR element ${element.id || '(unnamed)'} could not be generated.`);
  return `<image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" href="${escapeXml(dataUri)}" preserveAspectRatio="xMidYMid meet"/>`;
}

function normalizeShapeThickness(value) {
  const thickness = Number(value ?? 2);
  return Number.isSafeInteger(thickness) ? Math.max(1, Math.min(40, thickness)) : 2;
}

function renderLineSvg(element) {
  const box = normalizeBox(element);
  const thickness = normalizeShapeThickness(element.thickness);
  const y = box.y + (box.height / 2);
  return `<line x1="${box.x}" y1="${y}" x2="${box.x + box.width}" y2="${y}" stroke="#000000" stroke-width="${thickness}" stroke-linecap="butt" shape-rendering="crispEdges"/>`;
}

function renderRectangleSvg(element) {
  const box = normalizeBox(element);
  if (element.fill === 'filled') {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="#000000" shape-rendering="crispEdges"/>`;
  }
  const thickness = normalizeShapeThickness(element.thickness);
  const inset = thickness / 2;
  const width = Math.max(0, box.width - thickness);
  const height = Math.max(0, box.height - thickness);
  return `<rect x="${box.x + inset}" y="${box.y + inset}" width="${width}" height="${height}" fill="none" stroke="#000000" stroke-width="${thickness}" shape-rendering="crispEdges"/>`;
}

async function buildQrDataUris(layout, fieldValues) {
  const output = {};
  for (const element of Array.isArray(layout?.elements) ? layout.elements : []) {
    if (!element || element.type !== 'qr') continue;
    const id = String(element.id || '').trim();
    if (!id) throw new Error('Every QR label element requires a stable id.');
    const payload = resolvePayload(element.payload, fieldValues);
    if (!payload) throw new Error(`QR element ${id} resolved to an empty payload.`);
    const errorCorrection = String(element.errorCorrection || 'M').trim().toUpperCase();
    if (!['L', 'M', 'Q', 'H'].includes(errorCorrection)) {
      throw new Error(`QR element ${id} has an invalid error-correction level.`);
    }
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: errorCorrection,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
    output[id] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  return output;
}

function buildLayoutSvg({ layout, template, fieldValues = {}, assetDataUris = {}, qrDataUris = {}, outputScale = 1 }) {
  const safeLayout = normalizeLayout(layout);
  const safeTemplate = normalizeTemplate(template);
  const scale = Number.isFinite(Number(outputScale)) && Number(outputScale) > 0 ? Number(outputScale) : 1;
  const parts = [
    `<svg width="${Math.round(safeTemplate.width * scale)}" height="${Math.round(safeTemplate.height * scale)}" viewBox="0 0 ${safeTemplate.width} ${safeTemplate.height}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>'
  ];

  if (safeLayout.backgroundAssetKey) {
    parts.push(renderImageSvg({
      id: 'background',
      type: 'image',
      assetKey: safeLayout.backgroundAssetKey,
      x: 0,
      y: 0,
      width: safeTemplate.width,
      height: safeTemplate.height,
      fit: 'contain'
    }, assetDataUris));
  }

  parts.push('<g text-rendering="geometricPrecision">');
  for (const element of safeLayout.elements) {
    if (!element || typeof element !== 'object') continue;
    const renderElement = getUnrotatedRenderElement(element);
    let elementSvg = '';
    switch (element.type) {
      case 'static_text':
        elementSvg = renderTextSvg(element.text || '', renderElement);
        break;
      case 'dynamic_text':
        elementSvg = renderTextSvg(
          applyFormat(resolveFieldValue(fieldValues, element.source?.field, element.source?.fallback || ''), element.source?.format || 'plain'),
          renderElement
        );
        break;
      case 'composed_text':
        elementSvg = renderTextSvg(resolveParts(element.parts, fieldValues), renderElement);
        break;
      case 'barcode':
        elementSvg = buildBarcodeSvg(resolvePayload(element.payload, fieldValues), renderElement);
        break;
      case 'image':
        elementSvg = renderImageSvg(renderElement, assetDataUris);
        break;
      case 'qr':
        elementSvg = renderQrSvg(renderElement, qrDataUris);
        break;
      case 'line':
        elementSvg = renderLineSvg(renderElement);
        break;
      case 'rectangle':
        elementSvg = renderRectangleSvg(renderElement);
        break;
      default:
        throw new Error(`Unsupported label element type: ${element.type || '(blank)'}.`);
    }
    parts.push(wrapElementRotation(elementSvg, element));
  }
  parts.push('</g>', '</svg>');
  return parts.join('');
}

function createBitmap(width, height, monochromeBytes) {
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = monochromeBytes[index] < 128 ? 1 : 0;
  return { width, height, pixels };
}

function padBitmapToDeviceWidth(bitmap, { deviceWidthDots, horizontalOffsetDots }) {
  if (bitmap.width === deviceWidthDots) return bitmap;
  if (bitmap.width + horizontalOffsetDots > deviceWidthDots) {
    throw new Error('Rendered label does not fit inside the printer device width.');
  }
  const pixels = new Uint8Array(deviceWidthDots * bitmap.height);
  for (let y = 0; y < bitmap.height; y += 1) {
    const sourceStart = y * bitmap.width;
    const targetStart = (y * deviceWidthDots) + horizontalOffsetDots;
    pixels.set(bitmap.pixels.subarray(sourceStart, sourceStart + bitmap.width), targetStart);
  }
  return { width: deviceWidthDots, height: bitmap.height, pixels };
}

async function renderLayout({ layout, template, fieldValues = {}, assetDataUris = {} }) {
  const safeTemplate = normalizeTemplate(template);
  const qrDataUris = await buildQrDataUris(layout, fieldValues);
  const svg = buildLayoutSvg({ layout, template, fieldValues, assetDataUris, qrDataUris });
  const rendered = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(176)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (rendered.info.width !== safeTemplate.width || rendered.info.height !== safeTemplate.height) {
    throw new Error('Rendered Label Library dimensions do not match the template canvas.');
  }
  if (safeTemplate.printerProfileCode !== 'brother_ql810w_300dpi') {
    throw new Error(`Unsupported label printer profile: ${safeTemplate.printerProfileCode || '(blank)'}.`);
  }

  const logicalBitmap = createBitmap(rendered.info.width, rendered.info.height, rendered.data);
  const bitmap = padBitmapToDeviceWidth(logicalBitmap, safeTemplate);
  const raster = buildBrotherQl810wRaster(bitmap, {
    feedMarginDots: safeTemplate.feedMarginDots,
    mediaCode: safeTemplate.mediaCode
  });
  const previewSvg = buildLayoutSvg({ layout, template, fieldValues, assetDataUris, qrDataUris, outputScale: 2 });
  const previewPng = await sharp(Buffer.from(previewSvg))
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return Object.freeze({
    svg,
    raster,
    previewDataUri: `data:image/png;base64,${previewPng.toString('base64')}`
  });
}

module.exports = {
  normalizeLayout,
  normalizeTemplate,
  resolveFieldValue,
  resolvePayload,
  resolveParts,
  buildQrDataUris,
  buildLayoutSvg,
  normalizeRotation,
  getUnrotatedRenderElement,
  wrapElementRotation,
  padBitmapToDeviceWidth,
  renderLayout
};
