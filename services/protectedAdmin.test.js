'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dbModulePath = require.resolve('../models/db');
const auditWrites = [];
require.cache[dbModulePath] = {
  id: dbModulePath, filename: dbModulePath, loaded: true,
  exports: { pool: { async query(sql, values) {
    if (sql.includes('INSERT INTO user_management_audit')) auditWrites.push(values);
    return [[]];
  } } }
};
const { canManageUser, isProtectedAdmin, assertProtectedAdminInvariant } = require('../config/protectedAdmin');
const { requireProtectedAdminAccess } = require('../middleware/protectedAdminMiddleware');

test('NAYA account remains protected by user ID when its email changes', () => {
  assert.equal(isProtectedAdmin(1), true);
  assert.equal(isProtectedAdmin('1'), true);
  assert.equal(canManageUser(2, 1), false);
  assert.equal(canManageUser(1, 1), true);
  assert.equal(canManageUser(2, 3), true);
  assert.doesNotThrow(() => assertProtectedAdminInvariant({ userId: 1, roleCodes: ['admin'], isActive: true }));
  assert.doesNotThrow(() => assertProtectedAdminInvariant({ userId: 2, roleCodes: ['tech'], isActive: false, deleting: true }));
});

test('another admin cannot access NAYA account actions by direct request', async () => {
  let continued = false;
  let rendered = null;
  const response = {
    status(code) {
      assert.equal(code, 403);
      return this;
    },
    render(view, data) {
      rendered = { view, data };
    }
  };

  await requireProtectedAdminAccess(
    { currentUser: { user_id: 2 }, params: { userId: '1' } },
    response,
    () => { continued = true; }
  );

  assert.equal(continued, false);
  assert.equal(rendered.view, 'pages/error');
  assert.match(rendered.data.message, /protected Admin account/);
});

test('NAYA can manage his own account and other admins can manage other users', async () => {
  for (const [actorId, targetId] of [[1, '1'], [2, '3']]) {
    let continued = false;
    await requireProtectedAdminAccess(
      { currentUser: { user_id: actorId }, params: { userId: targetId } },
      { status() { assert.fail('Allowed request was denied.'); } },
      () => { continued = true; }
    );
    assert.equal(continued, true);
  }
});

test('Create User upsert cannot remove NAYA Admin role, including when NAYA submits it', async () => {
  const dbPath = require.resolve('../models/db');
  const lookupPath = require.resolve('../models/configLookupModel');
  let changedAccount = false;
  let rolledBack = false;
  const connection = {
    async beginTransaction() {},
    async query(sql) {
      if (sql.includes('SELECT user_id, username')) {
        return [[{ user_id: 1, username: 'naya' }]];
      }
      changedAccount = true;
      throw new Error(`Unexpected account mutation: ${sql}`);
    },
    async rollback() { rolledBack = true; },
    release() {}
  };
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: { pool: { async getConnection() { return connection; } } }
  };
  require.cache[lookupPath] = {
    id: lookupPath, filename: lookupPath, loaded: true,
    exports: { getConfigValueIdBySystemId: async () => 10 }
  };
  const authModel = require('../models/authModel');

  for (const actorUserId of [2, 1]) {
    await assert.rejects(
      authModel.createUserWithRoles({
        firstName: 'Naya', lastName: 'Admin',
        email: 'navid.y@mortaldeveloper.com',
        roleCodes: ['tech'], actorUserId
      }),
      { code: 'PROTECTED_ADMIN_USER' }
    );
  }
  assert.equal(changedAccount, false);
  assert.equal(rolledBack, true);
});

test('model rejects protected role removal, deactivation, and deletion before database writes', async () => {
  const managementModel = require('../models/managementModel');

  await assert.rejects(
    managementModel.updateUserWithRoles({ userId: 1, roleCodes: ['tech'] }),
    { code: 'PROTECTED_ADMIN_USER' }
  );
  await assert.rejects(managementModel.deactivateUser(1), { code: 'PROTECTED_ADMIN_USER' });
  await assert.rejects(managementModel.deletePendingSetupUser(1), { code: 'PROTECTED_ADMIN_USER' });
});

test('protected Admin cannot deactivate or delete themselves through account actions', async () => {
  const managementController = require('../controllers/managementController');
  const request = {
    currentUser: { user_id: 1 },
    params: { userId: '1' },
    body: { returnPath: 'active' },
    get() { return ''; }
  };
  let redirectUrl;
  const response = { redirect(url) { redirectUrl = url; } };

  await managementController.deactivateUser(request, response, assert.fail);
  assert.equal(redirectUrl, '/management/users?error=self_deactivate');

  await managementController.deletePendingSetupUser(request, response, assert.fail);
  assert.equal(redirectUrl, '/management/users?error=self_delete');
});

test('blocked protected role, deactivation and deletion attempts are audited', () => {
  const blockedActions = auditWrites
    .filter((values) => values[5] === 'blocked' && Number(values[1]) === 1)
    .map((values) => values[4]);
  assert.ok(blockedActions.includes('user_role_change_blocked'));
  assert.ok(blockedActions.includes('user_deactivation_blocked'));
  assert.ok(blockedActions.includes('user_deletion_blocked'));
});

test('audit write failure never allows a blocked protected-account request', async () => {
  const auditModel = require('../models/userManagementAuditModel');
  const originalRecordBlocked = auditModel.recordBlocked;
  auditModel.recordBlocked = async () => { throw new Error('audit unavailable'); };
  let continued = false;
  let statusCode = null;
  try {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await requireProtectedAdminAccess(
        { currentUser: { user_id: 2 }, params: { userId: '1' }, path: '/management/users/1/deactivate' },
        { status(code) { statusCode = code; return this; }, render() {} },
        () => { continued = true; }
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(continued, false);
    assert.equal(statusCode, 403);
  } finally {
    auditModel.recordBlocked = originalRecordBlocked;
  }
});
