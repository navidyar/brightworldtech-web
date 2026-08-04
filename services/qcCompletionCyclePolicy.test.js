'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertCurrentQcCompletionCycle,
  canSubmitQcCorrectionForCurrentAssignment,
  evaluateCurrentQcCompletionCycle
} = require('./qcCompletionCyclePolicy');

function currentCycle(overrides = {}) {
  return {
    unit_id: 77,
    current_lot_id: 12,
    completion_lot_id: 12,
    current_lot_history_id: 901,
    work_cycle_key: 'move:77:12:901',
    credit_source: 'manual_completion',
    completed_at: '2026-07-29T12:00:00.000Z',
    current_lot_moved_at: '2026-07-29T10:00:00.000Z',
    unit_created_at: '2026-07-01T10:00:00.000Z',
    reversed_at: null,
    ...overrides
  };
}

test('current QC completion cycle accepts the exact lot movement key', () => {
  assert.deepEqual(evaluateCurrentQcCompletionCycle(currentCycle()), {
    current: true,
    reason: null,
    expectedWorkCycleKey: 'move:77:12:901'
  });
});

test('QC completion cycle rejects stale lot and work-cycle records', () => {
  assert.equal(evaluateCurrentQcCompletionCycle(currentCycle({ completion_lot_id: 11 })).reason, 'lot_mismatch');
  assert.equal(evaluateCurrentQcCompletionCycle(currentCycle({ work_cycle_key: 'move:77:12:700' })).reason, 'work_cycle_key_mismatch');
  assert.equal(evaluateCurrentQcCompletionCycle(currentCycle({ reversed_at: '2026-07-29T13:00:00.000Z' })).reason, 'completion_reversed');
});

test('legacy completion without a cycle key must occur after the current cycle began', () => {
  assert.equal(evaluateCurrentQcCompletionCycle(currentCycle({ work_cycle_key: null })).current, true);
  assert.equal(evaluateCurrentQcCompletionCycle(currentCycle({
    work_cycle_key: null,
    completed_at: '2026-07-29T09:59:59.000Z'
  })).reason, 'completion_before_current_cycle');
});

test('stale completion assertion returns the requested workflow error code', () => {
  assert.throws(
    () => assertCurrentQcCompletionCycle(currentCycle({ completion_lot_id: 11 }), {
      code: 'BWT_QC_TEST_STALE',
      message: 'Refresh first.'
    }),
    (error) => error.code === 'BWT_QC_TEST_STALE' && error.message === 'Refresh first.'
  );
});

test('only the assigned technician or Tech Lead+ can submit a correction after the transaction lock', () => {
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({
    submitterUserId: 19,
    assignedToUserId: 19,
    roleCodes: ['tech']
  }), true);
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({
    submitterUserId: 19,
    assignedToUserId: 20,
    roleCodes: ['tech']
  }), false);
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({
    submitterUserId: 19,
    assignedToUserId: 20,
    roleCodes: ['tech_lead']
  }), true);
});
