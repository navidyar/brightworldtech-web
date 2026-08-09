'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Lot detail title preserves whole words and receives the full heading row at narrower desktop widths', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /\.lot-detail-page-heading > div:first-child\s*\{[\s\S]*?flex:\s*1 1 auto[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(css, /\.lot-detail-page-heading h1\s*\{[\s\S]*?overflow-wrap:\s*normal[\s\S]*?word-break:\s*normal[\s\S]*?hyphens:\s*none/);
  assert.doesNotMatch(css, /\.lot-detail-page-heading h1\s*\{\s*overflow-wrap:\s*anywhere;/);
  assert.match(css, /@media \(max-width:\s*1120px\)[\s\S]*?\.lot-detail-page-heading\s*\{[\s\S]*?flex-direction:\s*column/);
});

test('Intentional Duplicate is independent of same-Unit move or takeover eligibility', () => {
  const model = read('models/techUnitModel.js');
  const view = read('views/fragments/tech-unit-duplicate-check.ejs');

  assert.match(model, /BWT_DUPLICATE_ASSUMPTION_ALREADY_ASSIGNED_IN_DESTINATION[\s\S]*?Intentional Duplicate request/);
  assert.match(view, /hasIntentionalDuplicateDestination/);
  assert.match(view, /Request Intentional Duplicate/);
  assert.match(view, /different physical unit that reuses the serial/);
});

test('client unlocks Intentional Duplicate after Lot selection and server still validates the full intake', () => {
  const client = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');

  assert.match(client, /function getIntentionalDuplicateRequestReadiness\(form\)[\s\S]*?const hasAssignableLot = Boolean\(lotSelect/);
  assert.doesNotMatch(client, /function getIntentionalDuplicateRequestReadiness\(form\)[\s\S]{0,900}missingLabels\.push\('a Unit Category'\)/);
  assert.doesNotMatch(client, /function getIntentionalDuplicateRequestReadiness\(form\)[\s\S]{0,900}missingLabels\.push\('a Unit Status'\)/);
  assert.match(controller, /renderIntentionalDuplicateRequestModal[\s\S]*?const validationErrors = await validateUnitForm\(formData, formOptions, 'create'\)/);
  assert.match(controller, /createIntentionalDuplicateRequest[\s\S]*?const validationErrors = await validateUnitForm\(formData, formOptions, 'create'\)/);
});

test('updated page assets force browsers to load the refined Lot and Unit form behavior', () => {
  const lotDetail = read('views/pages/management-lot-detail.ejs');
  const lotBrowser = read('views/pages/management-lots.ejs');
  const lotNew = read('views/pages/management-lot-new.ejs');
  const unitBrowser = read('views/pages/tech-units.ejs');
  const unitForm = read('views/pages/tech-unit-form.ejs');

  [lotDetail, lotBrowser, lotNew].forEach((markup) => {
    assert.match(markup, /lots\.css\?v=20260804-stage10w2-refinements/);
  });
  [unitBrowser, unitForm].forEach((markup) => {
    assert.match(markup, /tech-unit-form\.js\?v=20260804-stage10w2-refinements/);
  });
});
