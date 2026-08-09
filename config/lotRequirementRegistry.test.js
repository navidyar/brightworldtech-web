'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getLotRequirementField,
  isOperatorAllowedForField,
  normalizeOperatorCode,
  normalizeRequirementKey,
  listLotRequirementFields,
  validateLotRequirementRegistry
} = require('./lotRequirementRegistry');

test('lot requirement registry is internally valid', () => {
  assert.deepEqual(validateLotRequirementRegistry(), []);
});

test('legacy field aliases normalize to persisted requirement type codes', () => {
  assert.equal(normalizeRequirementKey('ram_size'), 'ram_gb');
  assert.equal(normalizeRequirementKey('storage_size'), 'storage_gb');
  assert.equal(normalizeRequirementKey('processor_model'), 'processor');
});

test('legacy operator aliases normalize to configured comparison operator codes', () => {
  assert.equal(normalizeOperatorCode('minimum'), 'greater_equal');
  assert.equal(normalizeOperatorCode('maximum'), 'less_equal');
});

test('numeric operators are restricted to numeric requirement fields', () => {
  assert.equal(isOperatorAllowedForField('ram_gb', 'greater_equal'), true);
  assert.equal(isOperatorAllowedForField('manufacturer', 'greater_equal'), false);
  assert.equal(getLotRequirementField('manufacturer').storageKind, 'manufacturer');
});

test('expanded requirement registry covers the live fields that support meaningful enforcement', () => {
  for (const key of [
    'unit_type',
    'manufacturer',
    'model',
    'processor',
    'processor_family',
    'processor_speed_ghz',
    'ram_gb',
    'ram_type',
    'memory_install_type',
    'storage_gb',
    'storage_type',
    'storage_wipe_status',
    'operating_system',
    'os_build',
    'bios_version',
    'battery_health',
    'absolute_status',
    'physical_camera_status',
    'touchscreen_status',
    'keyboard_language',
    'complete_diagnostics',
    'virus_check',
    'driver_check',
    'skinned_status',
    'overall_grade',
    'unit_outcome'
  ]) {
    assert.ok(getLotRequirementField(key), `Expected requirement field ${key}.`);
  }
});


test('unique serial identifiers remain legacy-readable but cannot be selected for new requirements', () => {
  const selectableKeys = new Set(listLotRequirementFields().map((field) => field.key));

  assert.equal(selectableKeys.has('unit_serial_number'), false);
  assert.equal(selectableKeys.has('bios_serial_number'), false);
  assert.equal(getLotRequirementField('unit_serial_number').selectable, false);
  assert.equal(getLotRequirementField('bios_serial_number').selectable, false);
});

test('every numeric requirement supports Must Equal, Minimum, and Maximum', () => {
  for (const key of ['processor_speed_ghz', 'ram_gb', 'storage_gb', 'battery_health']) {
    assert.equal(isOperatorAllowedForField(key, 'equals'), true, `${key} equals`);
    assert.equal(isOperatorAllowedForField(key, 'greater_equal'), true, `${key} minimum`);
    assert.equal(isOperatorAllowedForField(key, 'less_equal'), true, `${key} maximum`);
  }

  assert.equal(isOperatorAllowedForField('os_build', 'greater_equal'), false);
  assert.equal(isOperatorAllowedForField('unit_outcome', 'less_equal'), false);
});
