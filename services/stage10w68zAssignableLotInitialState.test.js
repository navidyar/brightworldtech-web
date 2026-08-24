'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Assignable Lot focus alone keeps the option list closed', () => {
  const source = read('public/js/tech-unit-form.js');
  const focusStart = source.indexOf("document.addEventListener('focusin', (event) => {");
  const modelBranch = source.indexOf("const modelComboboxInput", focusStart);

  assert.notEqual(focusStart, -1);
  assert.ok(modelBranch > focusStart);

  const assignableFocusBlock = source.slice(focusStart, modelBranch);
  assert.match(assignableFocusBlock, /assignableLotComboboxInput\.select\(\)/);
  assert.doesNotMatch(assignableFocusBlock, /renderAssignableLotOptions\(/);
});

test('Assignable Lot opens only after deliberate click, typing, or arrow-key interaction', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(
    source,
    /document\.addEventListener\('click',[\s\S]*?data-assignable-lot-combobox-input[\s\S]*?optionsContainer && optionsContainer\.hidden[\s\S]*?renderAssignableLotOptions\(form, true, true\)/
  );
  assert.match(
    source,
    /const assignableLotComboboxInput = event\.target\.closest\('\[data-assignable-lot-combobox-input\]'\);[\s\S]*?renderAssignableLotOptions\(form, true\)/
  );
  assert.match(
    source,
    /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'[\s\S]*?moveSearchComboboxActiveOption/
  );
});

test('all Add/Edit Unit entry points load the closed-on-focus asset version', () => {
  [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ].forEach((relativePath) => {
    assert.match(
      read(relativePath),
      /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/
    );
  });
});
