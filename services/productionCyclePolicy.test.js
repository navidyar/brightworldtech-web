'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldGrantProductionCredit,
  shouldStartNewProductionCycle
} = require('./productionCyclePolicy');

test('a Unit whose current production cycle already has credit starts a new cycle in an enabled rework Lot', () => {
  assert.equal(shouldStartNewProductionCycle({
    allowNewProductionCycle: true,
    destinationPolicyEnabled: true,
    hasCurrentProductionCredit: true,
    fromLotId: 10,
    toLotId: 20
  }), true);
});

test('normal destination Lot continues the existing production cycle', () => {
  assert.equal(shouldStartNewProductionCycle({
    allowNewProductionCycle: true,
    destinationPolicyEnabled: false,
    hasCurrentProductionCredit: true,
    fromLotId: 10,
    toLotId: 20
  }), false);
});

test('a Unit with an already-open uncredited production cycle does not open another cycle', () => {
  assert.equal(shouldStartNewProductionCycle({
    allowNewProductionCycle: true,
    destinationPolicyEnabled: true,
    hasCurrentProductionCredit: false,
    fromLotId: 10,
    toLotId: 20
  }), false);
});

test('Parked-return workflow can explicitly suppress a new production cycle', () => {
  assert.equal(shouldStartNewProductionCycle({
    allowNewProductionCycle: false,
    destinationPolicyEnabled: true,
    hasCurrentProductionCredit: true,
    fromLotId: 10,
    toLotId: 20
  }), false);
});

test('same-Lot save never starts a production cycle', () => {
  assert.equal(shouldStartNewProductionCycle({
    allowNewProductionCycle: true,
    destinationPolicyEnabled: true,
    hasCurrentProductionCredit: true,
    fromLotId: 10,
    toLotId: 10
  }), false);
});

test('only the first active completion in a production cycle grants production credit', () => {
  assert.equal(shouldGrantProductionCredit({ hasActiveProductionCredit: false }), true);
  assert.equal(shouldGrantProductionCredit({ hasActiveProductionCredit: true }), false);
});
