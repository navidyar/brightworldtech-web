'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `${name} should exist`);
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('Admin Processor Catalog exposes direct Add Processor through the existing modal contract', () => {
  const routes = read('routes/config.js');
  const controller = read('controllers/processorCatalogController.js');
  const model = read('models/processorCatalogModel.js');
  const page = read('views/pages/management-processors.ejs');
  const modal = read('views/fragments/processor-catalog-edit-modal.ejs');

  assert.match(routes, /\/management\/config\/processors\/new\/modal[\s\S]*requireRole\(configRoles\)[\s\S]*renderNewProcessorModal/);
  assert.match(routes, /\/management\/config\/processors\/new\/modal[\s\S]*requireRole\(configRoles\)[\s\S]*createProcessor/);
  assert.match(controller, /async function createProcessor/);
  assert.match(model, /async function createProcessorModel[\s\S]*INSERT INTO processor_models[\s\S]*autoAssignProcessorFamilyMembershipWithConnection/);
  assert.match(page, />Add Processor</);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/new\/modal/);
  assert.match(modal, /isCreate \? 'Add Processor' : 'Edit Processor'/);
});

test('Requests queue avoids full hierarchy work and narrows override status at the database boundary', () => {
  const controller = read('controllers/unitRequestController.js');
  const unitModel = read('models/unitRequestModel.js');
  const overrideModel = read('models/overrideRequestModel.js');
  const listUnitRequests = functionBody(unitModel, 'listUnitRequests', 'archiveResolvedUnitRequests');
  const listOverrideRequests = functionBody(overrideModel, 'listOverrideRequests', 'getLatestOverrideRequestMapForUnits');

  assert.doesNotMatch(listUnitRequests, /lotModel\.listLots/);
  assert.match(listUnitRequests, /requests: rowsResult\.map\(\(row\) => mapRequest\(row\)\)/);
  assert.match(unitModel, /matched_current_lot\.name AS current_matched_lot_name/);
  assert.match(unitModel, /requested_destination_lot\.name AS requested_destination_lot_name/);
  assert.match(controller, /getOverrideQueueStatusFilter/);
  assert.match(controller, /includeAssignableLots: false/);
  assert.match(controller, /statusFilter === 'archived'[\s\S]*Promise\.resolve/);
  assert.doesNotMatch(listOverrideRequests, /getLotNameMap\(/);
  assert.match(listOverrideRequests, /includeAssignableLots !== false/);
  assert.match(listOverrideRequests, /current_lot\.name AS current_lot_name/);
});

test('Request details open and review inside the queue modal while remaining directly navigable', () => {
  const page = read('views/pages/unit-requests.ejs');
  const script = read('public/js/unit-requests.js');
  const processorReview = read('public/js/processor-request-review.js');
  const navigation = read('public/js/navigation-policy.js');
  const css = read('public/css/unit-requests.css');

  assert.match(page, /id="modal-root"/);
  assert.match(page, /\/js\/modal\.js/);
  assert.match(page, /data-unit-request-detail-link[\s\S]*data-modal-trigger/);
  assert.match(script, /async function openRequestDetail/);
  assert.match(script, /new DOMParser\(\)/);
  assert.match(script, /unit-request-detail-modal/);
  assert.match(script, /async function submitRequestModalForm/);
  assert.match(script, /unit-request:modal-loaded/);
  assert.match(processorReview, /unit-request:modal-loaded/);
  assert.match(navigation, /data-unit-request-detail-link/);
  assert.match(css, /\.unit-request-detail-modal/);
});
