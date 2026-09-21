'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');
const { analyzeRequirementNumber } = require('./lotRequirementNumberPolicy');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Unit Browser uses stable minimum column widths instead of compressing summary values together', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.tech-units-clean-results-panel \{[\s\S]*?--tu-table-base-width:\s*1220px;[\s\S]*?--tu-unit-base-width:\s*445px;[\s\S]*?--tu-unit-max-width:\s*480px;/);
  assert.match(css, /\.tech-units-table \{[\s\S]*?min-width:\s*var\(--tu-table-base-width, 1220px\);[\s\S]*?table-layout:\s*fixed;/);
  assert.match(css, /\.tech-units-col--unit_weight \{[\s\S]*?width:\s*var\(--tu-unit-column-width\);/);
  assert.match(css, /\.tech-units-col--grow-1 \{[\s\S]*?var\(--tu-secondary-growth-unit\)/);
});

test('Unit summary values wrap fully without ellipsis truncation', () => {
  const css = read('public/css/app.css');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(css, /\.tech-unit-summary-spec > strong,[\s\S]*?\.tech-unit-summary-id-value \{[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(table, /tech-unit-summary-weight-label">Current lot weight<\/span>\s*<strong>/);
  assert.match(css, /\.tech-unit-summary-weight-value \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
});

test('all Unit Browser entry points use the shared responsive CSS scope', () => {
  assert.match(read('views/partials/head.ejs'), /\/css\/app\.css\?v=/);
  for (const file of ['views/pages/tech-units.ejs', 'views/pages/tech-unit-detail.ejs', 'views/pages/tech-unit-form.ejs']) {
    const page = read(file);
    assert.match(page, /<body class="css-scope-tech-units">/);
    assert.doesNotMatch(page, /tech-units-clean\.css/);
  }
});

test('Battery Health accepts 60 for every supported Lot requirement comparison', () => {
  const field = getLotRequirementField('battery_health');

  assert.ok(field);
  assert.deepEqual(field.allowedOperators, ['equals', 'greater_equal', 'less_equal']);

  for (const operatorCode of field.allowedOperators) {
    const analysis = analyzeRequirementNumber(field, '60');
    assert.equal(analysis.valid, true, `${operatorCode} should accept 60`);
    assert.equal(analysis.numericValue, 60);
  }
});

test('Stage 10W.1 migration activates Battery Health in the Lot requirement type catalog', () => {
  const sql = read('sql/2026-08-stage-10w1-unit-browser-responsive-battery-requirement.sql');
  const applyScript = read('scripts/apply-stage-10w1-unit-browser-responsive-battery-requirement.sh');

  assert.match(sql, /WHERE code = 'lot_requirement_types'/);
  assert.match(sql, /'battery_health',[\s\S]*?'Battery Health',[\s\S]*?'battery_health',[\s\S]*?1/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE[\s\S]*?is_active = 1/);
  assert.match(applyScript, /found %s battery_health value\(s\) outside lot_requirement_types/);
  assert.match(applyScript, /Battery Health Lot requirement configuration verified complete/);
});
