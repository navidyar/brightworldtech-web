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
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /Stage 10W\.1: responsive Unit Browser readability/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-table \{[\s\S]*?min-width:\s*1370px;[\s\S]*?table-layout:\s*auto;/);
  assert.match(css, /:is\(th, td\):nth-child\(1\)[\s\S]*?min-width:\s*340px;/);
  assert.match(css, /:is\(th, td\):nth-child\(2\)[\s\S]*?min-width:\s*145px;/);
  assert.match(css, /:is\(th, td\):nth-child\(4\)[\s\S]*?min-width:\s*265px;/);
});

test('Unit summary values wrap fully without ellipsis truncation', () => {
  const css = read('public/css/tech-units-clean.css');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(css, /\.tech-unit-summary-spec > strong,[\s\S]*?\.tech-unit-summary-id-value \{[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(table, /tech-unit-summary-weight-label">Current lot weight<\/span>\s*<strong>/);
  assert.match(css, /\.tech-unit-summary-weight-value \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
});

test('all Unit Browser entry points use the responsive cache-busted stylesheet', () => {
  const expected = 'tech-units-clean.css?v=20260804-stage10w1-responsive-browser';

  assert.match(read('views/pages/tech-units.ejs'), new RegExp(expected.replace(/[?.]/g, '\\$&')));
  assert.match(read('views/pages/tech-unit-detail.ejs'), new RegExp(expected.replace(/[?.]/g, '\\$&')));
  assert.match(read('views/pages/tech-unit-form.ejs'), new RegExp(expected.replace(/[?.]/g, '\\$&')));
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
