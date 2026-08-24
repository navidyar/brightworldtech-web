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

test('Processor request modal loads review-only catalog data once and only while pending', () => {
  const controller = read('controllers/unitRequestController.js');
  const detail = functionBody(controller, 'renderUnitRequestDetail', 'withdrawUnitRequest');

  assert.match(detail, /needsProcessorReviewData[\s\S]*request\.isPending[\s\S]*canReviewThisRequest/);
  assert.match(detail, /Promise\.all\([\s\S]*listActiveProcessorBrands[\s\S]*listProcessorCatalogOptions\(\{ includeInactive: true \}\)/);
  assert.match(detail, /processorCatalogOptions = allProcessorCatalogOptions\.filter\(\(processor\) => processor\.isActive\)/);
  assert.match(detail, /processorOptions: allProcessorCatalogOptions/);
});

test('Processor Catalog option loader avoids correlated per-processor subqueries', () => {
  const model = read('models/processorCatalogModel.js');
  const options = functionBody(model, 'listProcessorCatalogOptions', 'findLikelyProcessorMatches');
  const matches = functionBody(model, 'findLikelyProcessorMatches', 'listProcessorModels');

  assert.match(options, /LEFT JOIN unit_model_processor_options umpo/);
  assert.match(options, /GROUP_CONCAT\(DISTINCT umpo\.unit_model_id/);
  assert.doesNotMatch(options, /SELECT COUNT\(\*\)[\s\S]*FROM unit_model_processor_options umpo_count/);
  assert.doesNotMatch(options, /FROM unit_model_processor_options umpo_assoc[\s\S]*WHERE umpo_assoc\.processor_model_id = pm\.processor_model_id/);
  assert.match(matches, /Array\.isArray\(processorOptions\)/);
});

test('Override request detail avoids full Lot model work and only loads assignable Lots when review needs them', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/overrideRequestModel.js');
  const detail = functionBody(controller, 'renderOverrideRequestDetail', 'withdrawOverrideRequest');
  const getRequest = functionBody(model, 'getOverrideRequestById', 'getPendingOverrideRequestForUnit');
  const getAssignable = functionBody(model, 'getAssignableLotOptions', 'listAssignableLots');

  assert.match(detail, /needsAssignableLots[\s\S]*request\.isPending[\s\S]*manual_tech_override_request/);
  assert.match(detail, /\? await overrideRequestModel\.getAssignableLotOptions\(\)[\s\S]*: \{ lots: \[\], hierarchyOptions: \[\] \}/);
  assert.doesNotMatch(getAssignable, /lotModel\.listLots/);
  assert.match(getAssignable, /listLotReferenceRows\(\)/);
  assert.doesNotMatch(getRequest, /getLotNameMap\(\)/);
  assert.match(getRequest, /LEFT JOIN lots current_lot/);
  assert.match(getRequest, /LEFT JOIN lots destination_lot/);
});

test('Unit request base detail and event history load concurrently', () => {
  const model = read('models/unitRequestModel.js');
  const detail = functionBody(model, 'getUnitRequestById', 'recordRequestEvent');

  assert.match(detail, /const requestPromise = listUnitRequests/);
  assert.match(detail, /const eventsPromise = pool\.query/);
  assert.match(detail, /Promise\.all\(\[requestPromise, eventsPromise\]\)/);
});

test('Request modal opens an immediate loading shell before waiting for detail fetch', () => {
  const script = read('public/js/unit-requests.js');
  const page = read('views/pages/unit-requests.ejs');

  assert.match(script, /function renderRequestLoadingModal/);
  assert.match(script, /Loading request details…/);
  assert.match(script, /renderRequestLoadingModal\(link\.getAttribute\('aria-label'\)/);
  assert.match(page, /unit-requests\.js\?v=20260820-stage10w69n-request-detail-performance/);
});
