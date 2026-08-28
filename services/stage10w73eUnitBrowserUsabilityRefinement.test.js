'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit Browser allows up to four optional display groups consistently', () => {
  const registry = require('../config/unitBrowserColumnRegistry');
  const modal = read('views/fragments/lot-unit-browser-layout-modal.ejs');
  const script = read('public/js/lot-unit-browser-layout.js');

  assert.equal(registry.MAX_VISIBLE_OPTIONAL_COLUMNS, 4);
  assert.match(modal, /Number\(maxVisibleOptionalColumns\) \|\| 4/);
  assert.match(script, /Number\(form\.dataset\.lotUnitBrowserMaxVisible\) \|\| 4/);
});

test('Created timestamp keeps time beside the date', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /tech-unit-summary-created-time/);
  assert.match(css, /\.tech-unit-summary-created \{[\s\S]*?display: flex;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.tech-unit-summary-created-time \{[\s\S]*?white-space: nowrap;/);
});

test('Search textbox guidance documents shorthand capacity keys and searchable identifiers', () => {
  const page = read('views/pages/tech-units.ejs');

  assert.match(page, /memory:8 \(M:8\)/);
  assert.match(page, /storage:512 \(S:512\)/);
  assert.match(page, /Asset Tags/);
  assert.match(page, /Recovery Number/);
  assert.match(page, /BIOS Serial/);
  assert.match(page, /Unit Serial/);
});

test('existing broad identifier search supports the documented identifier families', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /u\.asset_number = \?/);
  assert.match(model, /FROM unit_identifiers ui_search/);
  assert.match(model, /ui_search\.identifier_value LIKE \?/);
  assert.match(model, /ui_search\.normalized_value LIKE \?/);
});

test('Unit Weight header receives only the requested additional left offset', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /tech-units-browser-header--unit_weight/);
  assert.match(css, /\.tech-units-browser-header--unit_weight \{[\s\S]*?padding-left: calc\(var\(--tu-cell-inline-padding\) \+ 10px\);/);
});

test('changed Browser CSS and configuration script are cache-busted on their consumers', () => {
  const cssVersion = '/css/tech-units-clean.css?v=20260826-stage10w73e-browser-usability';
  for (const file of ['views/pages/tech-units.ejs', 'views/pages/tech-unit-detail.ejs', 'views/pages/tech-unit-form.ejs']) {
    assert.match(read(file), new RegExp(cssVersion.replace(/[?.]/g, '\\$&')));
  }
  assert.match(read('views/pages/management-lot-detail.ejs'), /lot-unit-browser-layout\.js\?v=20260826-stage10w73e/);
});

