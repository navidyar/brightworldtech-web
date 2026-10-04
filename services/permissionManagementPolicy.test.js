'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');
const {
  normalizePermissionKeys,
  normalizeOverrideEffect,
  assertRoleCanDeactivateOrDelete,
  assertSuperAdminPermissionSet,
  assertRoleAssignablePermissionKeys,
  getRoleAssignablePermissionKeys
} = require('./permissionManagementPolicy');

test('role permissions normalize as grant-only keys with no deny state', () => {
  assert.deepEqual(normalizePermissionKeys(['units.view', 'units.view', 'lots.view']), ['lots.view', 'units.view']);
  assert.throws(() => normalizePermissionKeys(['units.view', 'not.real']), { code: 'UNKNOWN_PERMISSION' });
});

test('user overrides accept allow/deny and treat inherit as no override', () => {
  assert.equal(normalizeOverrideEffect('allow'), 'allow');
  assert.equal(normalizeOverrideEffect('DENY'), 'deny');
  assert.equal(normalizeOverrideEffect('inherit'), null);
  assert.equal(normalizeOverrideEffect(''), null);
  assert.throws(() => normalizeOverrideEffect('block'), { code: 'INVALID_OVERRIDE_EFFECT' });
});

test('Super Admin cannot be deactivated/deleted and must retain every role-assignable permission', () => {
  const superAdmin = { system_key: 'super_admin', code: 'super_admin' };
  assert.throws(() => assertRoleCanDeactivateOrDelete(superAdmin, { legacyAuthorizationRetired: true }), {
    code: 'SUPER_ADMIN_ROLE_PROTECTED'
  });
  const roleAssignable = getRoleAssignablePermissionKeys(PERMISSION_KEYS);
  assert.doesNotThrow(() => assertSuperAdminPermissionSet(superAdmin, roleAssignable));
  assert.throws(() => assertSuperAdminPermissionSet(superAdmin, roleAssignable.slice(1)), {
    code: 'SUPER_ADMIN_PERMISSIONS_PROTECTED'
  });
});

test('legacy compatibility roles are deletable only after role gates are retired', () => {
  const management = { system_key: null, code: 'management' };
  assert.throws(() => assertRoleCanDeactivateOrDelete(management), { code: 'LEGACY_ROLE_GATE_ACTIVE' });
  assert.doesNotThrow(() => assertRoleCanDeactivateOrDelete(management, { legacyAuthorizationRetired: true }));
  assert.doesNotThrow(() => assertRoleCanDeactivateOrDelete({ system_key: null, code: 'custom_anything' }));
});


test('productivity counting is user-only and cannot be assigned through a role', () => {
  assert.throws(
    () => assertRoleAssignablePermissionKeys(['units.view', 'dashboards.productivity.count']),
    { code: 'USER_ONLY_PERMISSION' }
  );
  assert.deepEqual(getRoleAssignablePermissionKeys(['units.view', 'dashboards.productivity.count']), ['units.view']);
});
