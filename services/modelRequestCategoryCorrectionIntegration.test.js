'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Model Request review shows observed category and keeps Catalog Unit Category editable', () => {
  const view = read('views/pages/unit-request-detail.ejs');
  assert.match(view, /Observed Unit Category:/);
  assert.match(view, /name="approvedUnitCategoryConfigValueId" required data-model-category-select/);
  assert.match(view, /create or reuse a separate same-name model in the chosen category/);
  const categoryBlock = view.slice(view.indexOf('Catalog Unit Category'), view.indexOf('Create a New Catalog Model'));
  assert.doesNotMatch(categoryBlock, /data-new-model-field/);
});

test('existing Model choices carry their saved category into the editable category control', () => {
  const view = read('views/pages/unit-request-detail.ejs');
  const client = read('public/js/model-request-review.js');
  assert.match(view, /data-use-existing-model-category-id=/);
  assert.match(view, /data-model-category-id=/);
  assert.match(client, /const categorySelect = form\.querySelector\('\[data-model-category-select\]'\)/);
  assert.match(client, /categorySelect\.value = resolvedCategoryId/);
  assert.match(client, /categorySelect\?\.addEventListener\('change', syncMode\)/);
});

test('changing category while an existing Catalog Model is selected creates or reuses a category-specific same-name record', () => {
  const model = read('models/unitRequestModel.js');
  const start = model.indexOf('async function approveModelCatalogRequest');
  const end = model.indexOf('function normalizeProcessorBrandCode', start);
  const approval = model.slice(start, end);
  assert.match(approval, /const categoryChanged = Number\(existingTarget\.unitCategoryConfigValueId\) !== Number\(safeApprovedCategoryId\)/);
  assert.match(approval, /canonicalModelName = existingTarget\.modelName/);
  assert.match(approval, /unit_category_config_value_id = \?[\s\S]*LOWER\(TRIM\(model_name\)\) = LOWER\(TRIM\(\?\)\)/);
  assert.match(approval, /Category-specific model added/);
  assert.match(approval, /Existing category-specific model mapped/);
  assert.match(approval, /categoryAdjustedFromSelectedModel/);
});

test('category correction still maps the original observed category and model text to the final Catalog Model', () => {
  const model = read('models/unitRequestModel.js');
  const start = model.indexOf('async function approveModelCatalogRequest');
  const end = model.indexOf('function normalizeProcessorBrandCode', start);
  const approval = model.slice(start, end);
  assert.match(approval, /observedUnitCategoryConfigValueId: requestedCategoryId/);
  assert.match(approval, /observedModelName: request\.requested_model_name/);
  assert.match(approval, /targetUnitModelId: approvedUnitModelId/);
});
