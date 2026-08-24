'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shared custom Lot picker is loaded globally and only targets hierarchy Lot selects', () => {
  const head = read('views/partials/head.ejs');
  const script = read('public/js/hierarchical-lot-select.js');

  assert.match(head, /hierarchical-lot-select\.js\?v=20260819-stage10w68y-mouse-focus-continuity/);
  assert.match(script, /const SELECTOR = 'select\[data-hierarchical-lot-select\]'/);
  assert.match(script, /document\.addEventListener\('DOMContentLoaded'/);
  assert.match(script, /document\.addEventListener\('htmx:afterSwap'/);
  assert.match(script, /document\.addEventListener\('htmx:beforeSwap', closeAll\)/);
});

test('custom Lot picker keeps the native select authoritative and preserves change-driven workflows', () => {
  const script = read('public/js/hierarchical-lot-select.js');

  assert.match(script, /wrapper\.append\(select, trigger\)/);
  assert.match(script, /select\.classList\.add\('hierarchical-lot-picker-native'\)/);
  assert.match(script, /select\.selectedIndex = index/);
  assert.match(script, /select\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(script, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(script, /select\.addEventListener\('invalid'/);
  assert.match(script, /observer\.observe\(select, \{ attributes: true, childList: true, subtree: true \}\)/);
});

test('Lot rows render from their own label with exact CSS hierarchy depth and the current drawn chevron', () => {
  const hierarchyPartial = read('views/partials/hierarchical-lot-options.ejs');
  const parentPartial = read('views/partials/parent-lot-options.ejs');
  const script = read('public/js/hierarchical-lot-select.js');
  const css = read('public/css/app.css');

  assert.match(hierarchyPartial, /data-lot-label="<%= optionDisplayName %><%= countText %>"/);
  assert.match(parentPartial, /data-lot-label="<%= parentLot\.lot_name %><%= lotCode %><%= hiddenStatus %>"/);
  assert.match(script, /button\.style\.setProperty\('--lot-depth', String\(depth\)\)/);
  assert.match(script, /hierarchical-lot-picker-option--root/);
  assert.match(script, /hierarchical-lot-picker-option--child/);
  assert.match(css, /hierarchical-lot-picker-option--child[\s\S]*var\(--lot-depth, 0\) \* 30px/);
  assert.match(css, /hierarchical-lot-picker-option--child::before[\s\S]*width:\s*4\.5px[\s\S]*height:\s*4\.5px[\s\S]*border-right:\s*1\.125px solid currentColor/);
  assert.match(css, /hierarchical-lot-picker-option--root[\s\S]*background:\s*#e9f3ff/);
});

test('custom Lot picker supports mouse and select-like keyboard navigation without moving focus into option rows', () => {
  const script = read('public/js/hierarchical-lot-select.js');

  assert.match(script, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(script, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /event\.key === 'Home' \|\| event\.key === 'End'/);
  assert.match(script, /button\.tabIndex = -1/);
  assert.match(script, /trigger\.setAttribute\('aria-activedescendant', target\.id\)/);
  assert.match(script, /optionButton = event\.target\.closest\('\[data-lot-picker-option-index\]'/);
  assert.match(script, /words\.some\(\(word\) => word\.startsWith\(normalizedNeedle\)\)/);
});

test('all application native Lot hierarchy selectors use the shared enhancement contract', () => {
  const views = [
    'views/pages/tech-units.ejs',
    'views/fragments/dashboard-filters.ejs',
    'views/fragments/tech-unit-park-modal.ejs',
    'views/fragments/tech-override-request-modal.ejs',
    'views/fragments/lot-form-modal.ejs',
    'views/fragments/lot-duplicate-modal.ejs',
    'views/pages/override-request-detail.ejs',
    'views/pages/management-lot-new.ejs'
  ];

  views.forEach((viewPath) => {
    assert.match(read(viewPath), /data-hierarchical-lot-select/, viewPath);
  });
});

test('existing searchable Add/Edit Unit Lot picker uses the same CSS-drawn hierarchy chevron', () => {
  const css = read('public/css/app.css');
  const formScript = read('public/js/tech-unit-form.js');

  assert.match(css, /tech-assignable-lot-option[\s\S]*var\(--lot-depth, 0\) \* 30px/);
  assert.match(css, /tech-assignable-lot-option--child::before[\s\S]*width:\s*4\.5px[\s\S]*height:\s*4\.5px/);
  assert.match(formScript, /tech-assignable-lot-option--child/);
});
