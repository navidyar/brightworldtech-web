'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const queries = [];
const pool = {
  async query(sql, values) {
    queries.push({ sql, values });
    return [[]];
  }
};
const dbPath = require.resolve('../models/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
const audit = require('../models/userManagementAuditModel');

test('only allowed profile and role fields enter audit changes', () => {
  assert.deepEqual(audit.diffSnapshots(
    { email: 'old@example.com', roles: ['admin'], password_hash: 'old-secret' },
    { email: 'new@example.com', roles: ['admin'], password_hash: 'new-secret', reset_token: 'token' }
  ), { email: { old: 'old@example.com', new: 'new@example.com' } });
});

test('audit event stores actor, target, action, result and structured changes without secrets', async () => {
  const calls = [];
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM users u')) {
        return [[{ user_id: values[0], first_name: 'Naya', last_name: 'Admin', is_active: 1, role_codes: 'admin' }]];
      }
      return [{ affectedRows: 1 }];
    }
  };
  await audit.writeEvent(connection, {
    actorUserId: 1, targetUserId: 1, action: 'user_profile_updated',
    before: { first_name: 'Old', password_hash: 'secret' },
    after: { first_name: 'Naya', password_hash: 'different-secret' }
  });
  const insert = calls.find((call) => call.sql.includes('INSERT INTO user_management_audit'));
  assert.ok(insert);
  assert.deepEqual(insert.values.slice(0, 2), [1, 1]);
  assert.equal(insert.values[4], 'user_profile_updated');
  assert.equal(insert.values[5], 'success');
  assert.deepEqual(JSON.parse(insert.values[6]), { first_name: { old: 'Old', new: 'Naya' } });
  assert.doesNotMatch(JSON.stringify(insert.values), /secret|token/i);
});

test('profile mutation writes audit before commit and rolls back if audit insert fails', async () => {
  const managementModel = require('../models/managementModel');
  const sequence = [];
  let firstName = 'Old';
  let failAudit = false;
  const connection = {
    async beginTransaction() { sequence.push('begin'); },
    async rollback() { sequence.push('rollback'); },
    async commit() { sequence.push('commit'); },
    release() {},
    async query(sql, values) {
      if (sql.includes('FROM users u') && sql.includes('GROUP_CONCAT')) {
        return [[{ user_id: 1, first_name: firstName, last_name: 'Admin', email: 'naya@example.com', is_active: 1, role_codes: 'admin' }]];
      }
      if (sql.includes('UPDATE users')) {
        firstName = values[0];
        sequence.push('update');
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO user_management_audit')) {
        sequence.push('audit');
        if (failAudit) throw new Error('audit write failed');
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  pool.getConnection = async () => connection;
  await managementModel.updateUserProfile({ userId: 1, actorUserId: 1, firstName: 'Naya', lastName: 'Admin', email: 'naya@example.com' });
  assert.deepEqual(sequence, ['begin', 'update', 'audit', 'commit']);

  sequence.length = 0;
  failAudit = true;
  await assert.rejects(
    managementModel.updateUserProfile({ userId: 1, actorUserId: 1, firstName: 'Changed', lastName: 'Admin', email: 'naya@example.com' }),
    /audit write failed/
  );
  assert.deepEqual(sequence, ['begin', 'update', 'audit', 'rollback']);
});

test('creation records user-management and permission-role audit events before transaction commit', async () => {
  const lookupPath = require.resolve('../models/configLookupModel');
  require.cache[lookupPath] = {
    id: lookupPath, filename: lookupPath, loaded: true,
    exports: { getConfigValueIdBySystemId: async () => 10 }
  };
  const permissionManagementModel = require('../models/permissionManagementModel');
  const originalGetUserRoles = permissionManagementModel.getUserRoles;
  const originalWriteAuditEvent = permissionManagementModel.writeAuditEvent;
  const sequence = [];
  permissionManagementModel.getUserRoles = async () => [{
    role_id: 5, code: 'tech', system_key: null, name: 'Tech', description: null, is_active: true
  }];
  permissionManagementModel.writeAuditEvent = async (_connection, event) => {
    sequence.push(`permission-audit:${event.eventType}`);
  };
  const authModel = require('../models/authModel');
  const connection = {
    async beginTransaction() { sequence.push('begin'); },
    async commit() { sequence.push('commit'); },
    async rollback() { sequence.push('rollback'); },
    release() {},
    async query(sql, values) {
      if (sql.includes('SELECT user_id, username')) return [[]];
      if (sql.includes('SELECT username')) return [[]];
      if (sql.includes('INSERT INTO users')) { sequence.push('create'); return [{ insertId: 22 }]; }
      if (sql.includes('SELECT role_id')) return [[{ role_id: 5 }]];
      if (sql.includes('DELETE FROM user_roles')) return [{ affectedRows: 0 }];
      if (sql.includes('INSERT IGNORE INTO user_roles')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM users u') && sql.includes('GROUP_CONCAT')) {
        return [[{ user_id: values[0], first_name: 'Taylor', last_name: 'Tech', email: 'taylor@example.com', is_active: 1, role_codes: 'tech' }]];
      }
      if (sql.includes('INSERT INTO user_management_audit')) {
        sequence.push(`audit:${values[4]}`);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  pool.getConnection = async () => connection;
  try {
    await authModel.createUserWithRoles({ firstName: 'Taylor', lastName: 'Tech', email: 'taylor@example.com', roleCodes: ['tech'], actorUserId: 1 });
    assert.deepEqual(sequence, ['begin', 'create', 'audit:user_created', 'permission-audit:user_roles_replaced', 'commit']);
  } finally {
    permissionManagementModel.getUserRoles = originalGetUserRoles;
    permissionManagementModel.writeAuditEvent = originalWriteAuditEvent;
  }
});

test('password reset audit records the event without its token or hash', async () => {
  const authModel = require('../models/authModel');
  const sequence = [];
  let auditValues;
  const connection = {
    async beginTransaction() { sequence.push('begin'); },
    async commit() { sequence.push('commit'); },
    async rollback() { sequence.push('rollback'); },
    release() {},
    async query(sql, values) {
      if (sql.includes('UPDATE user_password_links')) return [{ affectedRows: 0 }];
      if (sql.includes('INSERT INTO user_password_links')) { sequence.push('link'); return [{ insertId: 10 }]; }
      if (sql.includes('FROM users u') && sql.includes('GROUP_CONCAT')) {
        return [[{ user_id: values[0], first_name: 'Taylor', last_name: 'Tech', is_active: 1, role_codes: 'tech' }]];
      }
      if (sql.includes('INSERT INTO user_management_audit')) {
        auditValues = values;
        sequence.push('audit');
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  pool.getConnection = async () => connection;
  await authModel.createPasswordLink({ userId: 22, createdByUserId: 1, linkTypeCode: 'password_reset', tokenHash: 'sensitive-hash', expiresAt: new Date() });
  assert.deepEqual(sequence, ['begin', 'link', 'audit', 'commit']);
  assert.equal(auditValues[4], 'password_reset_initiated');
  assert.doesNotMatch(JSON.stringify(auditValues), /sensitive-hash/);
});

test('role change, activation, deactivation and deletion use transactional audit events', async () => {
  const permissionManagementModel = require('../models/permissionManagementModel');
  const originalGetUserRoles = permissionManagementModel.getUserRoles;
  const originalPermissionWrite = permissionManagementModel.writeAuditEvent;
  const managementModel = require('../models/managementModel');
  const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
  const originalSnapshot = audit.getSnapshot;
  const originalWrite = audit.writeEvent;
  const actions = [];
  const permissionActions = [];
  let snapshotCalls = 0;
  let permissionRoleCalls = 0;
  audit.getSnapshot = async () => {
    snapshotCalls += 1;
    return { user_id: 22, first_name: 'Taylor', last_name: 'Tech', roles: snapshotCalls % 2 ? ['tech'] : ['management'], is_active: true };
  };
  audit.writeEvent = async (_connection, event) => { actions.push(event.action); };
  permissionManagementModel.getUserRoles = async () => {
    permissionRoleCalls += 1;
    const role = permissionRoleCalls % 2
      ? { role_id: 5, code: 'tech', system_key: null, name: 'Tech', is_active: true }
      : { role_id: 2, code: 'management', system_key: null, name: 'Management', is_active: true };
    return [role];
  };
  permissionManagementModel.writeAuditEvent = async (_connection, event) => { permissionActions.push(event.eventType); };
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql) {
      if (sql.includes('account_status_system_config_value_id')) {
        return [[{ user_id: 22, account_status_system_config_value_id: SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP, has_password: 0, last_login_at: null }]];
      }
      if (sql.includes('SELECT role_id')) return [[{ role_id: 5 }]];
      if (sql.includes('UPDATE users') || sql.includes('DELETE FROM users')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    }
  };
  pool.getConnection = async () => connection;
  try {
    await managementModel.updateUserWithRoles({ userId: 22, actorUserId: 1, firstName: 'Taylor', lastName: 'Tech', email: 'taylor@example.com', roleCodes: ['management'] });
    await managementModel.deactivateUser(22, 1);
    await managementModel.reactivateUser(22, 1);
    await managementModel.deletePendingSetupUser(22, 1);
    assert.deepEqual(actions, ['user_roles_updated', 'user_deactivated', 'user_activated', 'user_deleted']);
    assert.deepEqual(permissionActions, ['user_roles_replaced']);
  } finally {
    audit.getSnapshot = originalSnapshot;
    audit.writeEvent = originalWrite;
    permissionManagementModel.getUserRoles = originalGetUserRoles;
    permissionManagementModel.writeAuditEvent = originalPermissionWrite;
  }
});

test('history route requires the effective user-management audit permission', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes/management.js'), 'utf8');
  const historyRoute = routes.match(/router\.get\(\s*'\/management\/users\/history',[\s\S]*?\);/)[0];
  assert.match(historyRoute, /requireAuth/);
  assert.match(historyRoute, /requirePermission\('audit\.user_management\.view'\)/);
  assert.doesNotMatch(historyRoute, /requireFeature\('userAdministration'\)/);

  const { requirePermission } = require('../middleware/authMiddleware');
  let continued = false;
  let statusCode = null;
  const response = {
    status(code) { statusCode = code; return this; },
    render() { return this; }
  };
  requirePermission('audit.user_management.view')(
    { currentUser: { roles: ['admin'] }, currentPermissions: new Set() }, response, () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(statusCode, 403);

  requirePermission('audit.user_management.view')(
    { currentUser: { roles: ['tech'] }, currentPermissions: new Set(['audit.user_management.view']) },
    response,
    () => { continued = true; }
  );
  assert.equal(continued, true);
});
