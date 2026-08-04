'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('zero capacity is parsed, formatted, and preserved as an explicit value', () => {
  const capacityService = read('services/hardwareCapacity.js');
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(capacityService, /amount < 0/);
  assert.match(capacityService, /numeric === 0[\s\S]*return '0GB'/);
  assert.match(controller, /sizeGb === '0'/);
  assert.match(controller, /parsedCapacity\.gb === 0/);
  assert.match(controller, /function isNonNegativeInteger/);
  assert.match(controller, /!isNonNegativeInteger\(validationFormData\.ramGb\)/);
  assert.match(controller, /!isNonNegativeInteger\(validationFormData\.storageGb\)/);
  assert.match(controller, /hasStructuredCapacityEntry/);
  assert.match(model, /normalizeOptionalNonNegativeInteger/);
  assert.match(model, /normalized\.sizeGb !== null/);
});

test('empty-slot rows do not require or retain component type metadata', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const script = read('public/js/tech-unit-form.js');

  assert.match(controller, /isEmptySlot \? '' : normalizeModuleField\(row\.ramTypeConfigValueId\)/);
  assert.match(controller, /isEmptySlot \? '' : normalizeMemoryInstallTypeCode\(row\.memoryInstallTypeCode\)/);
  assert.match(controller, /isEmptySlot \? '' : normalizeModuleField\(row\.storageTypeConfigValueId\)/);
  assert.match(model, /normalized\.sizeGb === 0[\s\S]*normalized\.ramTypeConfigValueId = null/);
  assert.match(model, /normalized\.sizeGb === 0[\s\S]*normalized\.storageTypeConfigValueId = null/);
  assert.match(script, /isExplicitEmptySlot/);
  assert.match(script, /control\.value = ''/);
});

test('zero rows remain copyable and contribute zero to derived totals', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');
  const policy = read('services/unitFormSubmissionPolicy.js');

  assert.match(markup, /Enter 0 for an empty slot/);
  assert.match(markup, /Enter 0 for an empty bay/);
  assert.match(markup, /hasExplicitCapacityRows\(previousMemoryRows\)/);
  assert.match(markup, /hasExplicitCapacityRows\(previousStorageRows\)/);
  assert.match(script, /parsed\.valid && parsed\.gb !== null/);
  assert.match(script, /hasStructuredEntries/);
  assert.match(policy, /normalizedSize !== '' && Number\.isInteger\(size\) && size >= 0/);
});

test('Stage 10J migration safely permits zero in all summary and component capacity columns', () => {
  const sql = read('sql/2026-08-stage-10j-zero-capacity-slots.sql');
  const applyScript = read('scripts/apply-stage-10j-zero-capacity-slots.sh');
  const packageJson = read('package.json');

  for (const tableName of [
    'unit_memory_modules',
    'unit_storage_devices',
    'unit_previous_memory_modules',
    'unit_previous_storage_devices'
  ]) {
    assert.match(sql, new RegExp(tableName));
  }

  assert.match(sql, /target_column_name[\s\S]*` >= 0\)'/);
  assert.match(sql, /chk_units_ram_gb/);
  assert.match(sql, /chk_unit_previous_storage_devices_size/);
  assert.match(sql, /memory_install_type_code[\s\S]*NULL DEFAULT NULL/);
  assert.match(applyScript, /5:8:2/);
  assert.match(applyScript, /8:2:0/);
  assert.match(packageJson, /validate:zero-capacity-slots/);
});
