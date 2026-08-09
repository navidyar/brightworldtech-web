'use strict';

const accessPolicy = require('../config/accessPolicy');

function normalizeRoleCodes(roleCodes) {
  return Array.isArray(roleCodes)
    ? roleCodes.map((roleCode) => String(roleCode || '').trim()).filter(Boolean)
    : [String(roleCodes || '').trim()].filter(Boolean);
}

function normalizeUserId(value) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function getSelfRoleLockCode({ actorUser, targetUserId }) {
  const actorUserId = normalizeUserId(actorUser && actorUser.user_id);
  const safeTargetUserId = normalizeUserId(targetUserId);
  const actorRoleCodes = normalizeRoleCodes(actorUser && actorUser.roles);

  if (!actorUserId || !safeTargetUserId || actorUserId !== safeTargetUserId) {
    return null;
  }

  const primaryRoleCode = accessPolicy.getPrimaryRole(actorRoleCodes);
  return ['admin', 'management'].includes(primaryRoleCode) ? primaryRoleCode : null;
}

function isSelfRoleLocked(context) {
  return Boolean(getSelfRoleLockCode(context));
}

function isAdminSelfRoleLocked(context) {
  return getSelfRoleLockCode(context) === 'admin';
}

function isManagementSelfRoleLocked(context) {
  return getSelfRoleLockCode(context) === 'management';
}

function isSubmittedRoleChange({ submittedRoleCodes, currentRoleCodes }) {
  const submittedRoles = normalizeRoleCodes(submittedRoleCodes);

  if (submittedRoles.length === 0) {
    return false;
  }

  return accessPolicy.getPrimaryRole(submittedRoles) !== accessPolicy.getPrimaryRole(normalizeRoleCodes(currentRoleCodes));
}

module.exports = {
  getSelfRoleLockCode,
  isSelfRoleLocked,
  isAdminSelfRoleLocked,
  isManagementSelfRoleLocked,
  isSubmittedRoleChange,
  normalizeRoleCodes,
  normalizeUserId
};
