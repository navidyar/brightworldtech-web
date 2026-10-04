'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Model Catalog exposes an obvious inactive-model recovery path and activation action', () => {
  const page = read('views/pages/management-unit-models.ejs');
  assert.match(page, />Show Inactive Models<\/a>/);
  assert.match(page, />Active Models Only<\/a>/);
  assert.match(page, /Show inactive models to reactivate or permanently delete retired catalog records/);
  assert.match(page, /model\.isActive \? 'deactivate' : 'activate'/);
});

test('Model Request likely matches use active catalog rows only and separate exact inactive history', () => {
  const model = read('models/unitModelCatalogModel.js');
  const controller = read('controllers/unitRequestController.js');
  const page = read('views/pages/unit-request-detail.ejs');

  assert.match(model, /findLikelyUnitModelMatches\(\{ manufacturerId, unitCategoryConfigValueId, modelName, limit = 6, includeInactive = false \}\)/);
  assert.match(model, /listUnitModels\(\{ manufacturerId, includeInactive \}\)/);
  assert.match(controller, /includeInactive: false/);
  assert.match(controller, /inactiveModelCatalogMatch/);
  assert.match(controller, /!model\.isActive/);
  assert.match(page, /Inactive catalog record found:/);
  assert.match(page, /not currently active/);
  assert.match(page, /already selected as the recommended Catalog Model/);
});


test('exact inactive Model Request match is selectable and approval reactivates only that exact retired record', () => {
  const requestPage = read('views/pages/unit-request-detail.ejs');
  const requestModel = read('models/unitRequestModel.js');

  assert.match(requestPage, /inactiveModelCatalogMatch\.id/);
  assert.match(requestPage, /Inactive — will reactivate/);
  assert.match(requestPage, /already selected as the recommended Catalog Model/);
  assert.match(requestModel, /inactiveTargetMatchesRequest/);
  assert.match(requestModel, /existingTarget\.unitCategoryConfigValueId\) === requestedCategoryId/);
  assert.match(requestModel, /normalizeText\(existingTarget\.modelName, 150\)\.toLowerCase\(\) === normalizeText\(request\.requested_model_name, 150\)\.toLowerCase\(\)/);
  assert.match(requestModel, /Only the exact inactive Unit Model found for this request can be reactivated here/);
  assert.match(requestModel, /UPDATE unit_models SET is_active = 1 WHERE unit_model_id = \? LIMIT 1/);
  assert.match(requestModel, /existingTarget\.isActive \? 'Existing model mapped' : 'Inactive model reactivated'/);
});
