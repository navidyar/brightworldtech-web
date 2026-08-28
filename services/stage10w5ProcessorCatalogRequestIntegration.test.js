'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Add/Edit Unit roles can request a Processor addition from Add or Edit Unit', () => {
  const formTemplate = read('views/fragments/tech-unit-form.ejs');
  const formScript = read('public/js/tech-unit-form.js');

  assert.match(formTemplate, /const canRequestProcessorCatalogException = Boolean\(formOptions\.canRequestCatalogException\)/);
  assert.doesNotMatch(formTemplate, /const canRequestProcessorCatalogException = !isEditMode/);
  assert.match(formTemplate, /data-processor-catalog-empty-message/);
  assert.match(formTemplate, /No compatible processors are cataloged for this Unit Model/);
  assert.match(formScript, /compatibleProcessorCount/);
  assert.match(formScript, /requestedProcessorSpeedGhz/);
  assert.match(formScript, /data-processor-speed-input/);
});

test('Processor Catalog request captures type, processor, speed, and source note', () => {
  const modal = read('views/fragments/tech-unit-catalog-request-modal.ejs');
  const controller = read('controllers/catalogRequestController.js');

  assert.match(modal, /name="requestedProcessorType"/);
  assert.match(modal, /name="requestedProcessorName"/);
  assert.match(modal, /name="requestedProcessorSpeedGhz"/);
  assert.match(modal, /min="0\.01" max="99\.99" step="0\.01" required/);
  assert.match(controller, /normalizeProcessorSpeed/);
  assert.match(controller, /requestedProcessorSpeedGhz/);
  assert.match(controller, /0\.01 through 99\.99 GHz/);
  assert.match(controller, /createProcessorCatalogRequest\(\{/);
});

test('Processor Catalog request storage and queue mapping preserve observed speed', () => {
  const model = read('models/unitRequestModel.js');

  assert.match(model, /requested_processor_speed_ghz/);
  assert.match(model, /INSERT INTO unit_processor_catalog_requests/);
  assert.match(model, /requestedProcessorSpeedGhz: safeRequestedProcessorSpeedGhz/);
  assert.match(model, /approved_processor_model\.base_speed_ghz AS approved_processor_base_speed_ghz/);
  assert.match(model, /detailLabel:.*requestedProcessorSpeedGhz/s);
});

test('Management can create or reuse a Processor Type and map the approved Processor', () => {
  const requestDetail = read('views/pages/unit-request-detail.ejs');
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(requestDetail, /name="approvedProcessorBrandId"/);
  assert.match(requestDetail, /<select name="approvedProcessorBrandId"[\s\S]*?<option value="">[\s\S]*?<\/option>[\s\S]*?processorBrands\.forEach/);
  assert.match(requestDetail, /name="approvedProcessorBrandName"/);
  assert.match(requestDetail, /value="<%= request\.catalogContext\.requestedProcessorSpeedGhz \|\| '' %>"/);
  assert.match(controller, /approvedProcessorBrandName: req\.body\.approvedProcessorBrandName/);
  assert.match(model, /resolveProcessorBrandForApproval/);
  assert.match(model, /INSERT INTO processor_brands/);
  assert.match(model, /INSERT INTO unit_model_processor_options/);
  assert.match(model, /connection: providedConnection = null/);
});

test('request detail shows observed and canonical Processor speeds', () => {
  const requestDetail = read('views/pages/unit-request-detail.ejs');

  assert.match(requestDetail, /request\.catalogContext\.requestedProcessorSpeedGhz/);
  assert.match(requestDetail, /request\.catalogContext\.approvedProcessorBaseSpeedGhz/);
  assert.match(requestDetail, /Processor Speed/);
});

test('Stage 10W.5 migration safely adds structured requested Processor speed', () => {
  const migration = read('sql/2026-08-stage-10w5-processor-catalog-request-speed.sql');
  const applyScript = read('scripts/apply-stage-10w5-processor-catalog-request-speed.sh');

  assert.match(migration, /requested_processor_speed_ghz DECIMAL\(5,2\) NULL/);
  assert.match(migration, /refusing destructive replacement/);
  assert.match(migration, /chk_unit_processor_catalog_requested_speed/);
  assert.match(applyScript, /Stage 10W\.5 Processor Catalog request-speed migration verified complete/);
});
