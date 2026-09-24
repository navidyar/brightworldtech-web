'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Lot Types are a first-class configurable Lot category', () => {
  const registry = read('config/configIdentityRegistry.js');
  const model = read('models/configModel.js');
  const page = read('views/pages/management-config.ejs');

  assert.match(registry, /LOT_TYPES: 22/);
  assert.match(registry, /SYSTEM_CONFIG_CATEGORY_IDS\.LOT_TYPES, 'Lot Types'/);
  assert.match(model, /SYSTEM_CONFIG_CATEGORY_IDS\.LOT_TYPES/);
  assert.match(page, /Lot Types are shared by Create\/Edit Lot/);
  assert.match(page, /Active values appear as selectable Lot Types in configured order/);
});

test('Create Lot uses active configured Lot Types while Edit Lot can retain its current inactive type', () => {
  const model = read('models/lotModel.js');
  const controller = read('controllers/lotController.js');
  const modal = read('views/fragments/lot-form-modal.ejs');
  const page = read('views/pages/management-lot-new.ejs');

  assert.match(model, /currentLotTypeConfigValueId/);
  assert.match(model, /Number\(lotType\.is_active\) === 1/);
  assert.match(model, /Number\(lotType\.config_value_id\) === currentLotTypeConfigValueId/);
  assert.match(controller, /currentLotTypeConfigValueId: lot\?\.lot_type_config_value_id \|\| null/);
  assert.match(controller, /Choose an active Lot Type\./);
  assert.match(modal, /safeFormOptions\.lotTypes\.forEach/);
  assert.match(page, /formOptions\.lotTypes\.forEach/);
});

test('Lot Type migration establishes the requested initial active list without deleting historical values', () => {
  const migration = read('scripts/migrateConfiguredLotTypes.js');
  const expected = [
    'Ready Stock Lot',
    'As-Is Lot',
    'Customer Lot',
    'ELS Lot',
    'Configuration Lot',
    'Fail Lot',
    'Refurbishment Lot'
  ];

  expected.forEach((label) => assert.match(migration, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(migration, /refurbisher lot/);
  assert.match(migration, /Non-target active Lot Types to deactivate/);
  assert.match(migration, /Existing Lots keep references to deactivated Lot Types/);
  assert.doesNotMatch(migration, /DELETE FROM config_values/);
  assert.doesNotMatch(migration, /UPDATE lots SET lot_type_config_value_id/);
});

test('Create Lot helper copy no longer hard-codes retired Lot Type names', () => {
  const page = read('views/pages/management-lot-new.ejs');

  assert.match(page, /open-ended or mixed-purpose Lots/);
  assert.doesNotMatch(page, /As-Is, Export, Refurbisher, or open receiving lots/);
});

test('package exposes audit, apply, and focused validation commands for Lot Types', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:lot-types'], 'node scripts/migrateConfiguredLotTypes.js');
  assert.equal(packageJson.scripts['migrate:lot-types'], 'node scripts/migrateConfiguredLotTypes.js --apply');
  assert.match(packageJson.scripts['validate:lot-types'], /lotTypeConfigurationIntegration\.test\.js/);
});
