'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Medium text uses a distinct synthetic weight in Builder preview and production SVG', () => {
  const builder = read('public/js/label-builder.js');
  const renderer = read('services/labelTemplateLayoutRenderer.js');

  assert.match(builder, /Number\(region\.style\.fontWeight\) === 500/);
  assert.match(builder, /-webkit-text-stroke/);
  assert.match(builder, /content\.style\.fontWeight = '400'/);

  assert.match(renderer, /style\.fontWeight === 500/);
  assert.match(renderer, /const renderWeight = mediumWeight \? 400 : style\.fontWeight/);
  assert.match(renderer, /paint-order="stroke fill"/);
});
