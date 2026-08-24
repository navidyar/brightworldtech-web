'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Lot requirement Required Value uses a searchable combobox while preserving the submitted catalog token', () => {
  const modal = read('views/fragments/lot-requirement-form-modal.ejs');

  assert.match(modal, /data-required-value-combobox/);
  assert.match(modal, /type="search"[\s\S]*?role="combobox"[\s\S]*?data-required-value-search/);
  assert.match(modal, /<select name="requiredValue" data-required-value-select disabled hidden/);
  assert.match(modal, /data-required-value-options[\s\S]*?role="listbox"|role="listbox"[\s\S]*?data-required-value-options/);
});

test('search uses leading label/code tokens and still requires an available-list selection', () => {
  const script = read('public/js/lot-requirements.js');

  assert.match(script, /function filterRequirementValueOptions\(options, query\)/);
  assert.match(script, /function matchesLeadingRequirementValueSearch\(value, search\)/);
  assert.match(script, /\[option\?\.label, option\?\.code\]/);
  assert.doesNotMatch(script, /getRequirementValueOptionSearchText\(option\)[\s\S]*option\?\.description/);
  assert.match(script, /Select a value from the available list\./);
  assert.match(script, /selectInput\.value = String\(option\.value\)/);
  assert.match(script, /searchInput\.value = getRequirementValueOptionLabel\(option\)/);
  assert.match(script, /\['ArrowDown', 'ArrowUp', 'Enter'\]/);
  assert.match(script, /REQUIREMENT_VALUE_RESULT_LIMIT = 100/);
});

test('numeric requirements continue to use their existing numeric Required Value input', () => {
  const script = read('public/js/lot-requirements.js');

  assert.match(script, /if \(optionSet\.type === 'select'\)/);
  assert.match(script, /textInput\.type = 'number'/);
  assert.match(script, /textInput\.min = String\(minimum\)/);
  assert.match(script, /textInput\.step = String\(step\)/);
});

test('the Requirement modal lets the searchable results list extend beyond the rounded modal shell', () => {
  const styles = read('public/css/lots.css');

  assert.match(
    styles,
    /\.lot-requirement-modal\.modal-panel\.site-clean-modal\s*\{[\s\S]*?overflow:\s*visible;/
  );
  assert.match(styles, /\.lot-requirement-value-options\s*\{[\s\S]*?position:\s*absolute;/);
});

test('Lots pages load the current requirement assets while preserving searchable requirement support', () => {
  assert.match(read('views/pages/management-lot-new.ejs'), /20260813-stage10w61-lot-ui-export/);
  assert.match(read('views/pages/management-lots.ejs'), /20260813-stage10w61-lot-ui-export/);
  assert.match(read('views/pages/management-lot-detail.ejs'), /20260813-stage10w61-lot-ui-export/);
  assert.match(read('views/pages/management-lot-detail.ejs'), /lot-requirements\.js\?v=20260819-stage10w68y-mouse-focus-continuity/);
});
