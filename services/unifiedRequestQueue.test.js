const test = require('node:test');
const assert = require('node:assert/strict');
const {
  combineRequestResults,
  mapOverrideRequest,
  mapOverrideStatus,
  normalizeRequestType
} = require('./unifiedRequestQueue');

test('override statuses map into the shared request vocabulary', () => {
  assert.equal(mapOverrideStatus('denied'), 'rejected');
  assert.equal(mapOverrideStatus('cancelled'), 'withdrawn');
  assert.equal(mapOverrideStatus('approved'), 'approved');
});

test('existing Unit overrides map into the Unit Requests presentation model', () => {
  const mapped = mapOverrideRequest({
    unitOverrideRequestId: 17,
    requestType: 'manual_tech_override_request',
    requestStatus: 'pending',
    requestedByUserId: 4,
    requestedByName: 'Taylor Tech',
    unitId: 9,
    unitLabel: 'BWT2300009',
    lotName: 'ARS',
    requestedDestinationLotId: 8,
    requestedDestinationLotName: 'ELS',
    reason: 'Move this Unit',
    createdAt: '2026-07-27T10:00:00Z'
  });

  assert.equal(mapped.requestType, 'existing_unit_override');
  assert.equal(mapped.detailUrl, '/unit-requests/override/17');
  assert.equal(mapped.listContextSecondary, 'ARS → ELS');
  assert.equal(mapped.statusLabel, 'Pending');
});

test('unified queue applies shared status and request-type filters', () => {
  const result = combineRequestResults({
    unitResult: {
      supported: true,
      requests: [{
        unitRequestId: 3,
        requestType: 'intentional_duplicate',
        requestTypeLabel: 'Intentional Duplicate',
        status: 'pending',
        statusLabel: 'Pending',
        statusClass: 'warn',
        isPending: true,
        requestedByUserId: 4,
        requestedByName: 'Taylor Tech',
        submittedAt: '2026-07-27T09:00:00Z'
      }]
    },
    overrideResult: {
      supported: true,
      requests: [{
        unitOverrideRequestId: 17,
        requestType: 'manual_tech_override_request',
        requestStatus: 'pending',
        requestedByUserId: 4,
        requestedByName: 'Taylor Tech',
        unitId: 9,
        unitLabel: 'BWT2300009',
        lotName: 'ARS',
        requestedDestinationLotName: 'ELS',
        createdAt: '2026-07-27T10:00:00Z'
      }]
    },
    statusFilter: 'pending',
    requestTypeFilter: 'existing_unit_override'
  });

  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].requestSource, 'override');
});

test('unified request type normalization includes existing Unit overrides', () => {
  assert.equal(normalizeRequestType('existing_unit_override'), 'existing_unit_override');
  assert.equal(normalizeRequestType('unknown'), 'all');
});
