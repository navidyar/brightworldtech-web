'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Lot selectors use the roomier hierarchy spacing and larger shared child chevron', () => {
  const hierarchyPartial = read('views/partials/hierarchical-lot-options.ejs');
  const parentPartial = read('views/partials/parent-lot-options.ejs');
  const appCss = read('public/css/app.css');
  const formScript = read('public/js/tech-unit-form.js');

  assert.match(hierarchyPartial, /\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0'\.repeat\(optionDepth\)/);
  assert.match(parentPartial, /\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0'\.repeat\(depth\)/);
  assert.match(hierarchyPartial, /optionDepth > 0 \? '❯ ' : ''/);
  assert.match(parentPartial, /depth > 0 \? '❯ ' : ''/);
  assert.match(appCss, /padding-inline-start:\s*18px/);
  assert.match(appCss, /var\(--lot-depth, 0\) \* 26px/);
  assert.match(appCss, /tech-assignable-lot-option--child::before[\s\S]*width:\s*7px[\s\S]*border-right:\s*2px solid currentColor/);
  assert.match(formScript, /tech-assignable-lot-option--child/);
});

test('Lot Details shows direct Unit counts for every child and inclusive totals only when useful', () => {
  const detailPage = read('views/pages/management-lot-detail.ejs');

  assert.match(detailPage, /childLot\.directUnitCount/);
  assert.match(detailPage, /childLot\.descendantUnitCount/);
  assert.match(detailPage, /direct <%= childDirectUnitCount === 1 \? 'unit' : 'units' %>/);
  assert.match(detailPage, /incl\. descendants/);
});
