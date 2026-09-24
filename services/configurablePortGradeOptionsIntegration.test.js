'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Ports / Expansion Types are managed in Unit Workflow Configuration', () => {
  const model = read('models/configModel.js');
  const page = read('views/pages/management-config.ejs');

  assert.match(model, /SYSTEM_CONFIG_CATEGORY_IDS\.PORT_TYPES/);
  assert.match(page, /Port \/ Expansion options are shared by Unit forms and Unit Details/);
});

test('new installs seed USB-A instead of the ambiguous USB label', () => {
  const migration = read('scripts/migrateSpecsTestsOverhaul.js');
  assert.match(migration, /\['USB-A', false\]/);
  assert.doesNotMatch(migration, /\['USB', false\]/);
});

test('USB-A migration renames the existing config value in place', () => {
  const migration = read('scripts/migrateUsbAPortType.js');

  assert.match(migration, /SYSTEM_CONFIG_CATEGORY_IDS\.PORT_TYPES/);
  assert.match(migration, /will be renamed from USB to USB-A without changing its ID or existing Unit references/);
  assert.match(migration, /UPDATE config_values/);
  assert.match(migration, /WHERE config_value_id = \?/);
  assert.doesNotMatch(migration, /DELETE FROM config_values/);
});

test('configured Cosmetic Grade values can include custom active grades and preserve canonical system identity', () => {
  const normalization = read('services/cosmeticGradeNormalization.js');
  const expandedForm = read('models/unitExpandedFormModel.js');
  const requirementOptions = read('models/requirementOptionModel.js');

  assert.match(normalization, /isCosmeticGradeCategoryOption/);
  assert.match(normalization, /customOptions\.push/);
  assert.match(normalization, /requiresCosmeticIssue/);
  const lotModel = read('models/lotModel.js');
  assert.match(expandedForm, /belongsToCosmeticGradeCategory/);
  assert.match(requirementOptions, /sortOrder: row\.sortOrder/);
  assert.match(lotModel, /system_config_category_id: value\.systemConfigCategoryId/);
});
