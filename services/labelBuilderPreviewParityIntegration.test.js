'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Builder text preview mirrors renderer wrapping and vertical line clipping', () => {
  const builder = read('public/js/label-builder.js');
  const css = read('public/css/features.css');
  const renderer = read('services/labelTemplateLayoutRenderer.js');

  assert.match(builder, /function estimatePreviewTextWidth\(text, fontSize, fontFamily = ''\)/);
  assert.match(builder, /function wrapPreviewTextLines\(value, boxWidth, style\)/);
  assert.match(builder, /const lineHeight = fontSize \* 1\.05;/);
  assert.match(builder, /const maxLines = Math\.max\(1, Math\.floor\(Math\.max\(1, boxHeight\) \/ lineHeight\)\);/);
  assert.match(builder, /getVisibleRegionPreviewLines\(region, boxWidthDots, boxHeightDots\)\.join\('\\n'\)/);
  assert.match(css, /\.label-builder-region-text[\s\S]*white-space: pre;[\s\S]*overflow-wrap: normal;/);

  assert.match(renderer, /function estimateTextWidth\(text, fontSize, fontFamily = ''\)/);
  assert.match(renderer, /function wrapTextLines\(value, box, style\)/);
  assert.match(renderer, /const lineHeight = fontSize \* 1\.05;/);
  assert.match(renderer, /const maxLines = Math\.max\(1, Math\.floor\(box\.height \/ lineHeight\)\);/);
});
