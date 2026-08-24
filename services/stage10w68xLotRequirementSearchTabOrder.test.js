'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadRequirementSearchHelpers() {
  const source = read('public/js/lot-requirements.js');
  const start = source.indexOf('function normalizeRequirementValueSearch');
  const end = source.indexOf('function getExactRequirementValueOption', start);

  assert.notEqual(start, -1, 'requirement search normalization helper must exist');
  assert.notEqual(end, -1, 'requirement search helper block must end before exact-match handling');

  return new Function(
    `${source.slice(start, end)}; return { matchesLeadingRequirementValueSearch, filterRequirementValueOptions };`
  )();
}

test('Requirement Required Value uses the same leading-token matching behavior as Add/Edit Unit', () => {
  const { filterRequirementValueOptions } = loadRequirementSearchHelpers();
  const options = [
    { value: 'manufacturer:1', label: 'Lenovo', code: 'LENOVO' },
    { value: 'manufacturer:2', label: 'Dell', code: 'DELL' },
    { value: 'manufacturer:3', label: 'Apple', code: 'APPLE' },
  ];

  assert.deepEqual(filterRequirementValueOptions(options, 'l').map((option) => option.label), ['Lenovo']);
  assert.deepEqual(filterRequirementValueOptions(options, 'le').map((option) => option.label), ['Lenovo']);
});

test('Requirement search preserves word and technical identifier prefix matching', () => {
  const { matchesLeadingRequirementValueSearch } = loadRequirementSearchHelpers();

  assert.equal(matchesLeadingRequirementValueSearch('Dell · Laptop · Latitude 5420', 'lat'), true);
  assert.equal(matchesLeadingRequirementValueSearch('Dell · Laptop · Latitude 5420', '5420'), true);
  assert.equal(matchesLeadingRequirementValueSearch('Intel Core i5-9500T · 2.20 GHz', '9500'), true);
  assert.equal(matchesLeadingRequirementValueSearch('Intel Core i5-9500T · 2.20 GHz', 'i5'), true);
  assert.equal(matchesLeadingRequirementValueSearch('Apple', 'le'), false);
});

test('invisible option descriptions do not create Requirement search matches', () => {
  const { filterRequirementValueOptions } = loadRequirementSearchHelpers();
  const options = [
    { value: 'family:1', label: 'Intel Core', code: '1', description: 'Legacy Lenovo compatibility metadata' },
  ];

  assert.deepEqual(filterRequirementValueOptions(options, 'lenovo'), []);
});

test('Requirement modal Tab path contains only the four form fields and excludes every button', () => {
  const markup = read('views/fragments/lot-requirement-form-modal.ejs');
  const script = read('public/js/lot-requirements.js');

  const requirementIndex = markup.indexOf('data-requirement-key');
  const operatorIndex = markup.indexOf('data-requirement-operator');
  const searchIndex = markup.indexOf('data-required-value-search');
  const textIndex = markup.indexOf('data-required-value-text');
  const notesIndex = markup.indexOf('name="notes"');

  assert.ok(requirementIndex >= 0 && operatorIndex > requirementIndex, 'Rule follows Requirement Field');
  assert.ok(searchIndex > operatorIndex, 'searchable Required Value follows Rule');
  assert.ok(textIndex > operatorIndex && textIndex < notesIndex, 'free-entry Required Value occupies the same third-field position');
  assert.ok(notesIndex > searchIndex, 'Notes is the final form field');

  assert.match(markup, /modal-close-button[^>]*tabindex="-1"/);
  assert.match(markup, /type="submit" class="primary-button" tabindex="-1"/);
  assert.match(markup, /class="secondary-button" data-modal-close tabindex="-1"/);
  assert.match(markup, /data-required-value-select disabled hidden aria-hidden="true" tabindex="-1"/);
  assert.match(script, /optionButton\.tabIndex = -1;/);
});

test('Lot Details loads the current Requirement modal interaction asset', () => {
  const page = read('views/pages/management-lot-detail.ejs');
  assert.match(page, /lot-requirements\.js\?v=20260819-stage10w68y-mouse-focus-continuity/);
});
