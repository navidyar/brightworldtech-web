'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes only one-step Send Backward and Bring Forward layer controls', () => {
  const view = source('views/pages/management-label-builder.ejs');
  assert.match(view, /data-builder-layer="-1">Send Backward</);
  assert.match(view, /data-builder-layer="1">Bring Forward</);
  assert.match(view, /data-builder-layer-position/);
  assert.doesNotMatch(view, /Bring to Front|Send to Back/);
});

test('Builder persists layer order by reordering the structured elements array', () => {
  const js = source('public/js/label-builder.js');
  assert.match(js, /function moveSelectedLayer\(direction\)/);
  assert.match(js, /state\.layout\.elements\.splice\(currentIndex, 1\)/);
  assert.match(js, /state\.layout\.elements\.splice\(nextIndex, 0, region\)/);
  assert.match(js, /node\.style\.zIndex = String\(layerIndex \+ 1\)/);
});

test('layout normalization preserves element order as the canonical print layer order', () => {
  const { normalizeBuilderLayout } = require('./labelBuilderLayoutPolicy');
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    builderVersion: 2,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 30,
    elements: [
      { id: 'border', type: 'rectangle', x: 1, y: 1, width: 690, height: 340, rotation: 0, fill: 'outline', thickness: 2 },
      { id: 'text', type: 'static_text', x: 30, y: 30, width: 300, height: 40, rotation: 0, text: 'TOP', style: {} }
    ]
  });
  assert.deepEqual(layout.elements.map((element) => element.id), ['border', 'text']);
});

test('production renderer paints later elements after earlier elements so higher layers win', () => {
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(renderer, /for \(const element of safeLayout\.elements\)/);
  assert.match(renderer, /parts\.push\(wrapElementRotation\(elementSvg, element\)\)/);
});
