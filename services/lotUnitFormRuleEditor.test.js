'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LotUnitFormRuleEditorError,
  normalizeSubmittedLotFormRules,
  rulesToSelectionMaps
} = require('./lotUnitFormRuleEditor');

test('normalizes only non-inherit Unit form overrides', () => {
  const rules = normalizeSubmittedLotFormRules({
    visibilityModes: {
      bios_serial_number: 'visible',
      manufacturer: 'inherit'
    },
    requirementModes: {
      bios_serial_number: 'required',
      manufacturer: 'inherit'
    }
  });

  assert.deepEqual(rules, [{
    fieldKey: 'bios_serial_number',
    visibilityMode: 'visible',
    requirementMode: 'required'
  }]);
});

test('treats omitted configurable fields as inherited', () => {
  const rules = normalizeSubmittedLotFormRules({});
  assert.deepEqual(rules, []);
});

test('rejects unknown and protected field keys', () => {
  assert.throws(
    () => normalizeSubmittedLotFormRules({
      visibilityModes: {
        assignable_lot: 'hidden',
        imaginary_field: 'visible'
      }
    }),
    (error) => (
      error instanceof LotUnitFormRuleEditorError
      && error.messages.length === 2
      && error.messages.some((message) => message.includes('assignable_lot'))
      && error.messages.some((message) => message.includes('imaginary_field'))
    )
  );
});

test('rejects invalid modes and direct Hidden plus Required combinations', () => {
  assert.throws(
    () => normalizeSubmittedLotFormRules({
      visibilityModes: {
        bios_serial_number: 'sometimes',
        unit_serial_number: 'hidden'
      },
      requirementModes: {
        bios_serial_number: 'inherit',
        unit_serial_number: 'required'
      }
    }),
    (error) => (
      error instanceof LotUnitFormRuleEditorError
      && error.messages.some((message) => message.includes('invalid visibility'))
      && error.messages.some((message) => message.includes('Hidden and Required'))
    )
  );
});

test('maps stored rules back to form selections', () => {
  assert.deepEqual(rulesToSelectionMaps([
    {
      field_key: 'bios_serial_number',
      visibility_mode: 'hidden',
      requirement_mode: 'inherit'
    }
  ]), {
    visibilityModes: { bios_serial_number: 'hidden' },
    requirementModes: { bios_serial_number: 'inherit' }
  });
});
