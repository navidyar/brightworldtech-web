'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Add/Edit Unit searchable option clicks preserve the current input focus before selection', () => {
  const source = read('public/js/tech-unit-form.js');
  const commentIndex = source.indexOf('mouse click selects an');
  const guardIndex = source.lastIndexOf("document.addEventListener('mousedown', (event) => {", commentIndex);
  const clickIndex = source.indexOf("document.addEventListener('click', (event) => {", guardIndex);

  assert.notEqual(guardIndex, -1, 'search option mousedown focus guard must exist');
  assert.ok(clickIndex > guardIndex, 'focus guard must run before delegated click selection');

  const guard = source.slice(guardIndex, clickIndex);
  assert.match(guard, /data-assignable-lot-option/);
  assert.match(guard, /data-unit-model-option/);
  assert.match(guard, /data-processor-option/);
  assert.match(guard, /event\.preventDefault\(\)/);
});

test('Requirement Required Value keeps focus through the full mouse gesture and selects on click', () => {
  const source = read('public/js/lot-requirements.js');
  const mouseDownIndex = source.indexOf("optionsContainer.addEventListener('mousedown', (event) => {");
  const clickIndex = source.indexOf("optionsContainer.addEventListener('click', (event) => {", mouseDownIndex);
  const blurIndex = source.indexOf("searchInput.addEventListener('blur',", clickIndex);

  assert.notEqual(mouseDownIndex, -1);
  assert.ok(clickIndex > mouseDownIndex);
  assert.ok(blurIndex > clickIndex);

  const mouseDownBlock = source.slice(mouseDownIndex, clickIndex);
  const clickBlock = source.slice(clickIndex, blurIndex);
  assert.match(mouseDownBlock, /event\.preventDefault\(\)/);
  assert.doesNotMatch(mouseDownBlock, /selectRequirementValueOption\(/);
  assert.match(clickBlock, /selectRequirementValueOption\(\{ searchInput, selectInput, optionsContainer, option \}\)/);
});

test('shared custom Lot picker also prevents transient option focus before choosing', () => {
  const source = read('public/js/hierarchical-lot-select.js');
  const mouseDownIndex = source.indexOf("listbox.addEventListener('mousedown', (event) => {");
  const clickIndex = source.indexOf("listbox.addEventListener('click', (event) => {", mouseDownIndex);

  assert.notEqual(mouseDownIndex, -1);
  assert.ok(clickIndex > mouseDownIndex);
  assert.match(source.slice(mouseDownIndex, clickIndex), /event\.preventDefault\(\)/);
  assert.match(source, /close\(\);\s*trigger\.focus\(\);/);
});

test('pages load the mouse-focus-continuity asset versions', () => {
  [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
  });

  assert.match(
    read('views/pages/management-lot-detail.ejs'),
    /lot-requirements\.js\?v=20260819-stage10w68y-mouse-focus-continuity/
  );
  assert.match(
    read('views/partials/head.ejs'),
    /hierarchical-lot-select\.js\?v=20260819-stage10w68y-mouse-focus-continuity/
  );
});
