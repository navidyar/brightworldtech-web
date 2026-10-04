'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');
const { createPermissionManagementService } = require('./permissionManagementService');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createFakeRepository() {
  const state = {
    roles: [
      { role_id: 1, code: 'admin', system_key: null, name: 'Admin', description: null, is_active: true },
      { role_id: 2, code: 'tech', system_key: null, name: 'Tech', description: null, is_active: true },
      { role_id: 10, code: 'super_admin', system_key: 'super_admin', name: 'Super Admin', description: null, is_active: true },
      { role_id: 20, code: 'custom_existing', system_key: null, name: 'Existing Custom', description: 'Existing', is_active: true }
    ],
    rolePermissions: new Map([
      [1, new Set(['roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'roles.assign', 'role_permissions.manage', 'user_permissions.manage'])],
      [2, new Set(['units.view'])],
      [10, new Set(PERMISSION_KEYS)],
      [20, new Set(['units.view', 'lots.view'])]
    ]),
    users: [
      { user_id: 1, first_name: 'Root', last_name: 'Admin', email: 'root@example.com', is_active: true },
      { user_id: 2, first_name: 'Second', last_name: 'Admin', email: 'second@example.com', is_active: true },
      { user_id: 3, first_name: 'Taylor', last_name: 'Tech', email: 'tech@example.com', is_active: true }
    ],
    userRoles: new Map([
      [1, new Set([10, 1])],
      [2, new Set([1])],
      [3, new Set([2])]
    ]),
    overrides: new Map(),
    audits: [],
    legacyRetired: false,
    nextRoleId: 21
  };

  const findRole = (roleId) => state.roles.find((role) => role.role_id === Number(roleId)) || null;
  const findUser = (userId) => state.users.find((user) => user.user_id === Number(userId)) || null;
  const repo = {
    state,
    async withTransaction(work) { return work({ fake: true }); },
    async listRoles() {
      return state.roles.map((role) => ({
        ...clone(role),
        assignment_count: [...state.userRoles.values()].filter((ids) => ids.has(role.role_id)).length,
        permission_count: state.rolePermissions.get(role.role_id)?.size || 0
      }));
    },
    async listPermissionCatalog() {
      return PERMISSION_KEYS.map((permission_key, index) => ({ permission_id: index + 1, permission_key, is_active: true }));
    },
    async assertPermissionKeysExist(keys) {
      const unknown = keys.filter((key) => !PERMISSION_KEYS.includes(key));
      if (unknown.length) throw Object.assign(new Error('missing'), { code: 'PERMISSION_CATALOG_MISMATCH' });
    },
    async getRoleById(roleId) { return clone(findRole(roleId)); },
    async getRolePermissionKeys(roleId) { return [...(state.rolePermissions.get(Number(roleId)) || new Set())].sort(); },
    async createRole({ name, description, isActive }) {
      const role = {
        role_id: state.nextRoleId++, code: `custom_${state.nextRoleId}`, system_key: null,
        name, description, is_active: Boolean(isActive)
      };
      state.roles.push(role);
      state.rolePermissions.set(role.role_id, new Set());
      return clone(role);
    },
    async updateRole({ roleId, name, description, isActive }) {
      const role = findRole(roleId);
      Object.assign(role, { name, description, is_active: Boolean(isActive) });
      return clone(role);
    },
    async replaceRolePermissions({ roleId, permissionKeys }) {
      state.rolePermissions.set(Number(roleId), new Set(permissionKeys));
    },
    async getRoleAssignedUsers(roleId) {
      const id = Number(roleId);
      return state.users.filter((user) => state.userRoles.get(user.user_id)?.has(id)).map(clone);
    },
    async deleteRoleAssignments(roleId) {
      const id = Number(roleId);
      for (const roleIds of state.userRoles.values()) roleIds.delete(id);
    },
    async addRolesToUsers(userIds, roleIds) {
      for (const userId of userIds) {
        if (!state.userRoles.has(Number(userId))) state.userRoles.set(Number(userId), new Set());
        for (const roleId of roleIds) state.userRoles.get(Number(userId)).add(Number(roleId));
      }
    },
    async deleteRole(roleId) {
      const id = Number(roleId);
      state.roles = state.roles.filter((role) => role.role_id !== id);
      state.rolePermissions.delete(id);
    },
    async getUserById(userId) { return clone(findUser(userId)); },
    async getUserRoles(userId) {
      return [...(state.userRoles.get(Number(userId)) || new Set())].map(findRole).filter(Boolean).map(clone);
    },
    async getRolesByIds(roleIds) { return roleIds.map(findRole).filter(Boolean).map(clone); },
    async replaceUserRoles({ userId, roleIds }) { state.userRoles.set(Number(userId), new Set(roleIds.map(Number))); },
    async countActiveSuperAdminUsers() {
      return state.users.filter((user) => user.is_active && [...(state.userRoles.get(user.user_id) || [])].some((id) => findRole(id)?.system_key === 'super_admin')).length;
    },
    async getUserPermissionOverrides(userId) {
      return [...state.overrides.entries()]
        .filter(([key]) => key.startsWith(`${Number(userId)}:`))
        .map(([key, effect]) => ({ permission_key: key.split(':').slice(1).join(':'), effect }));
    },
    async getUserPermissionOverride(userId, permissionKey) {
      const effect = state.overrides.get(`${Number(userId)}:${permissionKey}`);
      return effect ? { permission_key: permissionKey, effect } : null;
    },
    async setUserPermissionOverride({ userId, permissionKey, effect }) {
      state.overrides.set(`${Number(userId)}:${permissionKey}`, effect);
    },
    async removeUserPermissionOverride({ userId, permissionKey }) {
      state.overrides.delete(`${Number(userId)}:${permissionKey}`);
    },
    async isMigrationStateApplied() { return state.legacyRetired; },
    async writeAuditEvent(_connection, event) { state.audits.push(clone(event)); },
    async listPermissionAuditEvents({ page = 1, eventType = null, search = '' } = {}) { return { events: clone(state.audits), hasNext: false, page, eventType: eventType || '', search: search || '' }; },
    async getPermissionAuditEventById(eventId) { return clone(state.audits.find((event) => Number(event.permission_audit_event_id) === Number(eventId)) || null); }
  };
  return repo;
}

const FULL_ADMIN = new Set([
  'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'roles.assign',
  'role_permissions.manage', 'user_permissions.manage', 'users.view',
  'audit.permissions.view', 'security.super_admin.manage'
]);

test('role administration state marks only active legacy compatibility identities as transitionally protected', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  let roles = await service.listRoles({ actorPermissions: FULL_ADMIN });
  assert.equal(roles.find((role) => role.role_id === 2).transitionallyProtected, true);
  assert.equal(roles.find((role) => role.role_id === 20).transitionallyProtected, false);
  assert.equal(roles.find((role) => role.role_id === 10).isPermanent, true);

  repo.state.legacyRetired = true;
  roles = await service.listRoles({ actorPermissions: FULL_ADMIN });
  assert.equal(roles.find((role) => role.role_id === 2).transitionallyProtected, false);
});

test('ordinary roles are generic permission bundles and can be created with default grants', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const role = await service.createRole({
    actorUserId: 1,
    actorPermissions: FULL_ADMIN,
    name: 'Repair Specialist',
    description: 'Repairs only',
    permissionKeys: ['units.view', 'units.edit']
  });
  assert.equal(role.name, 'Repair Specialist');
  assert.equal(role.system_key, null);
  assert.deepEqual(role.permissionKeys, ['units.edit', 'units.view']);
  assert.equal(repo.state.audits.at(-1).eventType, 'role_created');
});

test('renaming an existing ordinary role preserves its internal code and grants', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const updated = await service.updateRole({
    actorUserId: 1,
    actorPermissions: FULL_ADMIN,
    roleId: 2,
    name: 'Production Technician',
    description: 'Renamed',
    isActive: true
  });
  assert.equal(updated.name, 'Production Technician');
  assert.equal(updated.code, 'tech');
  assert.deepEqual(updated.permissionKeys, ['units.view']);
});

test('legacy role deactivation is transitionally blocked until legacy gates are retired', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.updateRole({ actorUserId: 1, actorPermissions: FULL_ADMIN, roleId: 2, name: 'Tech', isActive: false }),
    { code: 'LEGACY_ROLE_GATE_ACTIVE' }
  );
  repo.state.legacyRetired = true;
  const updated = await service.updateRole({ actorUserId: 1, actorPermissions: FULL_ADMIN, roleId: 2, name: 'Tech', isActive: false });
  assert.equal(updated.is_active, false);
});

test('role defaults remain grant-only and can be replaced independently of role name', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const result = await service.setRolePermissions({
    actorUserId: 1,
    actorPermissions: FULL_ADMIN,
    roleId: 20,
    permissionKeys: ['labels.print', 'units.view']
  });
  assert.deepEqual(result.permissionKeys, ['labels.print', 'units.view']);
  assert.equal(repo.state.audits.at(-1).eventType, 'role_permissions_replaced');
});

test('Super Admin cannot lose catalog permissions', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.setRolePermissions({ actorUserId: 1, actorPermissions: FULL_ADMIN, roleId: 10, permissionKeys: ['units.view'] }),
    { code: 'SUPER_ADMIN_PERMISSIONS_PROTECTED' }
  );
});

test('duplicating a role copies its current grants without linking future changes', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const duplicate = await service.duplicateRole({ actorUserId: 1, actorPermissions: FULL_ADMIN, sourceRoleId: 20, name: 'Copy Role' });
  assert.deepEqual(duplicate.permissionKeys, ['lots.view', 'units.view']);
  repo.state.rolePermissions.get(20).add('labels.print');
  assert.deepEqual(await repo.getRolePermissionKeys(duplicate.role_id), ['lots.view', 'units.view']);
});

test('multiple user roles are preserved instead of collapsing to a primary role', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const result = await service.setUserRoles({ actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 3, roleIds: [2, 20] });
  assert.deepEqual(result.roleIds, [2, 20]);
  assert.deepEqual([...repo.state.userRoles.get(3)].sort((a, b) => a - b), [2, 20]);
  assert.equal(repo.state.audits.at(-1).eventType, 'user_roles_replaced');
});


test('Super Admin management capability cannot be delegated by an actor who does not already hold it', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const withoutSecurity = new Set([...FULL_ADMIN].filter((key) => key !== 'security.super_admin.manage'));
  await assert.rejects(
    service.setRolePermissions({
      actorUserId: 2,
      actorPermissions: withoutSecurity,
      roleId: 20,
      permissionKeys: ['units.view', 'security.super_admin.manage']
    }),
    { code: 'PERMISSION_REQUIRED' }
  );
  await assert.rejects(
    service.setUserPermissionOverride({
      actorUserId: 2,
      actorPermissions: withoutSecurity,
      userId: 3,
      permissionKey: 'security.super_admin.manage',
      effect: 'allow'
    }),
    { code: 'PERMISSION_REQUIRED' }
  );
});

test('Super Admin management capability cannot be revoked by an actor who does not hold it', async () => {
  const repo = createFakeRepository();
  repo.state.rolePermissions.set(20, new Set(['units.view', 'security.super_admin.manage']));
  const service = createPermissionManagementService(repo);
  const withoutSecurity = new Set([...FULL_ADMIN].filter((key) => key !== 'security.super_admin.manage'));
  await assert.rejects(
    service.setRolePermissions({
      actorUserId: 2,
      actorPermissions: withoutSecurity,
      roleId: 20,
      permissionKeys: ['units.view']
    }),
    { code: 'PERMISSION_REQUIRED' }
  );
  assert.deepEqual(
    await repo.getRolePermissionKeys(20),
    ['security.super_admin.manage', 'units.view']
  );
});

test('Super Admin assignment changes require dedicated security authority', async () => {
  const repo = createFakeRepository();
  repo.state.userRoles.set(2, new Set([1, 10]));
  const service = createPermissionManagementService(repo);
  const withoutSecurity = new Set([...FULL_ADMIN].filter((key) => key !== 'security.super_admin.manage'));
  await assert.rejects(
    service.setUserRoles({ actorUserId: 1, actorPermissions: withoutSecurity, userId: 2, roleIds: [1] }),
    { code: 'PERMISSION_REQUIRED' }
  );
});

test('the last active Super Admin assignment cannot be removed', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.setUserRoles({ actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 1, roleIds: [1] }),
    { code: 'LAST_SUPER_ADMIN' }
  );
});

test('user overrides support allow, deny, and inherit removal', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  let result = await service.setUserPermissionOverride({
    actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 3, permissionKey: 'lots.view', effect: 'allow'
  });
  assert.deepEqual(result, { permission_key: 'lots.view', effect: 'allow' });
  result = await service.setUserPermissionOverride({
    actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 3, permissionKey: 'lots.view', effect: 'deny'
  });
  assert.equal(result.effect, 'deny');
  result = await service.setUserPermissionOverride({
    actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 3, permissionKey: 'lots.view', effect: 'inherit'
  });
  assert.equal(result, null);
  assert.equal(repo.state.overrides.has('3:lots.view'), false);
});

test('user-level overrides cannot weaken a Super Admin user', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.setUserPermissionOverride({
      actorUserId: 1, actorPermissions: FULL_ADMIN, userId: 1, permissionKey: 'units.view', effect: 'deny'
    }),
    { code: 'SUPER_ADMIN_OVERRIDE_PROTECTED' }
  );
});

test('Super Admin can change user-only productivity eligibility without weakening authority permissions', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  const result = await service.setUserPermissionOverride({
    actorUserId: 1,
    actorPermissions: FULL_ADMIN,
    userId: 1,
    permissionKey: 'dashboards.productivity.count',
    effect: 'allow'
  });
  assert.deepEqual(result, { permission_key: 'dashboards.productivity.count', effect: 'allow' });
  assert.equal(repo.state.overrides.get('1:dashboards.productivity.count'), 'allow');
  await assert.rejects(
    service.setUserPermissionOverride({
      actorUserId: 1,
      actorPermissions: FULL_ADMIN,
      userId: 1,
      permissionKey: 'units.view',
      effect: 'deny'
    }),
    { code: 'SUPER_ADMIN_OVERRIDE_PROTECTED' }
  );
});

test('deleting an assigned custom role requires explicit reassignment/removal and audits deletion', async () => {
  const repo = createFakeRepository();
  repo.state.userRoles.set(3, new Set([2, 20]));
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.deleteRole({ actorUserId: 1, actorPermissions: FULL_ADMIN, roleId: 20 }),
    { code: 'ROLE_STILL_ASSIGNED' }
  );
  const result = await service.deleteRole({ actorUserId: 1, actorPermissions: FULL_ADMIN, roleId: 20, replacementRoleIds: [1] });
  assert.equal(result.deletedRoleId, 20);
  assert.deepEqual([...repo.state.userRoles.get(3)].sort((a, b) => a - b), [1, 2]);
  assert.equal(repo.state.audits.at(-1).eventType, 'role_deleted');
});

test('permission audit visibility is separately permission-gated', async () => {
  const repo = createFakeRepository();
  const service = createPermissionManagementService(repo);
  await assert.rejects(
    service.listPermissionAuditEvents({ actorPermissions: new Set(['role_permissions.manage']) }),
    { code: 'PERMISSION_REQUIRED' }
  );
  const result = await service.listPermissionAuditEvents({ actorPermissions: new Set(['audit.permissions.view']) });
  assert.equal(Array.isArray(result.events), true);
});

test('batch user overrides save allow/deny/inherit changes atomically and audit only changed permissions', async () => {
  const repo = createFakeRepository();
  repo.state.overrides.set('3:lots.view', 'allow');
  const service = createPermissionManagementService(repo);

  const result = await service.replaceUserPermissionOverrides({
    actorUserId: 1,
    actorPermissions: FULL_ADMIN,
    userId: 3,
    overrides: [
      { permissionKey: 'units.view', effect: 'deny' },
      { permissionKey: 'lots.view', effect: 'inherit' },
      { permissionKey: 'labels.print', effect: 'allow' },
      { permissionKey: 'requests.view', effect: 'inherit' }
    ]
  });

  assert.equal(result.changed.length, 3);
  assert.equal(repo.state.overrides.get('3:units.view'), 'deny');
  assert.equal(repo.state.overrides.has('3:lots.view'), false);
  assert.equal(repo.state.overrides.get('3:labels.print'), 'allow');
  assert.equal(repo.state.overrides.has('3:requests.view'), false);
  assert.deepEqual(
    repo.state.audits.slice(-3).map((event) => [event.eventType, event.permissionKeySnapshot]),
    [
      ['user_permission_override_set', 'units.view'],
      ['user_permission_override_removed', 'lots.view'],
      ['user_permission_override_set', 'labels.print']
    ]
  );
});

test('batch user overrides cannot change Super Admin management authority without that authority', async () => {
  const repo = createFakeRepository();
  repo.state.overrides.set('3:security.super_admin.manage', 'deny');
  const service = createPermissionManagementService(repo);
  const withoutSecurity = new Set([...FULL_ADMIN].filter((key) => key !== 'security.super_admin.manage'));

  await assert.rejects(
    service.replaceUserPermissionOverrides({
      actorUserId: 2,
      actorPermissions: withoutSecurity,
      userId: 3,
      overrides: [{ permissionKey: 'security.super_admin.manage', effect: 'inherit' }]
    }),
    { code: 'PERMISSION_REQUIRED' }
  );
  assert.equal(repo.state.overrides.get('3:security.super_admin.manage'), 'deny');
});

test('user permission administration state shows role sources overrides and final effective access', async () => {
  const repo = createFakeRepository();
  repo.state.userRoles.set(3, new Set([2, 20]));
  repo.state.overrides.set('3:units.view', 'deny');
  repo.state.overrides.set('3:labels.print', 'allow');
  const service = createPermissionManagementService(repo);

  const state = await service.getUserPermissionAdministrationState({
    actorPermissions: FULL_ADMIN,
    userId: 3
  });
  const units = state.permissions.find((permission) => permission.permission_key === 'units.view');
  const lots = state.permissions.find((permission) => permission.permission_key === 'lots.view');
  const labels = state.permissions.find((permission) => permission.permission_key === 'labels.print');

  assert.deepEqual(units.roleSources.map((source) => source.name).sort(), ['Existing Custom', 'Tech']);
  assert.equal(units.inheritedAllowed, true);
  assert.equal(units.overrideEffect, 'deny');
  assert.equal(units.effectiveAllowed, false);
  assert.deepEqual(lots.roleSources.map((source) => source.name), ['Existing Custom']);
  assert.equal(lots.overrideEffect, null);
  assert.equal(lots.effectiveAllowed, true);
  assert.equal(labels.inheritedAllowed, false);
  assert.equal(labels.overrideEffect, 'allow');
  assert.equal(labels.effectiveAllowed, true);
});


test('permission audit listing and event detail require the dedicated audit permission', async () => {
  const repo = createFakeRepository();
  repo.state.audits.push({
    permission_audit_event_id: 77,
    event_type: 'role_updated',
    actor_user_id: 1,
    actor_name_snapshot: 'Root Admin',
    target_role_id: 20,
    target_role_name_snapshot: 'Existing Custom',
    before_state: { name: 'Existing Custom' },
    after_state: { name: 'Renamed Custom' }
  });
  const service = createPermissionManagementService(repo);

  await assert.rejects(
    service.listPermissionAuditEvents({ actorPermissions: new Set(), page: 1 }),
    { code: 'PERMISSION_REQUIRED' }
  );
  await assert.rejects(
    service.getPermissionAuditEvent({ actorPermissions: new Set(), eventId: 77 }),
    { code: 'PERMISSION_REQUIRED' }
  );

  const permissions = new Set(['audit.permissions.view']);
  const list = await service.listPermissionAuditEvents({ actorPermissions: permissions, page: 2, eventType: 'role_updated', search: 'Root' });
  assert.equal(list.page, 2);
  assert.equal(list.eventType, 'role_updated');
  assert.equal(list.search, 'Root');

  const event = await service.getPermissionAuditEvent({ actorPermissions: permissions, eventId: 77 });
  assert.equal(event.permission_audit_event_id, 77);
  assert.equal(event.event_type, 'role_updated');
  await assert.rejects(
    service.getPermissionAuditEvent({ actorPermissions: permissions, eventId: 999 }),
    { code: 'AUDIT_EVENT_NOT_FOUND' }
  );
});
