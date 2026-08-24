'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit form renders one compact clickable validation summary above its sections', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const client = read('public/js/tech-unit-form.js');

  assert.match(markup, /data-unit-form-validation-summary[^>]*role="alert"[^>]*hidden/);
  assert.match(markup, /data-unit-form-validation-summary-heading/);
  assert.match(markup, /data-unit-form-validation-summary-list/);
  assert.match(client, /function refreshValidationSummary/);
  assert.match(client, /Please correct \$\{errorControls\.length\} field/);
  assert.match(client, /data-unit-form-validation-focus/);
  assert.match(client, /focusValidationControl\(control\)/);
});

test('validation messages move to module-row or section strips instead of field bottoms', () => {
  const client = read('public/js/tech-unit-form.js');

  assert.match(client, /function getValidationPlacement/);
  assert.match(client, /control\.closest\('\[data-module-row\]'\)/);
  assert.match(client, /type: 'row'/);
  assert.match(client, /type: 'section'/);
  assert.match(client, /unit-form-validation-region--\$\{type\}/);
  assert.match(client, /header\.insertAdjacentElement\('afterend', region\)/);
  assert.match(client, /host\.appendChild\(region\)/);
  assert.doesNotMatch(client, /wrapper\.appendChild\(errorElement\)/);
  assert.doesNotMatch(client, /className = 'unit-form-field-error'/);
});

test('Memory and Storage selection errors share the affected row strip without shifting controls independently', () => {
  const client = read('public/js/tech-unit-form.js');
  const css = read('public/css/tech-units-clean.css');

  assert.match(client, /const invalidSelections = \[\]/);
  assert.match(client, /invalidSelections\.push\(\[control, message\]\)/);
  assert.match(client, /invalidSelections\.forEach\(\(\[control, message\]\) =>/);
  assert.match(client, /showValidationError\(control, message\)/);
  assert.match(css, /\.unit-form-validation-region--row\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.unit-form-validation-region--repeatable/);
  assert.match(css, /\.unit-form-validation-region--section/);
});

test('only invalid controls receive the red field treatment and Stage 10K assets are cache-busted', () => {
  const css = read('public/css/tech-units-clean.css');
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  const formPage = read('views/pages/tech-unit-form.ejs');
  const browserPage = read('views/pages/tech-units.ejs');

  assert.match(css, /\[aria-invalid="true"\]\s*\{/);
  assert.doesNotMatch(css, /\.has-unit-form-validation-error :is\(/);
  assert.match(css, /\.tech-unit-form-validation-summary/);
  assert.match(detailPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-units-clean\.css\?v=/);
  assert.match(browserPage, /tech-units-clean\.css\?v=/);
  assert.match(formPage, /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
  assert.match(browserPage, /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
});
