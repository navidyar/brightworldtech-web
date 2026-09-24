'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('SFF is added as an idempotent data-driven Unit Category migration', () => {
  const migration = read('scripts/migrateSffUnitCategory.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(migration, /SYSTEM_CONFIG_CATEGORY_IDS\.UNIT_CATEGORIES/);
  assert.match(migration, /CATEGORY_CODE = 'sff'/);
  assert.match(migration, /CATEGORY_LABEL = 'SFF'/);
  assert.match(migration, /CATEGORY_DESCRIPTION = 'Small Form Factor'/);
  assert.match(migration, /No database changes were made/);
  assert.match(migration, /Multiple SFF\/Small Form Factor Unit Category values already exist/);
  assert.equal(packageJson.scripts['audit:sff-unit-category'], 'node scripts/migrateSffUnitCategory.js');
  assert.equal(packageJson.scripts['migrate:sff-unit-category'], 'node scripts/migrateSffUnitCategory.js --apply');
});

test('Admin Model Request review can edit both canonical name and active Unit Category', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const detail = read('views/pages/unit-request-detail.ejs');

  assert.match(controller, /const unitModelCatalogModel = require\('\.\.\/models\/unitModelCatalogModel'\);/);
  assert.match(controller, /needsModelReviewData[\s\S]*MODEL_CATALOG_REQUEST_TYPE/);
  assert.match(controller, /modelUnitCategories = await unitModelCatalogModel\.listUnitCategories\(\)/);
  assert.match(controller, /approvedUnitCategoryConfigValueId: req\.body\.approvedUnitCategoryConfigValueId/);
  assert.match(detail, /<select name="approvedUnitCategoryConfigValueId" required>/);
  assert.match(detail, /modelUnitCategories\.forEach/);
  assert.match(detail, /request\.catalogContext\.unitCategoryConfigValueId/);
  assert.match(detail, /name="approvedModelName"/);
  assert.match(detail, /Choose the category this canonical model should actually use/);

  assert.match(model, /approvedUnitCategoryConfigValueId/);
  assert.match(model, /safeApprovedCategoryId = normalizePositiveInteger/);
  assert.match(model, /assertActiveModelRequestContext\(connection, request\.manufacturer_id, safeApprovedCategoryId\)/);
  assert.match(model, /SET unit_category_config_value_id = \?, approved_model_name = \?, approved_unit_model_id = \?/);
  assert.match(model, /requestedUnitCategoryConfigValueId: requestedCategoryId/);
  assert.match(model, /approvedUnitCategoryConfigValueId: context\.unitCategoryConfigValueId/);
});

test('Model approval validates and searches within the reviewer-selected category before creating a catalog row', () => {
  const model = read('models/unitRequestModel.js');
  const approvalStart = model.indexOf('async function approveModelCatalogRequest');
  const processorStart = model.indexOf('async function approveProcessorCatalogRequest');
  assert.ok(approvalStart >= 0 && processorStart > approvalStart);
  const approval = model.slice(approvalStart, processorStart);

  assert.match(approval, /const context = await assertActiveModelRequestContext\(connection, request\.manufacturer_id, safeApprovedCategoryId\)/);
  assert.match(approval, /WHERE manufacturer_id = \?[\s\S]*AND unit_category_config_value_id = \?[\s\S]*LOWER\(TRIM\(model_name\)\)/);
  assert.match(approval, /INSERT INTO unit_models[\s\S]*unit_category_config_value_id[\s\S]*context\.unitCategoryConfigValueId/);
});
