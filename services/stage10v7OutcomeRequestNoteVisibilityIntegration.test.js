'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const unifiedRequestQueue = require('./unifiedRequestQueue');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function buildOutcomeRequest(overrides = {}) {
  return {
    unitOverrideRequestId: 41,
    unitId: 7,
    unitLabel: 'BWT12345',
    lotName: 'Laptop Lot',
    requestedDestinationLotName: 'No destination selected',
    requestType: 'outcome_confirmation',
    requestStatus: 'pending',
    requestedByUserId: 9,
    requestedByName: 'Regular Tech',
    reviewedByUserId: null,
    reviewedByName: '',
    requesterNote: 'Please review the intermittent battery failure before confirming Fail.',
    reason: 'Second-opinion confirmation requested for the current Fail decision.',
    reviewNotes: '',
    validationLabel: 'Needs Review',
    decisionLabel: 'Needs Review',
    createdAt: new Date('2026-08-04T10:00:00Z'),
    ...overrides
  };
}

test('outcome confirmation mapping carries the technician note into the unified request', () => {
  const mapped = unifiedRequestQueue.mapOverrideRequest(buildOutcomeRequest());

  assert.equal(
    mapped.requesterNote,
    'Please review the intermittent battery failure before confirming Fail.'
  );
  assert.notEqual(mapped.requesterNote, mapped.originalOverrideRequest.reason);
});

test('technician request notes participate in unified queue searching', () => {
  const mapped = unifiedRequestQueue.mapOverrideRequest(buildOutcomeRequest());

  assert.ok(mapped.searchValues.includes(
    'Please review the intermittent battery failure before confirming Fail.'
  ));
});

test('override model exposes request_details.request_notes as the outcome requester note', () => {
  const model = read('models/overrideRequestModel.js');

  assert.match(model, /isOutcomeConfirmationRequest = row\.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE/);
  assert.match(model, /requestDetails\.request_notes/);
  assert.match(model, /requesterNote,/);
});

test('override detail shows the technician note instead of the generated request reason', () => {
  const detail = read('views/pages/override-request-detail.ejs');

  assert.match(detail, /Technician Request Note/);
  assert.match(detail, /request\.requesterNote/);
  assert.doesNotMatch(detail, /unit-request-requester-note"><%= request\.reason/);
});

test('non-outcome overrides retain their existing requester explanation', () => {
  const model = read('models/overrideRequestModel.js');

  assert.match(model, /: String\(row\.reason \|\| ''\)\.trim\(\)/);
});
