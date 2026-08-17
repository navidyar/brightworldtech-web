'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Config Values page exposes Processor Types from the processor catalog without adding another configuration tab', () => {
  const page = read('views/pages/management-config.ejs');
  const processorTypesCategory = read('views/fragments/processor-types-config-category.ejs');
  const nav = read('views/partials/configuration-nav.ejs');

  assert.match(page, /processor-types-config-category/);
  assert.match(processorTypesCategory, /<strong>Processor Types<\/strong>/);
  assert.match(processorTypesCategory, /Add Processor Type/);
  assert.match(processorTypesCategory, /processor-types\/<%= processorType\.id %>\/edit\/modal/);
  assert.match(processorTypesCategory, />Deactivate<\/a>/);
  assert.match(processorTypesCategory, />Delete<\/a>/);
  assert.doesNotMatch(nav, /Processor Types/);
});

test('Processor Type create edit activate deactivate and delete routes remain Admin-only', () => {
  const routes = read('routes/config.js');
  for (const fragment of [
    "'/management/config/processor-types/new/modal'",
    "'/management/config/processor-types'",
    "'/management/config/processor-types/:processorBrandId/edit/modal'",
    "'/management/config/processor-types/:processorBrandId/:actionType/modal'",
    "'/management/config/processor-types/:processorBrandId/:actionType'"
  ]) {
    const index = routes.indexOf(fragment);
    assert.notEqual(index, -1, `missing route ${fragment}`);
    assert.match(routes.slice(index, index + 220), /requireRole\(configRoles\)/);
  }
});

test('Processor Types management reads and writes processor_brands, not generic config_values', () => {
  const model = read('models/configModel.js');
  const controller = read('controllers/configController.js');

  assert.match(model, /async function listProcessorTypes/);
  assert.match(model, /FROM processor_brands pb/);
  assert.match(model, /INSERT INTO processor_brands \(code, name, is_active\)/);
  assert.match(model, /UPDATE processor_brands[\s\S]*?SET code = \?, name = \?, is_active = \?/);
  assert.match(controller, /configModel\.listProcessorTypes\(\{ includeInactive: includeInactiveValues \}\)/);
});

test('Processor Type deletion blocks live catalog dependencies while preserving request history by clearing only the obsolete brand link', () => {
  const model = read('models/configModel.js');
  const modal = read('views/fragments/processor-type-status-modal.ejs');

  assert.match(model, /SELECT COUNT\(\*\) AS count FROM processor_models WHERE processor_brand_id = \?/);
  assert.match(model, /SELECT COUNT\(\*\) AS count FROM processor_families WHERE processor_brand_id = \?/);
  assert.match(model, /SELECT COUNT\(\*\) AS count FROM unit_processor_catalog_requests WHERE approved_processor_brand_id = \?/);
  assert.match(model, /if \(usage\.processorCount \|\| usage\.familyCount\)/);
  assert.match(model, /UPDATE unit_processor_catalog_requests SET approved_processor_brand_id = NULL WHERE approved_processor_brand_id = \?/);
  assert.match(model, /DELETE FROM processor_brands WHERE processor_brand_id = \? LIMIT 1/);
  assert.match(modal, /cannot be permanently deleted while Processors or Processor Families still reference it/);
  assert.match(modal, /Approved request history will remain/);
});

test('normal Unit and request Processor Type selectors continue to use active processor_brands', () => {
  const techUnitModel = read('models/techUnitModel.js');
  const requestModel = read('models/unitRequestModel.js');

  assert.match(techUnitModel, /const activeFilter = hasColumn\(columns, 'is_active'\) \? 'WHERE is_active = 1' : '';/);
  assert.match(techUnitModel, /FROM processor_brands[\s\S]*?\$\{activeFilter\}/);
  assert.match(requestModel, /SELECT processor_brand_id, name[\s\S]*?FROM processor_brands[\s\S]*?WHERE is_active = 1/);
});

test('Processor Type form keeps model names out of the brand/type list and supports stable codes', () => {
  const form = read('views/fragments/processor-type-form-modal.ejs');
  const controller = read('controllers/configController.js');

  assert.match(form, /Processor model names do not belong here/);
  assert.match(form, /name="name"/);
  assert.match(form, /name="code"/);
  assert.match(form, /name="isActive"/);
  assert.match(controller, /normalizeProcessorTypeCode/);
  assert.match(controller, /processorTypeIdentityExists\(\{[\s\S]*?code: formData\.code,[\s\S]*?name: formData\.name/);
});
