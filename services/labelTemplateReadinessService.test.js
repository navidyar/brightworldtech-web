'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRepresentativeFieldValues,
  collectReferencedAssetKeys,
  geometryMatchesTemplate
} = require('./labelTemplateReadinessService');
const { buildLabelBuilderGeometry } = require('../config/labelBuilder');

test('representative validation values cover current registered label fields', () => {
  const values = buildRepresentativeFieldValues();
  assert.equal(values['unit.asset_tag'], 'BWT123456');
  assert.equal(values['unit.processor_short'], 'Intel Core i7-10th');
  assert.equal(values['unit.operating_system_short'], 'Win 11 Pro');
  assert.equal(values['lot.name'], '#ARS');
});

test('readiness collects reusable image references once', () => {
  const keyA = `shared_${'a'.repeat(64)}`;
  const keyB = `shared_${'b'.repeat(64)}`;
  assert.deepEqual(collectReferencedAssetKeys({
    backgroundAssetKey: keyA,
    elements: [
      { type: 'image', assetKey: keyA },
      { type: 'image', assetKey: keyB },
      { type: 'static_text', text: 'x' }
    ]
  }), [keyA, keyB]);
});

test('saved template geometry must exactly match the structured layout geometry', () => {
  const geometry = buildLabelBuilderGeometry('29mm_continuous', 45.8);
  const template = {
    printer_profile_code: geometry.printerProfileCode,
    media_code: geometry.mediaCode,
    dpi: geometry.dpi,
    canvas_width_dots: geometry.canvasWidthDots,
    canvas_height_dots: geometry.canvasHeightDots,
    printable_width_dots: geometry.printableWidthDots,
    horizontal_offset_dots: geometry.horizontalOffsetDots,
    feed_margin_dots: geometry.feedMarginDots
  };
  assert.equal(geometryMatchesTemplate(template, geometry), true);
  assert.equal(geometryMatchesTemplate({ ...template, media_code: '62mm_continuous' }, geometry), false);
  assert.equal(geometryMatchesTemplate({ ...template, canvas_height_dots: geometry.canvasHeightDots + 1 }, geometry), false);
});

