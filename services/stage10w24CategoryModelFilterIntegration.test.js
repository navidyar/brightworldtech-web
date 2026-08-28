'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function buildModelFilterHarness() {
  const source = read('public/js/tech-unit-form.js');
  const start = source.indexOf('function getLeadingSearchTokens(');
  const end = source.indexOf('function closeUnitModelOptions(', start);

  assert.notEqual(start, -1, 'model filter state helper must exist');
  assert.notEqual(end, -1, 'model filter helpers must end before closeUnitModelOptions');

  const body = source.slice(start, end);
  return new Function(
    'normalizeModelSearch',
    'getUnitModelComboboxInput',
    'getUnitModelOptionLabel',
    `${body}; return { getModelFilterState, optionMatchesFilters };`,
  )(
    (value) => String(value || '').trim().toLowerCase(),
    () => null,
    (option) => String(option?.textContent || '').trim(),
  );
}

function catalogOption({ id, manufacturerId, categoryId, label }) {
  const attributes = new Map([
    ['data-manufacturer-id', String(manufacturerId)],
    ['data-category-id', String(categoryId)],
  ]);

  return {
    value: String(id),
    textContent: label,
    getAttribute(name) {
      return attributes.get(name) || null;
    },
  };
}

test('Unit Model filtering intersects Manufacturer, Unit Category, and typed search', () => {
  const { optionMatchesFilters } = buildModelFilterHarness();
  const latitude = catalogOption({ id: 1, manufacturerId: 10, categoryId: 100, label: 'Latitude 5420' });
  const optiplex = catalogOption({ id: 2, manufacturerId: 10, categoryId: 200, label: 'OptiPlex 7090 Micro' });
  const hpDesktop = catalogOption({ id: 3, manufacturerId: 20, categoryId: 200, label: 'EliteDesk 800 G6 Mini' });

  const dellDesktop = { manufacturerId: '10', categoryId: '200', search: '' };
  assert.equal(optionMatchesFilters(optiplex, dellDesktop), true);
  assert.equal(optionMatchesFilters(latitude, dellDesktop), false, 'Dell Laptop models must be excluded from Dell Desktop results');
  assert.equal(optionMatchesFilters(hpDesktop, dellDesktop), false, 'other manufacturers must stay excluded');

  const dellLaptop = { manufacturerId: '10', categoryId: '100', search: 'latitude' };
  assert.equal(optionMatchesFilters(latitude, dellLaptop), true);
  assert.equal(optionMatchesFilters(optiplex, dellLaptop), false);
});

test('manufacturer-only filtering remains available until a Unit Category is selected', () => {
  const { optionMatchesFilters } = buildModelFilterHarness();
  const latitude = catalogOption({ id: 1, manufacturerId: 10, categoryId: 100, label: 'Latitude 5420' });
  const optiplex = catalogOption({ id: 2, manufacturerId: 10, categoryId: 200, label: 'OptiPlex 7090 Micro' });
  const filters = { manufacturerId: '10', categoryId: '', search: '' };

  assert.equal(optionMatchesFilters(latitude, filters), true);
  assert.equal(optionMatchesFilters(optiplex, filters), true);
});

test('changing Unit Category clears an already-selected model when its category no longer matches', () => {
  const script = read('public/js/tech-unit-form.js');
  const start = script.indexOf('function updateUnitModelFilter(');
  const end = script.indexOf('function selectUnitModelOption(', start);
  const body = script.slice(start, end);

  assert.match(body, /const hasCategory = Boolean\(filters\.categoryId\)/);
  assert.match(body, /selectedOption\.getAttribute\('data-category-id'\)/);
  assert.match(body, /const selectedMatchesContext = selectedMatchesManufacturer && selectedMatchesCategory/);
  assert.match(body, /!preserveSelection && selectedOption && !selectedMatchesContext[\s\S]*?clearUnitModelSelection\(form\)/);
});

test('the existing model catalog already carries category metadata for the current rendered list', () => {
  const template = read('views/fragments/tech-unit-form.ejs');
  const seed = read('sql/2026-06-step-7e1a-unit-model-catalog.sql');

  assert.match(template, /data-category-id="<%= unitModel\.unitCategoryConfigValueId \|\| '' %>"/);
  assert.match(seed, /\('Dell', 'laptop', 'Latitude 5420',/);
  assert.match(seed, /\('Dell', 'desktop', 'OptiPlex 7090 Micro',/);
});

test('all Unit form entry points use the category-aware model-filter cache version', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    assert.match(read(relativePath), /tech-unit-form\.js\?v=[^"\'\s>]+/);
  }
});
