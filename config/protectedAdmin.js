'use strict';

// NAYA (navid.y@mortaldeveloper.com). Bind protection to the database identity,
// so changing the account email does not remove it.
const PROTECTED_ADMIN_USER_ID = 1;

function isProtectedAdmin(userId) {
  return Number(userId) === PROTECTED_ADMIN_USER_ID;
}

function canManageUser(actorUserId, targetUserId) {
  return !isProtectedAdmin(targetUserId) || Number(actorUserId) === PROTECTED_ADMIN_USER_ID;
}

function assertProtectedAdminInvariant({ userId, roleCodes, isActive, deleting = false }) {
  if (!isProtectedAdmin(userId)) return;

  const removesAdminRole = roleCodes !== undefined
    && (!Array.isArray(roleCodes) || !roleCodes.includes('admin'));

  if (removesAdminRole || isActive === false || deleting) {
    const error = new Error('The protected Admin account must retain its Admin role and remain active.');
    error.code = 'PROTECTED_ADMIN_USER';
    throw error;
  }
}

module.exports = { PROTECTED_ADMIN_USER_ID, isProtectedAdmin, canManageUser, assertProtectedAdminInvariant };
