'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadSearchHelpers() {
  const source = read('public/js/tech-unit-form.js');
  const start = source.indexOf('function normalizeModelSearch');
  const end = source.indexOf('function getOperationalUsageScore', start);

  assert.notEqual(start, -1, 'search normalization helper must exist');
  assert.notEqual(end, -1, 'search helper block must end before usage scoring');

  return new Function(
    `${source.slice(start, end)}; return { getLeadingSearchTokens, matchesLeadingSearch };`
  )();
}

test('searchable Unit-form fields match token prefixes instead of arbitrary substrings', () => {
  const { matchesLeadingSearch } = loadSearchHelpers();

  assert.equal(matchesLeadingSearch('Lenovo', 'l'), true);
  assert.equal(matchesLeadingSearch('Lenovo', 'le'), true);
  assert.equal(matchesLeadingSearch('Dell', 'l'), false);
  assert.equal(matchesLeadingSearch('Apple', 'le'), false);

  assert.equal(matchesLeadingSearch('Dell OptiPlex 7090 SFF', 'opt'), true);
  assert.equal(matchesLeadingSearch('Dell OptiPlex 7090 SFF', '709'), true);
  assert.equal(matchesLeadingSearch('Dell OptiPlex 7090 SFF', 'opt 70'), true);
  assert.equal(matchesLeadingSearch('Dell OptiPlex 7090 SFF', 'tip'), false);
});

test('technical identifiers remain searchable from punctuation and letter-number boundaries', () => {
  const { matchesLeadingSearch } = loadSearchHelpers();

  assert.equal(matchesLeadingSearch('Intel Core i5-9500T @ 2.20 GHz', '9500'), true);
  assert.equal(matchesLeadingSearch('Intel Core i5-9500T @ 2.20 GHz', 'i5'), true);
  assert.equal(matchesLeadingSearch('AMD Ryzen 5 PRO 4650G', '4650'), true);
  assert.equal(matchesLeadingSearch('MacBookPro18,3', '18'), true);
});

test('Assignable Lot, Unit Model, and Processor all use leading-token matching', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /matchesLeadingSearch\(searchable, filters\.search\)/);
  assert.match(source, /const searchMatches = matchesLeadingSearch\(label, filters\.search\)/);
  assert.match(source, /const matchesSearch = matchesLeadingSearch\(getProcessorOptionLabel\(option\), search\)/);
});

test('searchable Unit-form comboboxes support arrow navigation and active-option Enter selection', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /function handleUnitFormSearchComboboxKeydown\(event\)/);
  assert.match(source, /event\.key === 'ArrowDown' \|\| event\.key === 'ArrowUp'/);
  assert.match(source, /moveSearchComboboxActiveOption\(config, event\.key === 'ArrowDown' \? 1 : -1\)/);
  assert.match(source, /option\.classList\.contains\('is-active'\)/);
  assert.match(source, /config\.input\.setAttribute\('aria-activedescendant', option\.id\)/);
  assert.match(source, /const optionToSelect = activeOption \|\| options\[0\]/);
  assert.match(source, /config\.selectOption\(config\.form, optionToSelect\.getAttribute\(config\.valueAttribute\)\)/);
});

test('generated options remain outside Tab order while exposing stable active-descendant ids', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /optionButton\.tabIndex = -1/);
  assert.match(source, /optionButton\.id = `tech-unit-combobox-lot-\$\{option\.value\}`/);
  assert.match(source, /optionButton\.id = `tech-unit-combobox-model-\$\{option\.value\}`/);
  assert.match(source, /optionButton\.id = `tech-unit-combobox-processor-\$\{option\.value\}`/);
  assert.match(source, /comboboxInput\.removeAttribute\('aria-activedescendant'\)/);
});


test('all Add/Edit Unit entry points load the current searchable-combobox asset version', () => {
  [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=20260819-stage10w68z-assignable-lot-closed-on-focus/);
  });
});


function loadKeyboardHelpers() {
  const source = read('public/js/tech-unit-form.js');
  const start = source.indexOf('function getRenderedSearchComboboxOptions');
  const end = source.indexOf('function handleUnitFormSearchComboboxKeydown', start);

  assert.notEqual(start, -1, 'keyboard option helpers must exist');
  assert.notEqual(end, -1, 'keyboard option helper block must end before the key handler');

  return new Function(
    `${source.slice(start, end)}; return { getRenderedSearchComboboxOptions, setSearchComboboxActiveOption, moveSearchComboboxActiveOption };`
  )();
}

function createKeyboardOption(id, selected = false) {
  const classes = new Set();
  const attributes = new Map([['aria-selected', selected ? 'true' : 'false']]);

  return {
    id,
    classList: {
      contains(name) {
        return classes.has(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    scrollIntoView() {},
  };
}

test('arrow navigation starts at the selected option and then moves without taking focus from the input', () => {
  const { moveSearchComboboxActiveOption } = loadKeyboardHelpers();
  const options = [
    createKeyboardOption('one'),
    createKeyboardOption('two', true),
    createKeyboardOption('three'),
  ];
  const inputAttributes = new Map();
  const config = {
    form: {},
    input: {
      setAttribute(name, value) {
        inputAttributes.set(name, value);
      },
      removeAttribute(name) {
        inputAttributes.delete(name);
      },
    },
    optionSelector: '[role="option"]',
    optionsContainer: {
      hidden: false,
      querySelectorAll() {
        return options;
      },
    },
    renderOptions() {
      throw new Error('open list should not need to re-render');
    },
  };

  assert.equal(moveSearchComboboxActiveOption(config, 1), true);
  assert.equal(options[1].classList.contains('is-active'), true);
  assert.equal(inputAttributes.get('aria-activedescendant'), 'two');

  assert.equal(moveSearchComboboxActiveOption(config, 1), true);
  assert.equal(options[2].classList.contains('is-active'), true);
  assert.equal(inputAttributes.get('aria-activedescendant'), 'three');

  assert.equal(moveSearchComboboxActiveOption(config, -1), true);
  assert.equal(options[1].classList.contains('is-active'), true);
  assert.equal(inputAttributes.get('aria-activedescendant'), 'two');
});
