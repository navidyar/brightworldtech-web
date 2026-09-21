'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes a visual composed-value editor instead of requiring token syntax', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const js = source('public/js/label-builder.js');
  assert.match(view, /<option value="composed_text">Composed Text<\/option>/);
  assert.match(view, /\+ Field/);
  assert.match(view, /\+ Text/);
  assert.match(view, /Common/);
  assert.match(view, /Recent/);
  assert.match(view, /Starter/);
  assert.match(view, /Advanced expression/);
  assert.match(js, /renderComposedEditor/);
  assert.match(js, /moveComposedPart/);
  assert.match(js, /dataTransfer\.setData/);
});

test('learned presets are derived from current config_json assets rather than print history', () => {
  const model = source('models/labelLibraryModel.js');
  const controller = source('controllers/labelLibraryController.js');
  const service = source('services/labelComposedValuePresets.js');
  assert.match(model, /listCurrentTemplateConfigAssets/);
  assert.match(model, /link\.role = 'config_json'/);
  assert.match(model, /template\.status IN \('draft', 'active'\)/);
  assert.match(controller, /loadComposedValuePresets/);
  assert.match(controller, /buildComposedValuePresets/);
  assert.match(service, /templateCount >= 2/);
});

test('Composed Text persists as structured parts and uses the existing text renderer', () => {
  const policy = source('services/labelBuilderLayoutPolicy.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(policy, /type === 'composed_text'/);
  assert.match(policy, /normalized\.parts = normalizePayloadParts/);
  assert.match(policy, /Composed Text region/);
  assert.match(renderer, /case 'composed_text'/);
  assert.match(renderer, /resolveParts\(element\.parts/);
});

test('field registry includes representative preview values for composed-value previews', () => {
  const fields = source('config/labelFieldRegistry.js');
  assert.match(fields, /sampleValue: '16GB'/);
  assert.match(fields, /sampleValue: '256GB'/);
  assert.match(fields, /sampleValue: 'Win 11 Pro'/);
});

test('Composed Text normalization and readiness use the same structured parts contract as code payloads', () => {
  const { normalizeBuilderLayout, inspectLayoutReadiness } = require('./labelBuilderLayoutPolicy');
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    builderVersion: 2,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 30,
    elements: [{
      id: 'composed-1',
      type: 'composed_text',
      x: 10,
      y: 10,
      width: 300,
      height: 40,
      rotation: 0,
      parts: [
        { type: 'field', field: 'unit.ram', format: 'plain' },
        { type: 'static', value: ' | ' },
        { type: 'field', field: 'unit.storage', format: 'upper' }
      ],
      style: { fontFamily: 'DejaVu Sans', fontSize: 22, fontWeight: 400, align: 'left', textCase: 'plain' }
    }]
  });
  assert.equal(layout.elements[0].parts.length, 3);
  assert.equal(layout.elements[0].parts[2].format, 'upper');
  assert.equal(inspectLayoutReadiness(layout).ready, true);
});


test('composed-value parts stay on one row and use the drag handle instead of arrow buttons', () => {
  const css = `${source('public/css/app.css')}\n${source('public/css/features.css')}`;
  const js = source('public/js/label-builder.js');
  assert.match(css, /grid-template-columns: 18px 48px minmax\(0, 1fr\) 36px/);
  assert.match(css, /\.label-builder-composed-part-editor\.is-static[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(104px, 124px\)/);
  assert.match(css, /\.label-builder-composed-part-actions[\s\S]*width: 36px/);
  assert.match(js, /grip\.draggable = true/);
  assert.match(js, /grip\.addEventListener\('dragstart'/);
  assert.doesNotMatch(js, /up\.textContent = '↑'/);
  assert.doesNotMatch(js, /down\.textContent = '↓'/);
});
