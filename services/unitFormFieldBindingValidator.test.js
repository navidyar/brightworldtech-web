'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractUnitFormFieldBindingKeys,
  validateUnitFormFieldBindings
} = require('./unitFormFieldBindingValidator');

test('the live Unit form binds every Lot-configurable registry field exactly once', () => {
  const formPath = path.join(__dirname, '..', 'views', 'fragments', 'tech-unit-form.ejs');
  const markup = fs.readFileSync(formPath, 'utf8');
  const result = validateUnitFormFieldBindings(markup);

  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.expectedCount, 26);
  assert.equal(result.actualCount, 26);
  assert.deepEqual(result.unknownFollowerKeys, []);
  assert.deepEqual(result.unknownCompanionKeys, []);
  assert.ok(result.followerKeys.includes('unit_outcome'));
  assert.ok(result.companionKeys.includes('memory_modules'));
});

test('binding validation reports missing, duplicate, and unknown keys', () => {
  const markup = [
    '<label data-unit-form-field-key="unit_serial_number"></label>',
    '<label data-unit-form-field-key="unit_serial_number"></label>',
    '<label data-unit-form-field-key="not_real"></label>',
    '<div data-unit-form-follows-key="bad_parent"></div>',
    '<input data-unit-form-companion-key="bad_companion" />'
  ].join('');
  const result = validateUnitFormFieldBindings(markup);

  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateKeys, ['unit_serial_number']);
  assert.deepEqual(result.unknownKeys, ['not_real']);
  assert.deepEqual(result.unknownFollowerKeys, ['bad_parent']);
  assert.deepEqual(result.unknownCompanionKeys, ['bad_companion']);
  assert.ok(result.missingKeys.includes('bios_serial_number'));
  assert.deepEqual(extractUnitFormFieldBindingKeys(markup), [
    'unit_serial_number',
    'unit_serial_number',
    'not_real'
  ]);
});

test('the Create Unit identity section auto-collapses when both serial fields are hidden', () => {
  const formPath = path.join(__dirname, '..', 'views', 'fragments', 'tech-unit-form.ejs');
  const markup = fs.readFileSync(formPath, 'utf8');

  assert.match(
    markup,
    /tech-form-section--identity"<% if \(!isEditMode\) \{ %> data-unit-form-auto-collapse<% \} %>>/
  );
});
