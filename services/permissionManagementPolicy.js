'use strict';

const { PERMISSION_KEYS, isKnownPermission } = require('../config/permissionCatalog');

const SUPER_ADMIN_SYSTEM_KEY = 'super_admin';
const LEGACY_AUTHORIZATION_RETIREMENT_KEY = 'permission_authorization_gates_v1_retired';
const LEGACY_COMPATIBILITY_ROLE_CODES = new Set(['admin', 'management', 'tech_lead', 'qc', 'tech']);
const VALID_OVERRIDE_EFFECTS = new Set(['allow', 'deny']);
const USER_ONLY_PERMISSION_KEYS = new Set(['dashboards.productivity.count']);

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePositiveInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw policyError('INVALID_IDENTIFIER', `${label} must be a positive integer.`);
  }
  return numeric;
}

function normalizeRoleName(value) {
  const name = String(value || '').trim();
  if (!name) throw policyError('ROLE_NAME_REQUIRED', 'Role name is required.');
  if (name.length > 150) throw policyError('ROLE_NAME_TOO_LONG', 'Role name cannot exceed 150 characters.');
  return name;
}

function normalizeRoleDescription(value) {
  if (value === undefined || value === null) return null;
  const description = String(value).trim();
  if (!description) return null;
  if (description.length > 500) {
    throw policyError('ROLE_DESCRIPTION_TOO_LONG', 'Role description cannot exceed 500 characters.');
  }
  return description;
}

function normalizePermissionKeys(values) {
  if (!Array.isArray(values)) return [];
  const keys = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  const unknown = keys.filter((key) => !isKnownPermission(key));
  if (unknown.length > 0) {
    throw policyError('UNKNOWN_PERMISSION', `Unknown permission key(s): ${unknown.join(', ')}`);
  }
  return keys.sort();
}

function isUserOnlyPermissionKey(permissionKey) {
  return USER_ONLY_PERMISSION_KEYS.has(String(permissionKey || '').trim());
}

function assertRoleAssignablePermissionKeys(permissionKeys) {
  const keys = normalizePermissionKeys(permissionKeys);
  const userOnly = keys.filter((permissionKey) => isUserOnlyPermissionKey(permissionKey));
  if (userOnly.length > 0) {
    throw policyError(
      'USER_ONLY_PERMISSION',
      `User-only permission cannot be granted through a role: ${userOnly.join(', ')}`
    );
  }
  return keys;
}

function getRoleAssignablePermissionKeys(permissionKeys = PERMISSION_KEYS) {
  return normalizePermissionKeys(permissionKeys).filter((permissionKey) => !isUserOnlyPermissionKey(permissionKey));
}

function normalizeRoleIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => normalizePositiveInteger(value, 'Role ID')))];
}

function normalizeOverrideEffect(value) {
  const effect = String(value || '').trim().toLowerCase();
  if (effect === '' || effect === 'inherit' || effect === 'remove') return null;
  if (!VALID_OVERRIDE_EFFECTS.has(effect)) {
    throw policyError('INVALID_OVERRIDE_EFFECT', 'User permission override must be allow, deny, or inherit.');
  }
  return effect;
}

function hasPermission(permissionSet, permissionKey) {
  return permissionSet instanceof Set && permissionSet.has(permissionKey);
}

function requirePermission(permissionSet, permissionKey) {
  if (!hasPermission(permissionSet, permissionKey)) {
    throw policyError('PERMISSION_REQUIRED', `Permission required: ${permissionKey}`);
  }
}

function requirePermissions(permissionSet, permissionKeys) {
  for (const permissionKey of permissionKeys) requirePermission(permissionSet, permissionKey);
}

function isSuperAdminRole(role) {
  return Boolean(role && role.system_key === SUPER_ADMIN_SYSTEM_KEY);
}

function isLegacyCompatibilityRole(role) {
  return Boolean(role && LEGACY_COMPATIBILITY_ROLE_CODES.has(String(role.code || '')));
}

function assertRoleCanDeactivateOrDelete(role, { legacyAuthorizationRetired = false } = {}) {
  if (!role) throw policyError('ROLE_NOT_FOUND', 'Role was not found.');
  if (isSuperAdminRole(role)) {
    throw policyError('SUPER_ADMIN_ROLE_PROTECTED', 'The permanent Super Admin role cannot be deactivated or deleted.');
  }
  if (isLegacyCompatibilityRole(role) && !legacyAuthorizationRetired) {
    throw policyError(
      'LEGACY_ROLE_GATE_ACTIVE',
      'This role cannot be deactivated or deleted until the remaining legacy role-based authorization gates are retired.'
    );
  }
}

function assertSuperAdminPermissionSet(role, permissionKeys) {
  if (!isSuperAdminRole(role)) return;
  const requested = new Set(assertRoleAssignablePermissionKeys(permissionKeys));
  const required = getRoleAssignablePermissionKeys();
  const missing = required.filter((permissionKey) => !requested.has(permissionKey));
  if (missing.length > 0 || requested.size !== required.length) {
    throw policyError(
      'SUPER_ADMIN_PERMISSIONS_PROTECTED',
      'The permanent Super Admin role must retain every role-assignable active permission.'
    );
  }
}

module.exports = {
  SUPER_ADMIN_SYSTEM_KEY,
  LEGACY_AUTHORIZATION_RETIREMENT_KEY,
  LEGACY_COMPATIBILITY_ROLE_CODES,
  VALID_OVERRIDE_EFFECTS,
  USER_ONLY_PERMISSION_KEYS,
  policyError,
  normalizePositiveInteger,
  normalizeRoleName,
  normalizeRoleDescription,
  normalizePermissionKeys,
  isUserOnlyPermissionKey,
  assertRoleAssignablePermissionKeys,
  getRoleAssignablePermissionKeys,
  normalizeRoleIds,
  normalizeOverrideEffect,
  hasPermission,
  requirePermission,
  requirePermissions,
  isSuperAdminRole,
  isLegacyCompatibilityRole,
  assertRoleCanDeactivateOrDelete,
  assertSuperAdminPermissionSet
};
