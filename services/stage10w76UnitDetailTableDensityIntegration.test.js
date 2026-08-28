'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit Details opts into shared compact/fitting table utilities only for single-unit rendering', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(
    table,
    /tech-units-table<%= isSingleUnitViewPage \? ' table-density-compact table-layout-auto-fit table-leading-column-floor' : '' %>/
  );
  assert.match(table, /const isSingleUnitViewPage = typeof singleUnitView !== 'undefined' && Boolean\(singleUnitView\);/);
});

test('shared app table utilities retain a fixed compact column gutter and release reserved column floors', () => {
  const css = read('public/css/app.css');

  assert.match(css, /table\.table-density-compact :is\(th, td\)[\s\S]*?padding-right: 8px;[\s\S]*?padding-left: 8px;/);
  assert.match(css, /table\.table-layout-auto-fit[\s\S]*?min-width: 0;[\s\S]*?table-layout: auto;/);
  assert.match(css, /table\.table-layout-auto-fit col[\s\S]*?width: auto;/);
});

test('Unit Details preserves the Unit / Weight floor and a readable leading-column boundary', () => {
  const css = read('public/css/app.css');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /--table-leading-column-min-width: <%= browserPresentation\.unitColumnMinimumWidthPx %>px/);
  assert.match(css, /table\.table-leading-column-floor col:first-child[\s\S]*?width: var\(--table-leading-column-min-width, auto\);/);
  assert.match(css, /table\.table-leading-column-floor :is\(th, td\):first-child[\s\S]*?min-width: var\(--table-leading-column-min-width, 0\);[\s\S]*?padding-right: 12px;/);
  assert.match(css, /table\.table-leading-column-floor :is\(th, td\):nth-child\(2\)[\s\S]*?padding-left: 12px;/);
  assert.match(read('config/unitBrowserColumnRegistry.js'), /key: 'unit_weight'[\s\S]*?minimumWidthPx: 445/);
});

test('Unit Browser tuned spacing and width contracts remain unchanged', () => {
  const css = read('public/css/tech-units-clean.css');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(css, /--tu-cell-inline-padding: clamp\(5px, 0\.42cqi, 8px\)/);
  assert.match(css, /tech-units-browser-header--compact[\s\S]*?clamp\(4px, 0\.32cqi, 6px\)/);
  assert.match(css, /tech-units-browser-header--tight[\s\S]*?clamp\(3px, 0\.24cqi, 5px\)/);
  assert.match(css, /tech-units-browser-header--actions[\s\S]*?clamp\(4px, 0\.3cqi, 6px\)/);
  assert.match(css, /tech-units-browser-header--unit_weight[\s\S]*?padding-left: calc\(var\(--tu-cell-inline-padding\) \+ 10px\);/);
  assert.match(table, /--tu-table-base-width: <%= browserPresentation\.tableMinimumWidthPx %>px/);
  assert.match(table, /--tu-column-base-width: <%= column\.minimumWidthPx %>px/);
});

test('shared app stylesheet cache key advances without changing page-specific Units stylesheet key', () => {
  const head = read('views/partials/head.ejs');
  const detailPage = read('views/pages/tech-unit-detail.ejs');

  assert.match(head, /\/css\/app\.css\?v=[^"\'\s>]+/);
  assert.match(detailPage, /\/css\/tech-units-clean\.css\?v=20260826-stage10w73e-browser-usability/);
});
