'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 2 adds Screen Sizes as an ID-bound configuration category', () => {
  const registry = read('config/configIdentityRegistry.js');
  const configModel = read('models/configModel.js');

  assert.match(registry, /SCREEN_SIZES:\s*33/);
  assert.match(registry, /SYSTEM_CONFIG_CATEGORY_IDS\.SCREEN_SIZES, 'Screen Sizes'/);
  assert.match(configModel, /SYSTEM_CONFIG_CATEGORY_IDS\.SCREEN_SIZES/);
});

test('Screen Size is general while Model Year is an Apple-applicable Unit field with Lot controls', () => {
  const screenSize = getUnitFormFieldDefinition('screen_size');
  const modelYear = getUnitFormFieldDefinition('model_year');
  const configurableKeys = new Set(listLotConfigurableUnitFormFields().map((field) => field.key));

  assert.equal(screenSize.storagePath, 'units.screen_size_config_value_id');
  assert.equal(modelYear.storagePath, 'units.model_year');
  assert.equal(screenSize.visibilityConfigurable, true);
  assert.equal(screenSize.requirementConfigurable, true);
  assert.equal(modelYear.visibilityConfigurable, true);
  assert.equal(modelYear.requirementConfigurable, true);
  assert.deepEqual(modelYear.applicableManufacturers, ['Apple']);
  assert.equal(configurableKeys.has('screen_size'), true);
  assert.equal(configurableKeys.has('model_year'), true);
});

test('Add/Edit Unit renders blank Screen Size and Model Year controls without true default values', () => {
  const form = read('views/fragments/tech-unit-form.ejs');
  assert.match(form, /data-unit-form-field-key="screen_size"[\s\S]*?<option value="">Choose an option<\/option>/);
  assert.match(form, /data-unit-form-field-key="model_year" data-apple-only-field/);
  assert.match(form, /name="modelYear" value="<%= formData\.modelYear \|\| '' %>"/);
  assert.match(form, /name="screenSizeConfigValueId"/);
});

test('Apple normalization migration deactivates MacBook category and remaps current category assignments to Laptop', () => {
  const migration = read('scripts/migrateAppleCatalogNormalization.js');
  assert.match(migration, /UPDATE unit_models SET unit_category_config_value_id = \? WHERE unit_category_config_value_id = \?/);
  assert.match(migration, /UPDATE units SET unit_category_config_value_id = \? WHERE unit_category_config_value_id = \?/);
  assert.match(migration, /UPDATE config_values SET is_active = 0 WHERE config_value_id = \?/);
});

test('Apple normalization preserves parsed screen size/year and merges processor compatibility before deactivating source models', () => {
  const migration = read('scripts/migrateAppleCatalogNormalization.js');
  assert.match(migration, /screen_size_config_value_id = COALESCE\(screen_size_config_value_id, \?\)/);
  assert.match(migration, /model_year = COALESCE\(model_year, \?\)/);
  assert.match(migration, /mergeProcessorCompatibility\(connection, source\.id, targetModelId\)/);
  assert.match(migration, /UPDATE unit_models SET is_active = 0 WHERE unit_model_id = \?/);
});

test('Apple Screen Size catalog includes the requested additional sizes', () => {
  const normalization = require('./appleCatalogNormalization');
  for (const size of ['13.6-inch', '15.4-inch', '17-inch']) {
    assert.equal(normalization.DEFAULT_SCREEN_SIZE_LABELS.includes(size), true, `${size} should be seeded.`);
  }
});

test('generic Apple target catalog covers laptops, desktops, and requested iPad families', () => {
  const normalization = read('services/appleCatalogNormalization.js');
  for (const model of ['MacBook Air', 'MacBook Pro', 'iMac', 'Mac mini', 'Mac Studio', 'iPad Air', 'iPad Pro']) {
    assert.match(normalization, new RegExp(`modelName: '${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(normalization, /categoryKind: 'tablet'/);
});

test('controller accepts only configured Screen Size IDs and a bounded four-digit Model Year', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /formOptions\.screenSizes/);
  assert.match(controller, /Choose a valid Screen Size\./);
  assert.match(controller, /parsedModelYear < 1980 \|\| parsedModelYear > 2100/);
});

test('Screen Size and Model Year are available as optional export columns', () => {
  const contract = require('../config/unitExportContract');
  const service = read('services/unitExportService.js');
  const columns = new Map(contract.UNIT_EXPORT_COLUMNS.map((column) => [column.key, column]));

  assert.equal(columns.get('screenSize').label, 'Screen Size');
  assert.equal(columns.get('screenSize').defaultSelected, false);
  assert.equal(columns.get('modelYear').label, 'Model Year');
  assert.equal(columns.get('modelYear').defaultSelected, false);
  assert.match(service, /screenSize: normalizeText\(unit\.screenSizeLabel\)/);
  assert.match(service, /modelYear: isApple && unit\.modelYear/);
});

test('Screen Size and Model Year participate in strict Lot Requirements', () => {
  const registry = require('../config/lotRequirementRegistry');
  const requirementOptions = read('models/requirementOptionModel.js');
  const workflow = read('services/techLotRequirementWorkflow.js');
  const validationModel = read('models/lotValidationModel.js');
  const evaluator = read('services/lotRequirementEvaluator.js');

  const screenSize = registry.getLotRequirementField('screen_size');
  const modelYear = registry.getLotRequirementField('model_year');
  assert.equal(screenSize.storageKind, 'config_value');
  assert.equal(screenSize.optionSource, 'screen_size');
  assert.deepEqual(screenSize.allowedOperators, ['equals']);
  assert.equal(modelYear.storageKind, 'number');
  assert.deepEqual(modelYear.allowedOperators, ['equals', 'greater_equal', 'less_equal']);
  assert.deepEqual(modelYear.applicableManufacturers, ['Apple']);
  assert.match(requirementOptions, /screen_size: SYSTEM_CONFIG_CATEGORY_IDS\.SCREEN_SIZES/);
  assert.equal(require('../config/configIdentityRegistry').SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY.screen_size, 329);
  assert.equal(require('../config/configIdentityRegistry').SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY.model_year, 330);
  assert.match(workflow, /screen_size: createCatalogActual/);
  assert.match(workflow, /model_year: createNumberActual/);
  assert.match(validationModel, /u\.screen_size_config_value_id/);
  assert.match(validationModel, /u\.model_year/);
  assert.match(evaluator, /screen_size: createCatalogActual/);
  assert.match(evaluator, /model_year: createNumberActual/);
});

test('Apple normalization remaps dependent model/category references instead of leaving stale Lot and request references', () => {
  const migration = read('scripts/migrateAppleCatalogNormalization.js');
  assert.match(migration, /remapUnitModelReferenceIfPresent\(connection, 'lot_requirements', 'unit_model_id'/);
  assert.match(migration, /remapUnitModelReferenceIfPresent\(connection, 'unit_model_catalog_requests', 'approved_unit_model_id'/);
  assert.match(migration, /remapUnitModelReferenceIfPresent\(connection, 'unit_processor_catalog_requests', 'unit_model_id'/);
  assert.match(migration, /UPDATE lot_requirements SET requirement_config_value_id = \? WHERE requirement_config_value_id = \?/);
});

test('Apple normalization audit preflights duplicate generic targets and Screen Size options before applying', () => {
  const migration = read('scripts/migrateAppleCatalogNormalization.js');
  assert.match(migration, /validateTargetCatalogPreflight\(connection, appleManufacturerId, screenSizeCategoryId\)/);
  assert.match(migration, /Multiple Apple Unit Models are named/);
  assert.match(migration, /Multiple configuration values in category/);
});


test('Model Year dynamically hides for non-Apple manufacturers and is excluded from non-Apple requirement enforcement', () => {
  const formScript = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');
  const evaluator = read('services/lotRequirementEvaluator.js');
  const details = read('views/fragments/tech-units-table.ejs');

  assert.match(formScript, /function applyManufacturerFieldApplicability/);
  assert.match(formScript, /data-apple-only-field/);
  assert.match(controller, /applyManufacturerApplicabilityToUnitFormProfile/);
  assert.match(evaluator, /isRequirementApplicableToUnit/);
  assert.match(details, /manufacturerLabel[^\n]*toLowerCase\(\) === 'apple'/);
});
