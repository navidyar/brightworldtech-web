'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function loadWithCatalogDependenciesStubbed(request, parent, isMain) {
  if (request === '../models/unitRequestModel') return {};
  if (request === './catalogRequestAccessPolicy') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { serializeRequest } = require('./apiCatalogRequest');
Module._load = originalLoad;

test('pending Tool catalog request exposes an owned status endpoint and wait state', () => {
  const result = serializeRequest({
    unitRequestId: 41,
    requestType: 'model_catalog_addition',
    status: 'pending',
    submittedAt: '2026-09-14T12:00:00.000Z',
    catalogContext: {
      kind: 'model',
      manufacturerId: 7,
      unitCategoryConfigValueId: 19,
      requestedModelName: 'OptiPlex 7010'
    }
  });

  assert.equal(result.request_id, 41);
  assert.equal(result.status, 'pending');
  assert.equal(result.can_continue, false);
  assert.equal(result.next_action, 'wait_for_approval');
  assert.equal(result.status_endpoint, '/api/v1/units/catalog-requests/41');
  assert.match(result.message, /pending Admin approval/i);
});

test('approved Processor catalog request tells the Tool to rerun Resolve before continuing', () => {
  const result = serializeRequest({
    unitRequestId: 52,
    requestType: 'processor_catalog_addition',
    status: 'approved',
    reviewedAt: '2026-09-14T12:05:00.000Z',
    catalogContext: {
      kind: 'processor',
      unitModelId: 12,
      requestedProcessorType: 'Intel',
      requestedProcessorName: 'Core i5-12500T',
      requestedProcessorSpeedGhz: '2.00',
      approvedProcessorBrandId: 3,
      approvedProcessorBrandName: 'Intel',
      approvedProcessorModelId: 88,
      approvedProcessorModelLabel: 'Core i5-12500T',
      approvedProcessorBaseSpeedGhz: '2.00'
    }
  });

  assert.equal(result.status, 'approved');
  assert.equal(result.can_continue, true);
  assert.equal(result.next_action, 'rerun_resolve');
  assert.equal(result.approved.processor_model_id, 88);
  assert.match(result.message, /has been added/i);
  assert.match(result.message, /Resolve \+ Preflight/i);
});

test('rejected catalog request explicitly stops the Tool workflow', () => {
  const result = serializeRequest({
    unitRequestId: 53,
    requestType: 'model_catalog_addition',
    status: 'rejected',
    reviewerNote: 'Use the canonical model name instead.',
    catalogContext: { kind: 'model', requestedModelName: 'Unknown Model' }
  });

  assert.equal(result.can_continue, false);
  assert.equal(result.next_action, 'stop');
  assert.equal(result.reviewer_note, 'Use the canonical model name instead.');
});
