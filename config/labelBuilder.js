'use strict';

const {
  QL810W_CONTINUOUS_MEDIA_WIDTHS,
  QL810W_CONTINUOUS_MIN_LENGTH_MM,
  QL810W_CONTINUOUS_MAX_LENGTH_MM,
  QL810W_DEFAULT_LENGTH_MM,
  dotsToMm,
  findQl810wContinuousMedia,
  normalizeContinuousLengthMm,
  buildQl810wContinuousGeometry
} = require('./labelMedia');

const LABEL_BUILDER_SCHEMA_VERSION = 1;
const LABEL_BUILDER_VERSION = 2;
const DEFAULT_LABEL_BUILDER_MEDIA_CODE = '62mm_continuous';
const LABEL_BUILDER_GRID_SIZES = Object.freeze([1, 5, 10]);
const LABEL_BUILDER_ROTATIONS = Object.freeze([0, 90, 180, 270]);
const LABEL_BUILDER_FONT_WEIGHTS = Object.freeze([400, 500, 700]);
const LABEL_BUILDER_TEXT_ALIGNS = Object.freeze(['left', 'center', 'right']);
const LABEL_BUILDER_TEXT_CASES = Object.freeze(['plain', 'upper', 'lower', 'camel']);
const LABEL_BUILDER_FONT_FAMILIES = Object.freeze([
  Object.freeze({ code: 'DejaVu Sans', label: 'DejaVu Sans', cssFamily: '"DejaVu Sans", Arial, sans-serif' }),
  Object.freeze({ code: 'DejaVu Serif', label: 'DejaVu Serif', cssFamily: '"DejaVu Serif", Georgia, serif' }),
  Object.freeze({ code: 'DejaVu Sans Mono', label: 'DejaVu Sans Mono', cssFamily: '"DejaVu Sans Mono", "Courier New", monospace' }),
  Object.freeze({ code: 'Liberation Sans', label: 'Arial / Liberation Sans', cssFamily: 'Arial, "Liberation Sans", sans-serif' }),
  Object.freeze({ code: 'Liberation Serif', label: 'Times / Liberation Serif', cssFamily: '"Times New Roman", "Liberation Serif", serif' }),
  Object.freeze({ code: 'Liberation Mono', label: 'Courier / Liberation Mono', cssFamily: '"Courier New", "Liberation Mono", monospace' }),
  Object.freeze({ code: 'Noto Sans', label: 'Noto Sans', cssFamily: '"Noto Sans", Arial, sans-serif' }),
  Object.freeze({ code: 'Noto Serif', label: 'Noto Serif', cssFamily: '"Noto Serif", Georgia, serif' })
]);
const DEFAULT_LABEL_BUILDER_FONT_FAMILY = 'DejaVu Sans';
const DEFAULT_LABEL_BUILDER_FONT_SIZE = 24;

function inferLabelBuilderMediaWidth(template = {}) {
  return findQl810wContinuousMedia(template.media_code || template.mediaCode)
    || QL810W_CONTINUOUS_MEDIA_WIDTHS.find((media) => Number(template.printable_width_dots ?? template.printableWidthDots) === media.printableWidthDots)
    || null;
}

function inferLabelBuilderLengthMm(template = {}, layout = null) {
  const explicit = normalizeContinuousLengthMm(layout?.lengthMm);
  if (explicit !== null) return explicit;

  const legacyPreset = String(layout?.mediaPresetCode || '').match(/_(\d+(?:\.\d+)?)mm$/i);
  if (legacyPreset) {
    const legacyLength = normalizeContinuousLengthMm(legacyPreset[1]);
    if (legacyLength !== null) return legacyLength;
  }

  return normalizeContinuousLengthMm(dotsToMm(template.canvas_height_dots ?? template.canvasHeightDots), QL810W_DEFAULT_LENGTH_MM);
}

module.exports = {
  LABEL_BUILDER_SCHEMA_VERSION,
  LABEL_BUILDER_VERSION,
  DEFAULT_LABEL_BUILDER_MEDIA_CODE,
  LABEL_BUILDER_GRID_SIZES,
  LABEL_BUILDER_ROTATIONS,
  LABEL_BUILDER_FONT_WEIGHTS,
  LABEL_BUILDER_TEXT_ALIGNS,
  LABEL_BUILDER_TEXT_CASES,
  LABEL_BUILDER_FONT_FAMILIES,
  DEFAULT_LABEL_BUILDER_FONT_FAMILY,
  DEFAULT_LABEL_BUILDER_FONT_SIZE,
  LABEL_BUILDER_MEDIA_WIDTHS: QL810W_CONTINUOUS_MEDIA_WIDTHS,
  LABEL_BUILDER_MIN_LENGTH_MM: QL810W_CONTINUOUS_MIN_LENGTH_MM,
  LABEL_BUILDER_MAX_LENGTH_MM: QL810W_CONTINUOUS_MAX_LENGTH_MM,
  LABEL_BUILDER_DEFAULT_LENGTH_MM: QL810W_DEFAULT_LENGTH_MM,
  findLabelBuilderMediaWidth: findQl810wContinuousMedia,
  inferLabelBuilderMediaWidth,
  inferLabelBuilderLengthMm,
  normalizeLabelBuilderLengthMm: normalizeContinuousLengthMm,
  buildLabelBuilderGeometry: buildQl810wContinuousGeometry
};
