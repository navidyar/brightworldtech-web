'use strict';

const REVERSAL_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead']);
const MAX_REVERSAL_REASON_LENGTH = 1000;

function normalizeRoleCodes(roleCodes) {
  return Array.isArray(roleCodes)
    ? roleCodes.map((roleCode) => String(roleCode || '').trim().toLowerCase()).filter(Boolean)
    : [];
}

function canReverseUnitCompletion(roleCodes) {
  const roles = normalizeRoleCodes(roleCodes);
  return roles.some((roleCode) => REVERSAL_ROLE_CODES.includes(roleCode));
}

function normalizeCompletionReversalReason(value) {
  const reason = String(value || '').trim();

  if (!reason) {
    throw new Error('A reason is required to undo Unit completion.');
  }

  if (reason.length > MAX_REVERSAL_REASON_LENGTH) {
    throw new Error(`The undo reason must be ${MAX_REVERSAL_REASON_LENGTH} characters or fewer.`);
  }

  return reason;
}

function assertCanReverseUnitCompletion(roleCodes) {
  if (!canReverseUnitCompletion(roleCodes)) {
    const error = new Error('Only a Tech Lead, Management user, or Admin may undo Unit completion.');
    error.code = 'BWT_COMPLETION_REVERSAL_FORBIDDEN';
    throw error;
  }
}

module.exports = {
  MAX_REVERSAL_REASON_LENGTH,
  REVERSAL_ROLE_CODES,
  assertCanReverseUnitCompletion,
  canReverseUnitCompletion,
  normalizeCompletionReversalReason
};
