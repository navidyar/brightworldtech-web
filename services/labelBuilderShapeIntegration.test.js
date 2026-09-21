'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes Line and Rectangle content types with vector properties', () => {
  const view = source('views/pages/management-label-builder.ejs');
  assert.match(view, /<option value="line">Line<\/option>/);
  assert.match(view, /<option value="rectangle">Rectangle<\/option>/);
  assert.match(view, /data-builder-shape-thickness/);
  assert.match(view, /Rectangle Style/);
  assert.match(view, /value="outline"/);
  assert.match(view, /value="filled"/);
});

test('Builder previews Line and Rectangle objects as SVG without flattening the canvas', () => {
  const js = source('public/js/label-builder.js');
  const css = source('public/css/label-builder.css');
  assert.match(js, /SHAPE_TYPES = new Set\(\['line', 'rectangle'\]\)/);
  assert.match(js, /renderShapePreview/);
  assert.match(js, /data-builder-region-shape/);
  assert.match(css, /label-builder-region-shape/);
  assert.doesNotMatch(js, /canvas\.toDataURL|canvas\.toBlob/);
});

test('Line and Rectangle instructions remain structured config_json with no asset dependency', () => {
  const policy = source('services/labelBuilderLayoutPolicy.js');
  assert.match(policy, /'line'/);
  assert.match(policy, /'rectangle'/);
  assert.match(policy, /type === 'line'/);
  assert.match(policy, /type === 'rectangle'/);
  assert.match(policy, /normalized\.thickness/);
  assert.match(policy, /normalized\.fill/);
});

test('production renderer emits vector Line and Rectangle SVG instructions', () => {
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(renderer, /renderLineSvg/);
  assert.match(renderer, /renderRectangleSvg/);
  assert.match(renderer, /case 'line'/);
  assert.match(renderer, /case 'rectangle'/);
  assert.match(renderer, /shape-rendering="crispEdges"/);
  assert.match(renderer, /wrapElementRotation/);
});
