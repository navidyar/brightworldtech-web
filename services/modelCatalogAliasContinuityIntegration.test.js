'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('every approved Model Catalog request saves the observed model as an intake alias to the final Catalog Model', () => {
  const model = read('models/unitRequestModel.js');
  const start = model.indexOf('async function approveModelCatalogRequest');
  const end = model.indexOf('async function approveProcessorCatalogRequest');
  assert.ok(start >= 0 && end > start);
  const approval = model.slice(start, end);

  assert.match(approval, /if \(safeExistingUnitModelId\)[\s\S]*approvedUnitModelId = existingTarget\.id/);
  assert.match(approval, /else \{[\s\S]*approvedUnitModelId = Number\(insertResult\.insertId\)/);
  assert.match(approval, /await unitModelCatalogModel\.saveUnitModelIntakeMapping\(\{[\s\S]*observedManufacturerId: request\.manufacturer_id[\s\S]*observedUnitCategoryConfigValueId: requestedCategoryId[\s\S]*observedModelName: request\.requested_model_name[\s\S]*targetUnitModelId: approvedUnitModelId/);
  assert.match(approval, /intakeMappingCreated: true/);
});

test('inactive exact Model approval reactivates the target before saving the alias', () => {
  const model = read('models/unitRequestModel.js');
  const start = model.indexOf('async function approveModelCatalogRequest');
  const end = model.indexOf('async function approveProcessorCatalogRequest');
  const approval = model.slice(start, end);
  const reactivate = approval.indexOf("UPDATE unit_models SET is_active = 1 WHERE unit_model_id = ? LIMIT 1");
  const saveAlias = approval.indexOf('saveUnitModelIntakeMapping');
  assert.ok(reactivate >= 0 && saveAlias > reactivate);
});

test('manual Incoming Model Aliases remain attachable to Catalog Models under Manage Unit Models', () => {
  const routes = read('routes/config.js');
  const controller = read('controllers/unitModelCatalogController.js');
  const modal = read('views/fragments/unit-model-mappings-modal.ejs');

  assert.match(routes, /management\/config\/models\/:unitModelId\/mappings'[\s\S]*configuration\.models\.manage[\s\S]*createUnitModelMapping/);
  assert.match(controller, /createUnitModelMapping[\s\S]*saveUnitModelIntakeMapping\(\{[\s\S]*targetUnitModelId: unitModel\.id/);
  assert.match(modal, /Incoming Model Aliases/);
  assert.match(modal, /name="observedUnitCategoryConfigValueId"/);
  assert.match(modal, /name="observedModelName"/);
  assert.match(modal, />Save Alias<\/button>/);
});

test('active intake aliases continue to resolve future Tool model intake to active Catalog Models', () => {
  const catalog = read('models/unitModelCatalogModel.js');
  const techModel = read('models/techUnitModel.js');

  assert.match(catalog, /findUnitModelIntakeMapping[\s\S]*mapping\.is_active = 1/);
  assert.match(catalog, /INNER JOIN unit_models target[\s\S]*target\.is_active = 1/);
  assert.match(techModel, /unit_model_intake_mappings/);
});
