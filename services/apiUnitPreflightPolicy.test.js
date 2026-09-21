'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSourcePolicyDecision,
  buildExistingUnitActionDecision,
  buildRequirementEvaluationState,
  hasFailedToolRequirementChecks,
  hasIncompleteToolRequirementChecks,
  summarizeRequirementStates
} = require('./apiUnitPreflightPolicy');

test('Tool source policy selects the correct inherited Lot allowance', () => {
  assert.equal(buildSourcePolicyDecision({ toolSource: 'scantool', effectivePolicy: { allowScanTools: true } }).allowed, true);
  assert.equal(buildSourcePolicyDecision({ toolSource: 'techtools', effectivePolicy: { allowTechTools: false } }).allowed, false);
});

test('assigned Tech in the intended Lot may continue without an ownership action', () => {
  const decision = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 12, is_parked: 0 },
    intendedLot: { lot_id: 7 },
    currentUserId: 12,
    roleCodes: ['tech']
  });
  assert.equal(decision.authorized, true);
  assert.equal(decision.action_required, false);
  assert.equal(decision.action, 'use_existing');
});

test('Lot duplicate permission removes per-Unit approval but still requires explicit takeover confirmation', () => {
  const decision = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 99, is_parked: 0 },
    intendedLot: { lot_id: 7 },
    currentUserId: 12,
    roleCodes: ['tech'],
    allowDuplicateWithoutApproval: true
  });
  assert.equal(decision.authorized, true);
  assert.equal(decision.action_required, true);
  assert.equal(decision.action, 'takeover');
  assert.equal(decision.approval_required, false);
});

test('assigned Tech can use the existing direct Lot-move policy without duplicate permission', () => {
  const decision = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 12, is_parked: 0 },
    intendedLot: { lot_id: 8 },
    currentUserId: 12,
    roleCodes: ['tech'],
    allowDuplicateWithoutApproval: false,
    normalLotMoveAllowedWithoutApproval: true
  });
  assert.equal(decision.authorized, true);
  assert.equal(decision.action_required, true);
  assert.equal(decision.action, 'move');
  assert.equal(decision.approval_required, false);
  assert.equal(decision.reason, 'current_lot_move_policy_allows');
});

test('without Lot duplicate permission another Tech assignment requires individual approval', () => {
  const decision = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 99, is_parked: 0 },
    intendedLot: { lot_id: 7 },
    currentUserId: 12,
    roleCodes: ['tech'],
    allowDuplicateWithoutApproval: false
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.action_required, true);
  assert.equal(decision.approval_required, true);
});

test('elevated users retain BWTDallas management authority but Lot moves remain explicit', () => {
  const sameLot = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 99, is_parked: 0 },
    intendedLot: { lot_id: 7 },
    currentUserId: 12,
    roleCodes: ['tech_lead']
  });
  assert.equal(sameLot.action_required, false);

  const move = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 99, is_parked: 0 },
    intendedLot: { lot_id: 8 },
    currentUserId: 12,
    roleCodes: ['tech_lead']
  });
  assert.equal(move.action_required, true);
  assert.equal(move.approval_required, false);
});


test('regular Tech cannot directly move or take over an Active Unit from a closed source Lot', () => {
  const decision = buildExistingUnitActionDecision({
    unit: { lot_id: 7, assigned_to_user_id: 99, is_parked: 0 },
    intendedLot: { lot_id: 8 },
    currentUserId: 12,
    roleCodes: ['tech'],
    allowDuplicateWithoutApproval: true,
    currentLotClosed: true
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.action_required, true);
  assert.equal(decision.approval_required, true);
  assert.equal(decision.reason, 'closed_source_lot_requires_approval');
});

test('requirement evaluation distinguishes pass, fail, unknown, and not-evaluable states', () => {
  assert.equal(buildRequirementEvaluationState({ check: { status: 'accepted' }, observationState: 'known' }), 'PASS');
  assert.equal(buildRequirementEvaluationState({ check: { status: 'rejected' }, observationState: 'known' }), 'FAIL');
  assert.equal(buildRequirementEvaluationState({ check: { status: 'rejected' }, observationState: 'unknown' }), 'UNKNOWN');
  assert.equal(buildRequirementEvaluationState({ check: { status: 'rejected' }, observationState: 'not_evaluable', hasStoredValue: false }), 'NOT_EVALUATABLE_BY_THIS_TOOL');
  assert.equal(summarizeRequirementStates([{ evaluation_state: 'PASS' }, { evaluation_state: 'UNKNOWN' }]), 'UNKNOWN');
});


test('Lot requirement results are informational to Tools rather than Tool blockers', () => {
  const checks = [
    { evaluation_state: 'FAIL' },
    { evaluation_state: 'NOT_EVALUATABLE_BY_THIS_TOOL' },
    { evaluation_state: 'UNKNOWN' }
  ];
  assert.equal(hasFailedToolRequirementChecks(checks), true);
  assert.equal(hasIncompleteToolRequirementChecks(checks), true);
  assert.equal(hasFailedToolRequirementChecks([{ evaluation_state: 'PASS' }]), false);
  assert.equal(hasIncompleteToolRequirementChecks([{ evaluation_state: 'PASS' }]), false);
});

test('source policy rejects an unknown Tool source rather than guessing an allowance', () => {
  const decision = buildSourcePolicyDecision({ toolSource: 'other', effectivePolicy: { allowScanTools: true, allowTechTools: true } });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'unsupported_tool_source');
});
