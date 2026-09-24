'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('processor management exposes family reassignment and delete actions on both processor surfaces', () => {
  const routes = read('routes/config.js');
  const catalog = read('views/pages/management-processors.ejs');
  const families = read('views/pages/processor-families.ejs');

  assert.match(routes, /processors\/:processorModelId\/families\/modal[\s\S]*?renderProcessorFamiliesModal/);
  assert.match(routes, /processors\/:processorModelId\/families'[\s\S]*?updateProcessorFamilies/);
  assert.match(routes, /processors\/:processorModelId\/delete\/modal[\s\S]*?renderDeleteProcessorModal/);
  assert.match(routes, /processors\/:processorModelId\/delete'[\s\S]*?deleteProcessor/);
  assert.match(catalog, />Families<\/a>/);
  assert.match(catalog, />Delete<\/a>/);
  assert.match(families, />Assign Family<\/a>/);
  assert.match(families, />Delete<\/a>/);
});

test('family membership management can move a processor by replacing mistaken memberships with manual selections', () => {
  const model = read('models/processorCatalogModel.js');
  const modal = read('views/fragments/processor-catalog-families-modal.ejs');

  assert.match(model, /async function replaceProcessorFamilyMemberships/);
  assert.match(model, /Every selected Processor Family must belong to the same Processor Type/);
  assert.match(model, /DELETE FROM processor_family_members WHERE processor_model_id = \?/);
  assert.match(model, /VALUES \(\?, \?, 'manual', \?, \?\)/);
  assert.match(model, /membership_version = membership_version \+ 1/);
  assert.match(modal, /uncheck the incorrect family and check the correct one/i);
  assert.match(modal, /name="processorFamilyIds"/);
  assert.match(modal, /Save Family Memberships/);
});

test('permanent delete removes catalog-only relationships but preserves approved request history by treating it as usage', () => {
  const model = read('models/processorCatalogModel.js');
  const modal = read('views/fragments/processor-catalog-delete-modal.ejs');

  assert.match(model, /DELETE FROM unit_model_processor_options WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_family_members WHERE processor_model_id = \?/);
  assert.match(model, /SELECT COUNT\(\*\) AS count_value FROM unit_processor_catalog_requests WHERE approved_processor_model_id = \?/);
  assert.doesNotMatch(model, /SET approved_processor_model_id = NULL WHERE approved_processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_models WHERE processor_model_id = \? LIMIT 1/);
  assert.match(modal, /Catalog-only Unit Model compatibility mappings and Processor Family memberships are removed/i);
  assert.match(modal, /approved Processor Requests/i);
});

test('delete safely retires a processor when Units, approved Requests, or direct Lot requirements still depend on it', () => {
  const model = read('models/processorCatalogModel.js');
  const modal = read('views/fragments/processor-catalog-delete-modal.ejs');

  assert.match(model, /SELECT COUNT\(\*\) AS count_value FROM units WHERE processor_model_id = \?/);
  assert.match(model, /SELECT COUNT\(\*\) AS count_value FROM lot_requirements WHERE processor_model_id = \?/);
  assert.match(model, /SELECT COUNT\(\*\) AS count_value FROM unit_processor_catalog_requests WHERE approved_processor_model_id = \?/);
  assert.match(model, /unitCount > 0 \|\| lotRequirementCount > 0 \|\| requestCount > 0/);
  assert.match(model, /UPDATE processor_models SET is_active = 0 WHERE processor_model_id = \? LIMIT 1/);
  assert.match(model, /retired: true/);
  assert.match(modal, /willRetire = Number\(processor\.unitCount[\s\S]*processor\.requestCount[\s\S]*processor\.lotRequirementCount/);
  assert.doesNotMatch(modal, /disabled/);
  assert.match(modal, /Remove from Active Catalog/);
});
