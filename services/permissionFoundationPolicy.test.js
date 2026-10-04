'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, PERMISSION_KEYS } = require('../config/permissionCatalog');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

test('permission catalog keys are unique and structurally complete', () => {
  assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
  assert.ok(PERMISSION_KEYS.length > 0);

  for (const permission of PERMISSIONS) {
    assert.ok(permission.permissionKey);
    assert.ok(permission.group);
    assert.ok(permission.name);
    assert.ok(permission.description);
  }
});

test('legacy role bootstrap grants reference only known permission keys', () => {
  const known = new Set(PERMISSION_KEYS);

  for (const [roleCode, grants] of Object.entries(LEGACY_ROLE_GRANTS)) {
    assert.ok(grants.length > 0, `${roleCode} should have bootstrap grants`);
    assert.equal(new Set(grants).size, grants.length, `${roleCode} contains duplicate bootstrap grants`);
    for (const permissionKey of grants) {
      assert.ok(known.has(permissionKey), `${roleCode} references unknown permission ${permissionKey}`);
    }
  }
});

test('Super Admin bootstrap contains all authority permissions while productivity eligibility remains explicitly assigned', () => {
  const authorityCatalog = PERMISSION_KEYS.filter((permissionKey) => permissionKey !== 'dashboards.productivity.count');
  assert.deepEqual([...LEGACY_ROLE_GRANTS.super_admin].sort(), [...authorityCatalog].sort());
  assert.equal(LEGACY_ROLE_GRANTS.admin.includes('security.super_admin.manage'), false);
  assert.equal(LEGACY_ROLE_GRANTS.super_admin.includes('security.super_admin.manage'), true);
  assert.equal(LEGACY_ROLE_GRANTS.admin.includes('dashboards.productivity.count'), false);
  assert.equal(LEGACY_ROLE_GRANTS.super_admin.includes('dashboards.productivity.count'), false);
});
