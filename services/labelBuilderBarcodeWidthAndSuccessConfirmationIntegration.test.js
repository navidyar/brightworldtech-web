'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildCode39BarsToFit } = require('./labelPrintingService');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Code 39 expands to use additional region width while preserving whole-dot geometry', () => {
  const narrowRegion = buildCode39BarsToFit('BWT123456', 260);
  const wideRegion = buildCode39BarsToFit('BWT123456', 620);
  assert.ok(narrowRegion);
  assert.ok(wideRegion);
  assert.ok(wideRegion.width > narrowRegion.width);
  assert.ok(Number.isInteger(wideRegion.narrow));
  assert.ok(Number.isInteger(wideRegion.wide));
  assert.ok(wideRegion.wide / wideRegion.narrow >= 2);
  assert.ok(wideRegion.wide / wideRegion.narrow <= 3);
  assert.ok(wideRegion.width + (wideRegion.quietZone * 2) <= 620);

  // Regression: a short serial on a near-full-width 62 mm / 300 dpi label
  // must advance beyond the old 3/7/3 geometry instead of staying ~504 dots.
  const fullWidthSerial = buildCode39BarsToFit('MXL20357DP', 732);
  assert.ok(fullWidthSerial);
  assert.ok(fullWidthSerial.width >= 620);
  assert.ok(fullWidthSerial.width + (fullWidthSerial.quietZone * 2) <= 732);
  assert.ok(fullWidthSerial.wide / fullWidthSerial.narrow >= 2);
  assert.ok(fullWidthSerial.wide / fullWidthSerial.narrow <= 3);
});

test('Builder preview and production renderer use the same width-fitting Code 39 behavior', () => {
  const builder = source('public/js/label-builder.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  const page = source('views/pages/management-label-builder.ejs');
  assert.match(builder, /buildCode39BarsToFit/);
  assert.match(builder, /for \(let wide = narrow \* 2; wide <= narrow \* 3; wide \+= 1\)/);
  assert.match(builder, /barcode\.width \+ \(quietZone \* 2\) > availableWidth/);
  assert.match(builder, /widthDots/);
  assert.match(renderer, /buildCode39BarsToFit\(safeValue, box\.width\)/);
  assert.match(page, /label-builder\.js\?v=20260918-barcode-width-fit-v2/);
});

test('page success confirmations use one shared 10-second dismiss behavior', () => {
  const head = source('views/partials/head.ejs');
  const script = source('public/js/success-confirmations.js');
  const css = source('public/css/app.css');
  assert.match(head, /success-confirmations\.js/);
  assert.match(script, /const DISMISS_MS = 10000/);
  assert.match(script, /data-auto-dismiss-success/);
  assert.match(css, /width: max-content/);
  assert.match(css, /white-space: nowrap/);
});
