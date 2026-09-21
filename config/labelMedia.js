'use strict';

const QL810W_DPI = 300;
const QL810W_DEVICE_WIDTH_DOTS = 720;
const QL810W_CONTINUOUS_MIN_LENGTH_MM = 12.7;
const QL810W_CONTINUOUS_MAX_LENGTH_MM = 1000;
const QL810W_DEFAULT_LENGTH_MM = 30;
const QL810W_FEED_MARGIN_DOTS = 35;

// Brother QL-800/810W raster reference, continuous DK media at 300 dpi.
// The printer always receives 720 raster pins; each roll width uses only the
// documented printable area inside that device-width raster line.
const QL810W_CONTINUOUS_MEDIA_WIDTHS = Object.freeze([
  Object.freeze({ code: '12mm_continuous', label: '12 mm (0.5 in)', widthMm: 12, printableWidthDots: 106, horizontalOffsetDots: 585, rightMarginDots: 29 }),
  Object.freeze({ code: '29mm_continuous', label: '29 mm (1.1 in)', widthMm: 29, printableWidthDots: 306, horizontalOffsetDots: 408, rightMarginDots: 6 }),
  Object.freeze({ code: '38mm_continuous', label: '38 mm (1.5 in)', widthMm: 38, printableWidthDots: 413, horizontalOffsetDots: 295, rightMarginDots: 12 }),
  Object.freeze({ code: '50mm_continuous', label: '50 mm (2.0 in)', widthMm: 50, printableWidthDots: 554, horizontalOffsetDots: 154, rightMarginDots: 12 }),
  Object.freeze({ code: '54mm_continuous', label: '54 mm (2.1 in)', widthMm: 54, printableWidthDots: 590, horizontalOffsetDots: 130, rightMarginDots: 0 }),
  Object.freeze({ code: '62mm_continuous', label: '62 mm (2.4 in)', widthMm: 62, printableWidthDots: 696, horizontalOffsetDots: 12, rightMarginDots: 12 })
]);

function mmToDots(mm, dpi = QL810W_DPI) {
  const value = Number(mm);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round((value * dpi) / 25.4);
}

function dotsToMm(dots, dpi = QL810W_DPI) {
  const value = Number(dots);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(((value * 25.4) / dpi) * 10) / 10;
}

function findQl810wContinuousMedia(code) {
  const normalized = String(code || '').trim();
  return QL810W_CONTINUOUS_MEDIA_WIDTHS.find((media) => media.code === normalized) || null;
}

function normalizeContinuousLengthMm(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number * 10) / 10;
  if (rounded < QL810W_CONTINUOUS_MIN_LENGTH_MM || rounded > QL810W_CONTINUOUS_MAX_LENGTH_MM) return fallback;
  return rounded;
}

function buildQl810wContinuousGeometry(mediaCode, lengthMm) {
  const media = findQl810wContinuousMedia(mediaCode);
  const safeLengthMm = normalizeContinuousLengthMm(lengthMm);
  if (!media || safeLengthMm === null) return null;
  return Object.freeze({
    code: media.code,
    label: media.label,
    widthMm: media.widthMm,
    lengthMm: safeLengthMm,
    printerProfileCode: 'brother_ql810w_300dpi',
    mediaCode: media.code,
    dpi: QL810W_DPI,
    deviceWidthDots: QL810W_DEVICE_WIDTH_DOTS,
    canvasWidthDots: media.printableWidthDots,
    canvasHeightDots: mmToDots(safeLengthMm),
    printableWidthDots: media.printableWidthDots,
    horizontalOffsetDots: media.horizontalOffsetDots,
    rightMarginDots: media.rightMarginDots,
    feedMarginDots: QL810W_FEED_MARGIN_DOTS
  });
}

module.exports = {
  QL810W_DPI,
  QL810W_DEVICE_WIDTH_DOTS,
  QL810W_CONTINUOUS_MIN_LENGTH_MM,
  QL810W_CONTINUOUS_MAX_LENGTH_MM,
  QL810W_DEFAULT_LENGTH_MM,
  QL810W_FEED_MARGIN_DOTS,
  QL810W_CONTINUOUS_MEDIA_WIDTHS,
  mmToDots,
  dotsToMm,
  findQl810wContinuousMedia,
  normalizeContinuousLengthMm,
  buildQl810wContinuousGeometry
};
