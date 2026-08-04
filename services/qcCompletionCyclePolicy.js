'use strict';

const PRIVILEGED_CORRECTION_ROLE_CODES = new Set(['admin', 'management', 'tech_lead']);

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRoleCodes(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
}

function readRowValue(row, camelKey, snakeKey) {
  return row && row[camelKey] !== undefined ? row[camelKey] : row && row[snakeKey];
}

function toTimestamp(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function evaluateCurrentQcCompletionCycle(row = {}) {
  const unitId = normalizePositiveInteger(readRowValue(row, 'unitId', 'unit_id'));
  const currentLotId = normalizePositiveInteger(readRowValue(row, 'currentLotId', 'current_lot_id'));
  const completionLotId = normalizePositiveInteger(readRowValue(row, 'completionLotId', 'completion_lot_id'));
  const currentLotHistoryId = normalizePositiveInteger(
    readRowValue(row, 'currentLotHistoryId', 'current_lot_history_id')
  );
  const creditSource = String(readRowValue(row, 'creditSource', 'credit_source') || '').trim();
  const workCycleKey = String(readRowValue(row, 'workCycleKey', 'work_cycle_key') || '').trim();

  if (!unitId || !currentLotId || !completionLotId || currentLotId !== completionLotId) {
    return { current: false, reason: 'lot_mismatch', expectedWorkCycleKey: null };
  }

  if (creditSource && creditSource !== 'manual_completion') {
    return { current: false, reason: 'not_manual_completion', expectedWorkCycleKey: null };
  }

  if (readRowValue(row, 'reversedAt', 'reversed_at')) {
    return { current: false, reason: 'completion_reversed', expectedWorkCycleKey: null };
  }

  const expectedWorkCycleKey = currentLotHistoryId
    ? `move:${unitId}:${currentLotId}:${currentLotHistoryId}`
    : `initial:${unitId}:${currentLotId}`;

  if (workCycleKey && workCycleKey !== expectedWorkCycleKey) {
    return { current: false, reason: 'work_cycle_key_mismatch', expectedWorkCycleKey };
  }

  if (!workCycleKey) {
    const completedAt = toTimestamp(readRowValue(row, 'completedAt', 'completed_at'));
    const cycleStartedAt = toTimestamp(
      readRowValue(row, 'currentLotMovedAt', 'current_lot_moved_at')
      || readRowValue(row, 'unitCreatedAt', 'unit_created_at')
    );

    if (completedAt !== null && cycleStartedAt !== null && completedAt < cycleStartedAt) {
      return { current: false, reason: 'completion_before_current_cycle', expectedWorkCycleKey };
    }
  }

  return { current: true, reason: null, expectedWorkCycleKey };
}

function assertCurrentQcCompletionCycle(row, {
  code = 'BWT_QC_COMPLETION_STALE',
  message = 'This Unit completion is no longer the current work cycle. Refresh the Unit Browser.'
} = {}) {
  const result = evaluateCurrentQcCompletionCycle(row);

  if (!result.current) {
    const error = new Error(message);
    error.code = code;
    error.reason = result.reason;
    throw error;
  }

  return result;
}

function canSubmitQcCorrectionForCurrentAssignment({
  submitterUserId,
  assignedToUserId,
  roleCodes = []
} = {}) {
  const normalizedRoles = normalizeRoleCodes(roleCodes);

  if (normalizedRoles.some((roleCode) => PRIVILEGED_CORRECTION_ROLE_CODES.has(roleCode))) {
    return true;
  }

  const safeSubmitterUserId = normalizePositiveInteger(submitterUserId);
  const safeAssignedToUserId = normalizePositiveInteger(assignedToUserId);
  return Boolean(safeSubmitterUserId && safeAssignedToUserId && safeSubmitterUserId === safeAssignedToUserId);
}

module.exports = {
  PRIVILEGED_CORRECTION_ROLE_CODES,
  assertCurrentQcCompletionCycle,
  canSubmitQcCorrectionForCurrentAssignment,
  evaluateCurrentQcCompletionCycle,
  normalizeRoleCodes
};
