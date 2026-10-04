'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions
} = require('./permissionResolver');

test('role grants combine as a union across multiple assigned roles', () => {
  const permissions = resolveEffectivePermissions({
    rolePermissionKeys: ['units.view', 'units.edit', 'lots.configure', 'units.view']
  });

  assert.deepEqual([...permissions].sort(), ['lots.configure', 'units.edit', 'units.view']);
});

test('a role that does not grant a permission does not deny another role grant', () => {
  const permissions = resolveEffectivePermissions({
    rolePermissionKeys: ['reports.export']
  });

  assert.equal(hasPermission(permissions, 'reports.export'), true);
});

test('user allow override adds a permission not granted by any role', () => {
  const permissions = resolveEffectivePermissions({
    rolePermissionKeys: ['units.view'],
    userOverrides: [{ permissionKey: 'lots.configure', effect: 'allow' }]
  });

  assert.equal(hasPermission(permissions, 'lots.configure'), true);
});

test('user deny override removes a permission granted by a role', () => {
  const permissions = resolveEffectivePermissions({
    rolePermissionKeys: ['units.view', 'reports.export'],
    userOverrides: [{ permission_key: 'reports.export', effect: 'deny' }]
  });

  assert.equal(hasPermission(permissions, 'reports.export'), false);
  assert.equal(hasPermission(permissions, 'units.view'), true);
});

test('user overrides are applied after combined role grants', () => {
  const permissions = resolveEffectivePermissions({
    rolePermissionKeys: ['units.view', 'lots.configure'],
    userOverrides: [
      { permissionKey: 'lots.configure', effect: 'deny' },
      { permissionKey: 'reports.export', effect: 'allow' }
    ]
  });

  assert.equal(hasPermission(permissions, 'lots.configure'), false);
  assert.equal(hasPermission(permissions, 'reports.export'), true);
  assert.equal(hasAnyPermission(permissions, ['lots.configure', 'reports.export']), true);
  assert.equal(hasAllPermissions(permissions, ['units.view', 'reports.export']), true);
});

test('invalid override effects fail closed instead of silently granting access', () => {
  assert.throws(
    () => resolveEffectivePermissions({ userOverrides: [{ permissionKey: 'units.delete', effect: 'inherit' }] }),
    /Invalid permission override effect/
  );
});
