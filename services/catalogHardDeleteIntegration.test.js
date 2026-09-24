'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Unit Model Catalog exposes an Admin delete flow before the generic activate/deactivate route', () => {
  const routes = read('routes/config.js');
  const page = read('views/pages/management-unit-models.ejs');
  const deleteRouteIndex = routes.indexOf('/management/config/models/:unitModelId/delete/modal');
  const genericRouteIndex = routes.indexOf('/management/config/models/:unitModelId/:actionType/modal');

  assert.notEqual(deleteRouteIndex, -1);
  assert.ok(deleteRouteIndex < genericRouteIndex, 'specific delete route must be declared before the generic status route');
  assert.match(routes, /models\/:unitModelId\/delete\/modal[\s\S]*renderDeleteUnitModelModal/);
  assert.match(routes, /models\/:unitModelId\/delete'[\s\S]*deleteUnitModel/);
  assert.match(page, /models\/<%= model\.id %>\/delete\/modal/);
  assert.match(page, />Delete<\/a>/);
});

test('Unit Model hard delete preserves operational and request-history references', () => {
  const model = read('models/unitModelCatalogModel.js');
  const modal = read('views/fragments/unit-model-delete-modal.ejs');

  assert.match(model, /countReference\(connection, 'units', 'unit_model_id'/);
  assert.match(model, /countReference\(connection, 'lot_requirements', 'unit_model_id'/);
  assert.match(model, /countReference\(connection, 'unit_model_catalog_requests', 'approved_unit_model_id'/);
  assert.match(model, /countReference\(connection, 'unit_processor_catalog_requests', 'unit_model_id'/);
  assert.match(model, /unitCount > 0 \|\| lotRequirementCount > 0 \|\| modelRequestCount > 0 \|\| processorRequestCount > 0/);
  assert.match(model, /UPDATE unit_models SET is_active = 0 WHERE unit_model_id = \? LIMIT 1/);
  assert.match(modal, /referenced by Units, catalog Requests, or direct Lot requirements/i);
});

test('truly unused Unit Models are physically removed with catalog-only processor mappings', () => {
  const model = read('models/unitModelCatalogModel.js');
  const modal = read('views/fragments/unit-model-delete-modal.ejs');

  assert.match(model, /DELETE FROM unit_model_processor_options WHERE unit_model_id = \?/);
  assert.match(model, /DELETE FROM unit_models WHERE unit_model_id = \? LIMIT 1/);
  assert.match(modal, /no operational or request-history references/i);
  assert.match(modal, /Processor compatibility mappings attached only to this model will be removed/i);
  assert.match(modal, /Permanently Delete Model/);
});

test('Processor hard delete does not erase approved request history', () => {
  const model = read('models/processorCatalogModel.js');
  const modal = read('views/fragments/processor-catalog-delete-modal.ejs');

  assert.match(model, /SELECT COUNT\(\*\) AS count_value FROM unit_processor_catalog_requests WHERE approved_processor_model_id = \?/);
  assert.match(model, /unitCount > 0 \|\| lotRequirementCount > 0 \|\| requestCount > 0/);
  assert.doesNotMatch(model, /UPDATE unit_processor_catalog_requests SET approved_processor_model_id = NULL WHERE approved_processor_model_id = \?/);
  assert.match(modal, /approved Processor Requests/i);
});


test('Unit Model Catalog list uses the shared pool while ID lookup honors an injected transaction connection', () => {
  const model = read('models/unitModelCatalogModel.js');
  const listStart = model.indexOf('async function listUnitModels');
  const lookupStart = model.indexOf('async function getUnitModelById');
  const existsStart = model.indexOf('async function modelExists');
  const listSource = model.slice(listStart, lookupStart);
  const lookupSource = model.slice(lookupStart, existsStart);

  assert.match(listSource, /const \[rows\] = await pool\.query\(`/);
  assert.doesNotMatch(listSource, /connection\.query/);
  assert.match(lookupSource, /const \[rows\] = await connection\.query\(`/);
});
