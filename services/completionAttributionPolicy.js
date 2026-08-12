'use strict';

const ELEVATED_COMPLETION_ROLES = new Set(['admin', 'management', 'tech_lead']);

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function canChooseCompletionAttribution(roleCodes = []) {
  return (Array.isArray(roleCodes) ? roleCodes : [])
    .some((roleCode) => ELEVATED_COMPLETION_ROLES.has(String(roleCode || '').trim()));
}

function getAllowedCompletionUserIds({ currentUserId, assignedUserId, roleCodes = [] } = {}) {
  const safeCurrentUserId = normalizePositiveInteger(currentUserId);
  const safeAssignedUserId = normalizePositiveInteger(assignedUserId);

  if (!safeCurrentUserId) {
    return [];
  }

  const allowedUserIds = [safeCurrentUserId];

  if (
    canChooseCompletionAttribution(roleCodes)
    && safeAssignedUserId
    && safeAssignedUserId !== safeCurrentUserId
  ) {
    allowedUserIds.unshift(safeAssignedUserId);
  }

  return allowedUserIds;
}

function resolveCompletionUserId({ currentUserId, assignedUserId, roleCodes = [], requestedUserId = null } = {}) {
  const allowedUserIds = getAllowedCompletionUserIds({ currentUserId, assignedUserId, roleCodes });

  if (allowedUserIds.length === 0) {
    throw new Error('A valid current user is required to record Unit completion.');
  }

  const safeRequestedUserId = normalizePositiveInteger(requestedUserId);

  if (requestedUserId !== null && requestedUserId !== undefined && String(requestedUserId).trim() !== '') {
    if (!safeRequestedUserId || !allowedUserIds.includes(safeRequestedUserId)) {
      throw new Error('Choose either your user or the technician currently assigned to this Unit.');
    }

    return safeRequestedUserId;
  }

  return allowedUserIds[0];
}

module.exports = {
  canChooseCompletionAttribution,
  getAllowedCompletionUserIds,
  resolveCompletionUserId
};
