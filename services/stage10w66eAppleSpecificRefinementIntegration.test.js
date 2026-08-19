'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getUnitFormFieldDefinition } = require('../config/unitFormFieldRegistry');
const { classifyProcessorFamilyCodes } = require('./processorFamilyClassifier');
const metadata = require('../config/processorMetadataCatalog.json');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Apple Model Number is grouped beside Model Year in the Model section and removed from Specifications', () => {
  const registry = getUnitFormFieldDefinition('apple_model_number');
  assert.equal(registry.section, 'model');
  assert.deepEqual(registry.applicableManufacturers, ['Apple']);

  const form = read('views/fragments/tech-unit-form.ejs');
  const modelSection = form.match(/tech-form-section--catalog[\s\S]*?<\/div>\n\n<% if \(isEditMode/);
  assert.ok(modelSection, 'model section should be found');
  const appleModelIndex = modelSection[0].indexOf('data-unit-form-field-key="apple_model_number"');
  const modelYearIndex = modelSection[0].indexOf('data-unit-form-field-key="model_year"');
  assert.ok(appleModelIndex >= 0 && modelYearIndex > appleModelIndex, 'Apple Model Number should appear directly before Model Year.');
  const specsStart = form.indexOf('tech-form-section--specifications');
  const testsStart = form.indexOf('tech-form-section--tests');
  assert.equal(form.slice(specsStart, testsStart).includes('data-unit-form-field-key="apple_model_number"'), false);
});

test('Apple display restrictions hide LCD/OLED by stable ID without removing Retina choices', () => {
  const registry = require('../config/configIdentityRegistry');
  assert.equal(registry.SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_LCD, 601);
  assert.equal(registry.SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_OLED, 602);
  const model = read('models/unitSpecsTestsModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');
  assert.match(model, /appleDisallowed/);
  assert.match(form, /data-apple-disallowed-option/);
  assert.match(script, /option\.dataset\.appleDisallowedOption/);
  assert.match(script, /selectedOptionBecameUnavailable/);
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  for (const type of ['Retina', 'Retina 2K', 'Retina 4K']) assert.match(migration, new RegExp(`\\['${type}', false\\]`));
});

test('Apple-specific refinement seeds requested Max processors and common Intel i9 Mac processors with base clocks', () => {
  const migration = read('scripts/migrateAppleSpecificRefinement.js');
  for (const processor of ['Apple M2 Max', 'Apple M3 Max', 'Apple M4 Max']) assert.match(migration, new RegExp(processor));
  const expected = new Map([
    ['i9-8950HK', 2.9],
    ['i9-9880H', 2.3],
    ['i9-9980HK', 2.4],
    ['i9-9900K', 3.6],
    ['i9-10910', 3.6]
  ]);
  for (const [processor, speed] of expected) {
    assert.equal(metadata[processor].baseSpeedGhz, speed, `${processor} base speed should be ${speed}GHz.`);
    assert.match(migration, new RegExp(processor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i9-8950HK' }), ['intel-i9-8th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i9-9980HK' }), ['intel-i9-9th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i9-10910' }), ['intel-i9-10th-gen']);
});

test('processor compatibility is limited to Apple models that actually used these processor classes', () => {
  const migration = read('scripts/migrateAppleSpecificRefinement.js');
  assert.match(migration, /Apple M2 Max[\s\S]*?models: Object\.freeze\(\['MacBook Pro', 'Mac Studio'\]\)/);
  assert.match(migration, /Apple M3 Max[\s\S]*?models: Object\.freeze\(\['MacBook Pro'\]\)/);
  assert.match(migration, /Apple M4 Max[\s\S]*?models: Object\.freeze\(\['MacBook Pro', 'Mac Studio'\]\)/);
  assert.match(migration, /i9-8950HK[\s\S]*?models: Object\.freeze\(\['MacBook Pro'\]\)/);
  assert.match(migration, /i9-9900K[\s\S]*?models: Object\.freeze\(\['iMac'\]\)/);
  assert.match(migration, /i9-10910[\s\S]*?models: Object\.freeze\(\['iMac'\]\)/);
});

test('Apple-specific refinement migration also seeds additional Screen Sizes and common Mac colors', () => {
  const migration = read('scripts/migrateAppleSpecificRefinement.js');
  for (const value of ['13.6-inch', '15.4-inch', '17-inch']) assert.match(migration, new RegExp(value.replace('.', '\\.')));
  for (const color of ['Space Gray', 'Space Black', 'Midnight', 'Starlight', 'Sky Blue']) assert.match(migration, new RegExp(color));
});

test('Apple processor-family migration supplies required export Short Form values', () => {
  const migration = read('scripts/migrateAppleSpecificRefinement.js');
  for (const literal of [
    "familyCode: 'apple-m2-family', familyName: 'Apple M2 Family', familyExportShortForm: 'M2'",
    "familyCode: 'apple-m3-family', familyName: 'Apple M3 Family', familyExportShortForm: 'M3'",
    "familyCode: 'apple-m4-family', familyName: 'Apple M4 Family', familyExportShortForm: 'M4'",
    "familyCode: 'intel-i9-8th-gen', familyName: 'Intel i9-8th Gen', familyExportShortForm: 'i9-8th'",
    "familyCode: 'intel-i9-9th-gen', familyName: 'Intel i9-9th Gen', familyExportShortForm: 'i9-9th'",
    "familyCode: 'intel-i9-10th-gen', familyName: 'Intel i9-10th Gen', familyExportShortForm: 'i9-10th'"
  ]) assert.ok(migration.includes(literal), `migration should include ${literal}`);
  assert.match(migration, /columns\.has\('export_short_form'\)/);
  assert.match(migration, /fields\.push\('export_short_form'\)/);
  assert.match(migration, /values\.push\(definition\.familyExportShortForm\)/);
});
