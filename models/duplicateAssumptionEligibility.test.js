'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: {} }
};

const { getDuplicateAssumptionEligibility } = require('./techUnitModel');

const destinationLot = {
  lot_id: 20,
  allow_duplicate_unit_assumption: 1
};
const baseInput = {
  destinationLot,
  destinationIsAssignable: true,
  lotAssumptionPolicyAvailable: true,
  actorRoleCodes: ['tech'],
  actorUserId: 7
};

test('a Tech cannot request a takeover of a Unit already assigned to them in the selected Lot', () => {
  const result = getDuplicateAssumptionEligibility({
    ...baseInput,
    candidate: {
      unitId: 91,
      lotId: 20,
      assignedToUserId: 7,
      isParked: false,
      isClosedLot: false
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresOverride, false);
  assert.equal(result.actionKind, 'none');
  assert.equal(result.code, 'BWT_DUPLICATE_ASSUMPTION_ALREADY_ASSIGNED_IN_DESTINATION');
  assert.match(result.message, /Intentional Duplicate request/);
});

test('a Unit already assigned to the Tech can move directly to a different assumption-enabled Lot', () => {
  const result = getDuplicateAssumptionEligibility({
    ...baseInput,
    candidate: {
      unitId: 91,
      lotId: 10,
      assignedToUserId: 7,
      isParked: false,
      isClosedLot: false
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.requiresOverride, false);
  assert.equal(result.actionKind, 'move');
  assert.equal(result.assignedToCurrentActor, true);
});

test('a Unit already assigned to the Tech uses a Lot Move request when direct movement is disabled', () => {
  const result = getDuplicateAssumptionEligibility({
    ...baseInput,
    destinationLot: {
      ...destinationLot,
      allow_duplicate_unit_assumption: 0
    },
    candidate: {
      unitId: 91,
      lotId: 10,
      assignedToUserId: 7,
      isParked: false,
      isClosedLot: false
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiresOverride, true);
  assert.equal(result.actionKind, 'move');
  assert.match(result.message, /Lot Move request/);
});

test('a Unit assigned to another Tech keeps the takeover workflow', () => {
  const result = getDuplicateAssumptionEligibility({
    ...baseInput,
    candidate: {
      unitId: 91,
      lotId: 10,
      assignedToUserId: 8,
      isParked: false,
      isClosedLot: false
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.actionKind, 'takeover');
  assert.equal(result.assignedToCurrentActor, false);
});
