'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Configuration Browser manages supported Label Builder fields without allowing arbitrary data keys', () => {
  const view = read('views/pages/management-config.ejs');
  const category = read('views/fragments/label-dynamic-fields-config-group.ejs');
  const controller = read('controllers/configController.js');
  const routes = read('routes/config.js');

  assert.match(view, /label-dynamic-fields-config-group/);
  assert.match(category, /Label Printing/);
  assert.match(category, /Label Builder Dynamic Fields/);
  assert.match(category, /action="\/management\/config\/label-dynamic-fields"/);
  assert.match(category, /name="fieldKey"/);
  assert.match(category, /name="displayLabel"/);
  assert.match(category, /name="activeFieldKey"/);
  assert.match(category, /data-label-dynamic-field-order-list/);
  assert.match(controller, /buildLabelDynamicFieldUpdateItems/);
  assert.match(controller, /validateLabelDynamicFieldUpdateItems/);
  assert.match(routes, /\/management\/config\/label-dynamic-fields/);
  assert.match(routes, /\/management\/config\/label-dynamic-fields\/order/);
  assert.match(controller, /reorderLabelDynamicFields/);
  assert.match(controller, /saveLabelDynamicFieldOrder/);
});

test('Layout Builder receives only active new-selection fields while preserving inactive fields already saved in a template', () => {
  const controller = read('controllers/labelLibraryController.js');
  const view = read('views/pages/management-label-builder.ejs');
  const browser = read('public/js/label-builder.js');

  assert.match(controller, /listLabelDynamicFieldSettings\(\)/);
  assert.match(controller, /buildConfiguredLabelFieldGroups\(dynamicFieldSettings, \{ includeInactive: false \}\)/);
  assert.match(controller, /allFieldGroups: configuredFieldGroups/);
  assert.match(view, /label-builder-all-field-groups-json/);
  assert.match(browser, /syncInactiveCurrentFieldOption/);
  assert.match(browser, /\$\{field\.label\} \(Inactive\)/);
});

test('dynamic-field storage is additive and future code-supported fields default safely', () => {
  const model = read('models/labelDynamicFieldConfigModel.js');
  const service = read('services/labelDynamicFieldConfiguration.js');
  const migration = read('scripts/migrateLabelDynamicFieldConfig.js');

  assert.match(model, /FROM label_dynamic_field_config/);
  assert.match(model, /ON DUPLICATE KEY UPDATE/);
  assert.match(model, /ER_NO_SUCH_TABLE/);
  assert.match(service, /stored \? stored\.isActive : true/);
  assert.match(service, /stored\?\.displayLabel \|\| field\.label/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS label_dynamic_field_config/);
  assert.match(migration, /INSERT IGNORE INTO label_dynamic_field_config/);
});

test('package exposes audit, migration, and validation commands for configurable dynamic fields', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['audit:label-dynamic-fields'], 'node scripts/migrateLabelDynamicFieldConfig.js');
  assert.equal(packageJson.scripts['migrate:label-dynamic-fields'], 'node scripts/migrateLabelDynamicFieldConfig.js --apply');
  assert.match(packageJson.scripts['validate:label-dynamic-fields'], /labelDynamicFieldConfiguration\.test\.js/);
});


test('Dynamic Field order saves independently without committing label or active edits', () => {
  const model = read('models/labelDynamicFieldConfigModel.js');
  const service = read('services/labelDynamicFieldConfiguration.js');
  const browser = read('public/js/config-values.js');

  assert.match(service, /function buildLabelDynamicFieldOrderItems/);
  assert.match(service, /sortOrder: \(index \+ 1\) \* 10/);
  assert.match(model, /async function saveLabelDynamicFieldOrder/);
  assert.match(model, /sort_order = VALUES\(sort_order\)/);
  assert.doesNotMatch(model.match(/async function saveLabelDynamicFieldOrder[\s\S]*?\n}\n/)?.[0] || '', /display_label = VALUES|is_active = VALUES/);
  assert.match(browser, /Saving order…/);
  assert.match(browser, /Order saved\./);
  assert.match(browser, /orderedFieldKeys/);
  assert.match(browser, /void saveOrder\(previousOrder\)/);
});
