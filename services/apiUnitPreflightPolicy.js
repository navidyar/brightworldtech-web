'use strict';

const ELEVATED_ROLE_CODES = new Set(['admin', 'management', 'tech_lead']);

function normalizeRoleCodes(roleCodes = []) {
  return (Array.isArray(roleCodes) ? roleCodes : [])
    .map((roleCode) => String(roleCode || '').trim())
    .filter(Boolean);
}

function hasElevatedAuthority(roleCodes = []) {
  return normalizeRoleCodes(roleCodes).some((roleCode) => ELEVATED_ROLE_CODES.has(roleCode));
}

function sourcePolicyKey(toolSource) {
  const source = String(toolSource || '').trim().toLowerCase();
  if (source === 'scantool') return 'allowScanTools';
  if (source === 'techtools') return 'allowTechTools';
  return '';
}

function buildSourcePolicyDecision({ toolSource, effectivePolicy = {} } = {}) {
  const policyKey = sourcePolicyKey(toolSource);
  const allowed = Boolean(policyKey && effectivePolicy[policyKey] === true);

  return {
    tool_source: String(toolSource || '').trim().toLowerCase(),
    policy_key: policyKey || null,
    allowed,
    reason: !policyKey
      ? 'unsupported_tool_source'
      : allowed
        ? 'tool_allowed'
        : 'tool_disallowed_by_lot'
  };
}

function buildExistingUnitActionDecision({
  unit = null,
  intendedLot = null,
  currentUserId = null,
  roleCodes = [],
  allowDuplicateWithoutApproval = false,
  normalLotMoveAllowedWithoutApproval = false,
  currentLotClosed = false
} = {}) {
  if (!unit) {
    return {
      authorized: true,
      action_required: false,
      action: 'create',
      approval_required: false,
      reason: 'new_unit'
    };
  }

  const safeCurrentUserId = Number(currentUserId);
  const assignedUserId = Number(unit.assigned_to_user_id);
  const currentLotId = Number(unit.lot_id);
  const intendedLotId = Number(intendedLot && intendedLot.lot_id);
  const elevated = hasElevatedAuthority(roleCodes);
  const assignedToCurrentUser = Number.isSafeInteger(safeCurrentUserId)
    && safeCurrentUserId > 0
    && Number.isSafeInteger(assignedUserId)
    && assignedUserId === safeCurrentUserId;
  const sameLot = Number.isSafeInteger(currentLotId)
    && currentLotId > 0
    && Number.isSafeInteger(intendedLotId)
    && intendedLotId > 0
    && currentLotId === intendedLotId;
  const parked = Number(unit.is_parked || 0) === 1 || Number(unit.is_archived || 0) === 1;

  if (elevated && !parked && sameLot) {
    return {
      authorized: true,
      action_required: false,
      action: 'use_existing',
      approval_required: false,
      reason: 'elevated_existing_unit_access',
      assigned_to_current_user: assignedToCurrentUser
    };
  }

  if (!elevated && assignedToCurrentUser && !parked && sameLot) {
    return {
      authorized: true,
      action_required: false,
      action: 'use_existing',
      approval_required: false,
      reason: 'assigned_to_current_user',
      assigned_to_current_user: true
    };
  }

  const action = parked || !assignedToCurrentUser ? 'takeover' : 'move';

  if (elevated) {
    return {
      authorized: true,
      action_required: true,
      action,
      approval_required: false,
      reason: parked ? 'parked_unit_action_required' : 'explicit_lot_action_required',
      assigned_to_current_user: assignedToCurrentUser
    };
  }

  if (currentLotClosed && !parked) {
    return {
      authorized: false,
      action_required: true,
      action,
      approval_required: true,
      reason: 'closed_source_lot_requires_approval',
      assigned_to_current_user: assignedToCurrentUser
    };
  }

  if (action === 'move' && normalLotMoveAllowedWithoutApproval) {
    return {
      authorized: true,
      action_required: true,
      action,
      approval_required: false,
      reason: 'current_lot_move_policy_allows',
      assigned_to_current_user: true
    };
  }

  if (allowDuplicateWithoutApproval) {
    return {
      authorized: true,
      action_required: true,
      action,
      approval_required: false,
      reason: 'lot_allows_duplicate_units_without_approval',
      assigned_to_current_user: assignedToCurrentUser
    };
  }

  return {
    authorized: false,
    action_required: true,
    action,
    approval_required: true,
    reason: 'individual_move_takeover_approval_required',
    assigned_to_current_user: assignedToCurrentUser
  };
}

function buildRequirementEvaluationState({ check = {}, observationState = '', hasStoredValue = false } = {}) {
  const state = String(observationState || '').trim().toLowerCase();

  if (state === 'unknown') return 'UNKNOWN';
  if (state === 'not_evaluable') return hasStoredValue
    ? (check.status === 'accepted' ? 'PASS' : check.status === 'rejected' ? 'FAIL' : 'UNKNOWN')
    : 'NOT_EVALUATABLE_BY_THIS_TOOL';
  if (check.status === 'accepted') return 'PASS';
  if (check.status === 'rejected') return 'FAIL';
  return 'UNKNOWN';
}

function hasFailedToolRequirementChecks(checks = []) {
  return (Array.isArray(checks) ? checks : []).some((check) => String(check?.evaluation_state || '') === 'FAIL');
}

function hasIncompleteToolRequirementChecks(checks = []) {
  return (Array.isArray(checks) ? checks : []).some((check) =>
    ['UNKNOWN', 'NOT_EVALUATABLE_BY_THIS_TOOL'].includes(String(check?.evaluation_state || ''))
  );
}

function summarizeRequirementStates(checks = []) {
  const states = (Array.isArray(checks) ? checks : []).map((check) => check.evaluation_state);
  if (states.length === 0) return 'PASS';
  if (states.includes('FAIL')) return 'FAIL';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  if (states.includes('NOT_EVALUATABLE_BY_THIS_TOOL')) return 'NOT_EVALUATABLE_BY_THIS_TOOL';
  return 'PASS';
}

module.exports = {
  ELEVATED_ROLE_CODES,
  normalizeRoleCodes,
  hasElevatedAuthority,
  sourcePolicyKey,
  buildSourcePolicyDecision,
  buildExistingUnitActionDecision,
  buildRequirementEvaluationState,
  hasFailedToolRequirementChecks,
  hasIncompleteToolRequirementChecks,
  summarizeRequirementStates
};
