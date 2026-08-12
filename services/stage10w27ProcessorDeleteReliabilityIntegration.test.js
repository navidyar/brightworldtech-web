'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('processor delete remains actionable when historical references exist', () => {
  const modal = read('views/fragments/processor-catalog-delete-modal.ejs');
  assert.match(modal, /willRetire/);
  assert.match(modal, /Remove from Active Catalog/);
  assert.doesNotMatch(modal, /type="submit"[^>]*disabled/);
});

test('referenced processors are retired without removing relationships needed for history', () => {
  const model = read('models/processorCatalogModel.js');
  const referencedBranch = model.slice(
    model.indexOf('if (unitCount > 0 || lotRequirementCount > 0)'),
    model.indexOf('let removedModelMappings = 0')
  );
  assert.match(referencedBranch, /UPDATE processor_models SET is_active = 0/);
  assert.match(referencedBranch, /retired: true/);
  assert.doesNotMatch(referencedBranch, /DELETE FROM unit_model_processor_options/);
  assert.doesNotMatch(referencedBranch, /DELETE FROM processor_family_members/);
  assert.doesNotMatch(referencedBranch, /approved_processor_model_id = NULL/);
});

test('unreferenced processors still use permanent deletion cleanup', () => {
  const model = read('models/processorCatalogModel.js');
  assert.match(model, /DELETE FROM unit_model_processor_options WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_family_members WHERE processor_model_id = \?/);
  assert.match(model, /UPDATE unit_processor_catalog_requests SET approved_processor_model_id = NULL WHERE approved_processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_models WHERE processor_model_id = \? LIMIT 1/);
});

test('foreign-key delete conflicts fall back to safe retirement instead of failing the action', () => {
  const model = read('models/processorCatalogModel.js');
  assert.match(model, /ER_ROW_IS_REFERENCED_2/);
  assert.match(model, /retainedByForeignKey: true/);
  assert.match(model, /await connection\.beginTransaction\(\)[\s\S]*?UPDATE processor_models SET is_active = 0/);
});

test('controller reports whether the action permanently deleted or retired the processor', () => {
  const controller = read('controllers/processorCatalogController.js');
  const catalog = read('views/pages/management-processors.ejs');
  const families = read('controllers/processorFamilyController.js');
  assert.match(controller, /result\?\.retired \? 'retired' : 'deleted'/);
  assert.match(catalog, /retired: 'Processor removed from the active catalog/);
  assert.match(families, /notice === 'retired'/);
});
