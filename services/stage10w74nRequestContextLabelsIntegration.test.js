'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const unifiedRequestQueue = require('./unifiedRequestQueue');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Requests queue presents meaningful subjects instead of database request numbers', () => {
  const page = read('views/pages/unit-requests.ejs');
  const css = read('public/css/unit-requests.css');

  assert.match(page, /request\.displaySubject/);
  assert.match(page, /unit-request-subject/);
  assert.match(page, /unit-request-type-label/);
  assert.match(page, /Open <%= request\.requestTypeLabel %>: <%= request\.displaySubject %>/);
  assert.doesNotMatch(page, /Request #<%= request\.displayRequestId %>/);
  assert.doesNotMatch(page, /placeholder="Request #/);
  assert.match(css, /\.unit-request-subject/);
  assert.match(css, /\.unit-request-type-label/);
  assert.doesNotMatch(css, /\.unit-request-number/);
});

test('unit request subjects prefer the observed model, processor, Unit, or QC context', () => {
  const model = read('models/unitRequestModel.js');

  assert.match(model, /function getUnitRequestDisplaySubject/);
  assert.match(model, /catalogContext\?\.kind === 'model'[\s\S]*catalogContext\.requestedModelName/);
  assert.match(model, /catalogContext\?\.kind === 'processor'[\s\S]*requestedProcessorType[\s\S]*requestedProcessorName/);
  assert.match(model, /qcReversionContext\.unitLabel[\s\S]*qcReversionContext\.decisionLabel/);
  assert.match(model, /isDuplicateRequest[\s\S]*matchedUnitLabel/);
  assert.match(model, /displaySubject,/);
});

test('override request subjects identify the affected Unit and requested outcome where useful', () => {
  const outcome = unifiedRequestQueue.mapOverrideRequest({
    unitOverrideRequestId: 44,
    requestType: 'outcome_confirmation',
    requestStatus: 'pending',
    unitLabel: 'BWT12345',
    lotName: 'Lot A',
    outcomeConfirmationOutcomeLabel: 'Pass',
    requestedByUserId: 2,
    requestedByName: 'Tech User'
  });
  const move = unifiedRequestQueue.mapOverrideRequest({
    unitOverrideRequestId: 45,
    requestType: 'manual_tech_override_request',
    requestStatus: 'pending',
    unitLabel: 'BWT54321',
    lotName: 'Lot A',
    requestedDestinationLotName: 'Lot B',
    requestedByUserId: 2,
    requestedByName: 'Tech User'
  });

  assert.equal(outcome.displaySubject, 'BWT12345 · Pass');
  assert.equal(move.displaySubject, 'BWT54321');
});

test('request detail pages and browser titles use request context instead of numeric IDs', () => {
  const unitDetail = read('views/pages/unit-request-detail.ejs');
  const overrideDetail = read('views/pages/override-request-detail.ejs');
  const controller = read('controllers/unitRequestController.js');

  assert.match(unitDetail, /<h2><%= request\.displaySubject %><\/h2>/);
  assert.match(overrideDetail, /<h2><%= request\.displaySubject %><\/h2>/);
  assert.doesNotMatch(unitDetail, /<h2>Request #/);
  assert.doesNotMatch(overrideDetail, /<h2>Request #/);
  assert.match(controller, /pageTitle: `\$\{request\.requestTypeLabel\} · \$\{request\.displaySubject\}`/);
  assert.match(controller, /pageTitle: `\$\{presentation\.requestTypeLabel\} · \$\{presentation\.displaySubject\}`/);
});

test('submission and pending-state feedback avoids exposing request primary keys as user labels', () => {
  const catalogModal = read('views/fragments/tech-unit-catalog-request-modal.ejs');
  const duplicateModal = read('views/fragments/tech-unit-intentional-duplicate-request-modal.ejs');
  const overrideModal = read('views/fragments/tech-override-request-modal.ejs');
  const qcDetails = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const qcModal = read('views/fragments/tech-unit-qc-reversion-request-modal.ejs');
  const techController = read('controllers/techController.js');
  const overrideController = read('controllers/overrideController.js');
  const requestModel = read('models/unitRequestModel.js');
  const formScript = read('public/js/tech-unit-form.js');

  assert.match(catalogModal, /for <strong><%= requestSubject %><\/strong> is pending review/);
  assert.match(catalogModal, /View Request Details/);
  assert.match(duplicateModal, /Intentional Duplicate request for <strong><%= unitLabel\(\) %><\/strong> is pending review/);
  assert.match(overrideModal, /An override request is already pending for this Unit/);
  assert.match(qcDetails, /Reversion Request Pending/);
  assert.match(qcModal, /A reversion request is already pending for this exact QC decision/);
  assert.match(techController, /QC reversion request submitted for Tech Lead\+ review/);
  assert.match(overrideController, /Parked Unit takeover request is pending Tech Lead\+ review/);
  assert.match(requestModel, /QC Reversion Request Pending/);
  assert.match(formScript, /Intentional Duplicate request is pending review/);
  ['views/pages/tech-units.ejs', 'views/pages/tech-unit-form.ejs', 'views/pages/tech-unit-detail.ejs']
    .forEach((file) => assert.match(read(file), /tech-unit-form\.js\?v=[^"\'\s>]+/));

  [catalogModal, duplicateModal, overrideModal, qcDetails, qcModal, techController, overrideController, requestModel, formScript]
    .forEach((source) => assert.doesNotMatch(source, /(?:Request|request) #(?:<%=|\$\{)/));
});

test('numeric request IDs remain internal routing keys so existing links and review endpoints stay stable', () => {
  const catalogModal = read('views/fragments/tech-unit-catalog-request-modal.ejs');
  const duplicateModal = read('views/fragments/tech-unit-intentional-duplicate-request-modal.ejs');
  const queue = read('services/unifiedRequestQueue.js');

  assert.match(catalogModal, /href="\/unit-requests\/<%= successRequestId %>"/);
  assert.match(duplicateModal, /href="\/unit-requests\/<%= successRequestId %>"/);
  assert.match(queue, /detailUrl: `\/unit-requests\/\$\{request\.unitRequestId\}`/);
  assert.match(queue, /detailUrl: `\/unit-requests\/override\/\$\{request\.unitOverrideRequestId\}`/);
});
