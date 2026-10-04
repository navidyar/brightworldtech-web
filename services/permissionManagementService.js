'use strict';

const {
  SUPER_ADMIN_SYSTEM_KEY,
  LEGACY_AUTHORIZATION_RETIREMENT_KEY,
  policyError,
  normalizePositiveInteger,
  normalizeRoleName,
  normalizeRoleDescription,
  normalizePermissionKeys,
  isUserOnlyPermissionKey,
  assertRoleAssignablePermissionKeys,
  normalizeRoleIds,
  normalizeOverrideEffect,
  hasPermission,
  requirePermission,
  requirePermissions,
  isSuperAdminRole,
  isLegacyCompatibilityRole,
  assertRoleCanDeactivateOrDelete,
  assertSuperAdminPermissionSet
} = require('./permissionManagementPolicy');
const { resolveEffectivePermissions } = require('./permissionResolver');

function roleSnapshot(role, permissionKeys = undefined) {
  if (!role) return null;
  const snapshot = {
    roleId: Number(role.role_id),
    code: role.code,
    systemKey: role.system_key || null,
    name: role.name,
    description: role.description || null,
    isActive: Boolean(role.is_active)
  };
  if (permissionKeys !== undefined) snapshot.permissionKeys = [...permissionKeys].sort();
  return snapshot;
}

function userRoleSnapshot(user, roles) {
  return {
    userId: Number(user.user_id),
    isActive: Boolean(user.is_active),
    roleIds: roles.map((role) => Number(role.role_id)).sort((a, b) => a - b),
    roles: roles.map((role) => ({
      roleId: Number(role.role_id),
      name: role.name,
      systemKey: role.system_key || null
    })).sort((a, b) => a.roleId - b.roleId)
  };
}

function normalizeOverrideEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const normalized = new Map();

  for (const entry of entries) {
    const permissionKey = normalizePermissionKeys([entry && (entry.permissionKey ?? entry.permission_key)])[0];
    if (!permissionKey) continue;
    normalized.set(permissionKey, normalizeOverrideEffect(entry && entry.effect));
  }

  return [...normalized.entries()].map(([permissionKey, effect]) => ({ permissionKey, effect }));
}

function createPermissionManagementService(repository) {
  if (!repository) repository = require('../models/permissionManagementModel');
  async function listRoles({ actorPermissions } = {}) {
    requirePermission(actorPermissions, 'roles.view');
    const [roles, legacyAuthorizationRetired] = await Promise.all([
      repository.listRoles(),
      repository.isMigrationStateApplied(LEGACY_AUTHORIZATION_RETIREMENT_KEY)
    ]);
    return Promise.all(roles.map(async (role) => ({
      ...role,
      permissionKeys: (await repository.getRolePermissionKeys(role.role_id)).filter((permissionKey) => !isUserOnlyPermissionKey(permissionKey)),
      isPermanent: isSuperAdminRole(role),
      transitionallyProtected: isLegacyCompatibilityRole(role) && !legacyAuthorizationRetired
    })));
  }

  async function listPermissionCatalog({ actorPermissions } = {}) {
    requirePermission(actorPermissions, 'roles.view');
    return repository.listPermissionCatalog();
  }

  async function createRole({ actorUserId, actorPermissions, name, description = null, permissionKeys = [] }) {
    requirePermission(actorPermissions, 'roles.create');
    const safeName = normalizeRoleName(name);
    const safeDescription = normalizeRoleDescription(description);
    const safePermissionKeys = normalizePermissionKeys(permissionKeys);
    assertRoleAssignablePermissionKeys(safePermissionKeys);
    if (safePermissionKeys.length > 0) requirePermission(actorPermissions, 'role_permissions.manage');
    if (safePermissionKeys.includes('security.super_admin.manage')) {
      requirePermission(actorPermissions, 'security.super_admin.manage');
    }

    return repository.withTransaction(async (connection) => {
      await repository.assertPermissionKeysExist(safePermissionKeys, connection);
      const role = await repository.createRole({ name: safeName, description: safeDescription, isActive: true }, connection);
      if (safePermissionKeys.length > 0) {
        await repository.replaceRolePermissions({
          roleId: role.role_id,
          permissionKeys: safePermissionKeys,
          actorUserId
        }, connection);
      }
      const after = roleSnapshot(role, safePermissionKeys);
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'role_created',
        targetRoleId: role.role_id,
        targetRoleNameSnapshot: role.name,
        afterState: after
      });
      return { ...role, permissionKeys: safePermissionKeys };
    });
  }

  async function updateRole({ actorUserId, actorPermissions, roleId, name, description = null, isActive = true }) {
    requirePermission(actorPermissions, 'roles.edit');
    const safeRoleId = normalizePositiveInteger(roleId, 'Role ID');
    const safeName = normalizeRoleName(name);
    const safeDescription = normalizeRoleDescription(description);
    const safeIsActive = Boolean(isActive);

    return repository.withTransaction(async (connection) => {
      const role = await repository.getRoleById(safeRoleId, connection, { forUpdate: true });
      if (!role) throw policyError('ROLE_NOT_FOUND', 'Role was not found.');
      const permissionKeys = await repository.getRolePermissionKeys(safeRoleId, connection);
      const before = roleSnapshot(role, permissionKeys);

      if (role.is_active && !safeIsActive) {
        const legacyAuthorizationRetired = await repository.isMigrationStateApplied(
          LEGACY_AUTHORIZATION_RETIREMENT_KEY,
          connection
        );
        assertRoleCanDeactivateOrDelete(role, { legacyAuthorizationRetired });
      }

      const updated = await repository.updateRole({
        roleId: safeRoleId,
        name: safeName,
        description: safeDescription,
        isActive: safeIsActive
      }, connection);
      const after = roleSnapshot(updated, permissionKeys);
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'role_updated',
        targetRoleId: safeRoleId,
        targetRoleNameSnapshot: updated.name,
        beforeState: before,
        afterState: after
      });
      return { ...updated, permissionKeys };
    });
  }

  async function setRolePermissions({ actorUserId, actorPermissions, roleId, permissionKeys }) {
    requirePermission(actorPermissions, 'role_permissions.manage');
    const safeRoleId = normalizePositiveInteger(roleId, 'Role ID');
    const safePermissionKeys = normalizePermissionKeys(permissionKeys);
    assertRoleAssignablePermissionKeys(safePermissionKeys);

    return repository.withTransaction(async (connection) => {
      const role = await repository.getRoleById(safeRoleId, connection, { forUpdate: true });
      if (!role) throw policyError('ROLE_NOT_FOUND', 'Role was not found.');
      assertSuperAdminPermissionSet(role, safePermissionKeys);
      await repository.assertPermissionKeysExist(safePermissionKeys, connection);
      const beforeKeys = await repository.getRolePermissionKeys(safeRoleId, connection);
      const hadSuperAdminManagement = beforeKeys.includes('security.super_admin.manage');
      const willHaveSuperAdminManagement = safePermissionKeys.includes('security.super_admin.manage');
      if (hadSuperAdminManagement !== willHaveSuperAdminManagement) {
        requirePermission(actorPermissions, 'security.super_admin.manage');
      }
      await repository.replaceRolePermissions({
        roleId: safeRoleId,
        permissionKeys: safePermissionKeys,
        actorUserId
      }, connection);
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'role_permissions_replaced',
        targetRoleId: safeRoleId,
        targetRoleNameSnapshot: role.name,
        beforeState: { permissionKeys: beforeKeys },
        afterState: { permissionKeys: safePermissionKeys }
      });
      return { ...role, permissionKeys: safePermissionKeys };
    });
  }

  async function duplicateRole({ actorUserId, actorPermissions, sourceRoleId, name }) {
    requirePermissions(actorPermissions, ['roles.create', 'role_permissions.manage']);
    const safeSourceRoleId = normalizePositiveInteger(sourceRoleId, 'Source role ID');
    const safeName = normalizeRoleName(name);

    return repository.withTransaction(async (connection) => {
      const sourceRole = await repository.getRoleById(safeSourceRoleId, connection, { forUpdate: true });
      if (!sourceRole) throw policyError('ROLE_NOT_FOUND', 'Source role was not found.');
      const permissionKeys = (await repository.getRolePermissionKeys(safeSourceRoleId, connection))
        .filter((permissionKey) => !isUserOnlyPermissionKey(permissionKey));
      if (permissionKeys.includes('security.super_admin.manage')) {
        requirePermission(actorPermissions, 'security.super_admin.manage');
      }
      const role = await repository.createRole({
        name: safeName,
        description: sourceRole.description || null,
        isActive: true
      }, connection);
      await repository.replaceRolePermissions({ roleId: role.role_id, permissionKeys, actorUserId }, connection);
      const after = roleSnapshot(role, permissionKeys);
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'role_duplicated',
        targetRoleId: role.role_id,
        targetRoleNameSnapshot: role.name,
        beforeState: { sourceRoleId: safeSourceRoleId, sourceRoleName: sourceRole.name },
        afterState: after
      });
      return { ...role, permissionKeys };
    });
  }

  async function deleteRole({
    actorUserId,
    actorPermissions,
    roleId,
    replacementRoleIds = [],
    removeAssignments = false
  }) {
    requirePermission(actorPermissions, 'roles.delete');
    const safeRoleId = normalizePositiveInteger(roleId, 'Role ID');
    const safeReplacementRoleIds = normalizeRoleIds(replacementRoleIds).filter((id) => id !== safeRoleId);

    return repository.withTransaction(async (connection) => {
      const role = await repository.getRoleById(safeRoleId, connection, { forUpdate: true });
      if (!role) throw policyError('ROLE_NOT_FOUND', 'Role was not found.');
      const legacyAuthorizationRetired = await repository.isMigrationStateApplied(
        LEGACY_AUTHORIZATION_RETIREMENT_KEY,
        connection
      );
      assertRoleCanDeactivateOrDelete(role, { legacyAuthorizationRetired });

      const assignedUsers = await repository.getRoleAssignedUsers(safeRoleId, connection);
      const assignedUserRoleStates = new Map();
      for (const assignedUser of assignedUsers) {
        assignedUserRoleStates.set(
          assignedUser.user_id,
          userRoleSnapshot(assignedUser, await repository.getUserRoles(assignedUser.user_id, connection))
        );
      }
      if (assignedUsers.length > 0) {
        requirePermission(actorPermissions, 'roles.assign');
        if (safeReplacementRoleIds.length === 0 && !removeAssignments) {
          throw policyError(
            'ROLE_STILL_ASSIGNED',
            'Role is assigned to users. Supply replacement roles or explicitly remove its assignments before deletion.'
          );
        }
      }

      let replacementRoles = [];
      if (safeReplacementRoleIds.length > 0) {
        replacementRoles = await repository.getRolesByIds(safeReplacementRoleIds, connection, { forUpdate: true });
        if (replacementRoles.length !== safeReplacementRoleIds.length || replacementRoles.some((candidate) => !candidate.is_active)) {
          throw policyError('INVALID_REPLACEMENT_ROLE', 'Every replacement role must exist and be active.');
        }
        if (replacementRoles.some((candidate) => candidate.system_key === SUPER_ADMIN_SYSTEM_KEY)) {
          requirePermission(actorPermissions, 'security.super_admin.manage');
        }
        await repository.addRolesToUsers(
          assignedUsers.map((user) => user.user_id),
          safeReplacementRoleIds,
          connection
        );
      }

      const permissionKeys = await repository.getRolePermissionKeys(safeRoleId, connection);
      const before = {
        ...roleSnapshot(role, permissionKeys),
        assignedUserIds: assignedUsers.map((user) => user.user_id),
        replacementRoleIds: safeReplacementRoleIds,
        assignmentsRemovedWithoutReplacement: assignedUsers.length > 0 && safeReplacementRoleIds.length === 0
      };
      await repository.deleteRoleAssignments(safeRoleId, connection);
      await repository.deleteRole(safeRoleId, connection);
      for (const assignedUser of assignedUsers) {
        const afterRoles = await repository.getUserRoles(assignedUser.user_id, connection);
        await repository.writeAuditEvent(connection, {
          actorUserId,
          eventType: 'user_roles_replaced',
          targetUserId: assignedUser.user_id,
          beforeState: assignedUserRoleStates.get(assignedUser.user_id),
          afterState: userRoleSnapshot(assignedUser, afterRoles)
        });
      }
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'role_deleted',
        targetRoleId: safeRoleId,
        targetRoleNameSnapshot: role.name,
        beforeState: before,
        afterState: null
      });
      return { deletedRoleId: safeRoleId, assignedUserCount: assignedUsers.length, replacementRoleIds: safeReplacementRoleIds };
    });
  }

  async function setUserRoles({ actorUserId, actorPermissions, userId, roleIds }) {
    requirePermission(actorPermissions, 'roles.assign');
    const safeUserId = normalizePositiveInteger(userId, 'User ID');
    const safeRoleIds = normalizeRoleIds(roleIds);

    return repository.withTransaction(async (connection) => {
      const user = await repository.getUserById(safeUserId, connection, { forUpdate: true });
      if (!user) throw policyError('USER_NOT_FOUND', 'User was not found.');
      const beforeRoles = await repository.getUserRoles(safeUserId, connection);
      const requestedRoles = await repository.getRolesByIds(safeRoleIds, connection, { forUpdate: true });
      if (requestedRoles.length !== safeRoleIds.length || requestedRoles.some((role) => !role.is_active)) {
        throw policyError('INVALID_ROLE_ASSIGNMENT', 'Every assigned role must exist and be active.');
      }

      const beforeHasSuperAdmin = beforeRoles.some((role) => isSuperAdminRole(role));
      const afterHasSuperAdmin = requestedRoles.some((role) => isSuperAdminRole(role));
      if (beforeHasSuperAdmin !== afterHasSuperAdmin) {
        requirePermission(actorPermissions, 'security.super_admin.manage');
      }
      if (beforeHasSuperAdmin && !afterHasSuperAdmin && user.is_active) {
        const activeSuperAdminCount = await repository.countActiveSuperAdminUsers(connection);
        if (activeSuperAdminCount <= 1) {
          throw policyError('LAST_SUPER_ADMIN', 'At least one active user must retain the permanent Super Admin role.');
        }
      }

      await repository.replaceUserRoles({ userId: safeUserId, roleIds: safeRoleIds }, connection);
      const before = userRoleSnapshot(user, beforeRoles);
      const after = userRoleSnapshot(user, requestedRoles);
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'user_roles_replaced',
        targetUserId: safeUserId,
        beforeState: before,
        afterState: after
      });
      return after;
    });
  }

  async function setUserPermissionOverride({ actorUserId, actorPermissions, userId, permissionKey, effect }) {
    requirePermission(actorPermissions, 'user_permissions.manage');
    const safeUserId = normalizePositiveInteger(userId, 'User ID');
    const safePermissionKey = normalizePermissionKeys([permissionKey])[0];
    const safeEffect = normalizeOverrideEffect(effect);
    if (safePermissionKey === 'security.super_admin.manage') {
      requirePermission(actorPermissions, 'security.super_admin.manage');
    }

    return repository.withTransaction(async (connection) => {
      const user = await repository.getUserById(safeUserId, connection, { forUpdate: true });
      if (!user) throw policyError('USER_NOT_FOUND', 'User was not found.');
      const roles = await repository.getUserRoles(safeUserId, connection);
      if (roles.some((role) => isSuperAdminRole(role)) && !isUserOnlyPermissionKey(safePermissionKey)) {
        throw policyError(
          'SUPER_ADMIN_OVERRIDE_PROTECTED',
          'Authority permission overrides are not permitted for a user assigned the permanent Super Admin role.'
        );
      }
      await repository.assertPermissionKeysExist([safePermissionKey], connection);
      const before = await repository.getUserPermissionOverride(safeUserId, safePermissionKey, connection);
      if (safeEffect === null) {
        await repository.removeUserPermissionOverride({ userId: safeUserId, permissionKey: safePermissionKey }, connection);
      } else {
        await repository.setUserPermissionOverride({
          userId: safeUserId,
          permissionKey: safePermissionKey,
          effect: safeEffect,
          actorUserId
        }, connection);
      }
      const after = safeEffect === null ? null : { permission_key: safePermissionKey, effect: safeEffect };
      await repository.writeAuditEvent(connection, {
        actorUserId,
        eventType: safeEffect === null ? 'user_permission_override_removed' : 'user_permission_override_set',
        targetUserId: safeUserId,
        permissionKeySnapshot: safePermissionKey,
        beforeState: before,
        afterState: after
      });
      return after;
    });
  }

  async function replaceUserPermissionOverrides({ actorUserId, actorPermissions, userId, overrides }) {
    requirePermission(actorPermissions, 'user_permissions.manage');
    const safeUserId = normalizePositiveInteger(userId, 'User ID');
    const safeEntries = normalizeOverrideEntries(overrides);

    return repository.withTransaction(async (connection) => {
      const user = await repository.getUserById(safeUserId, connection, { forUpdate: true });
      if (!user) throw policyError('USER_NOT_FOUND', 'User was not found.');
      const roles = await repository.getUserRoles(safeUserId, connection);
      const isSuperAdminUser = roles.some((role) => isSuperAdminRole(role));
      const entriesToApply = isSuperAdminUser
        ? safeEntries.filter((entry) => isUserOnlyPermissionKey(entry.permissionKey))
        : safeEntries;

      const submittedKeys = entriesToApply.map((entry) => entry.permissionKey);
      await repository.assertPermissionKeysExist(submittedKeys, connection);
      const existingOverrides = await repository.getUserPermissionOverrides(safeUserId, connection);
      const existingByKey = new Map(existingOverrides.map((override) => [override.permission_key, override.effect]));
      const changed = [];

      for (const entry of entriesToApply) {
        const beforeEffect = existingByKey.get(entry.permissionKey) || null;
        const afterEffect = entry.effect;
        if (beforeEffect === afterEffect) continue;

        if (entry.permissionKey === 'security.super_admin.manage') {
          requirePermission(actorPermissions, 'security.super_admin.manage');
        }

        if (afterEffect === null) {
          await repository.removeUserPermissionOverride({
            userId: safeUserId,
            permissionKey: entry.permissionKey
          }, connection);
        } else {
          await repository.setUserPermissionOverride({
            userId: safeUserId,
            permissionKey: entry.permissionKey,
            effect: afterEffect,
            actorUserId
          }, connection);
        }

        const before = beforeEffect === null ? null : {
          permission_key: entry.permissionKey,
          effect: beforeEffect
        };
        const after = afterEffect === null ? null : {
          permission_key: entry.permissionKey,
          effect: afterEffect
        };
        await repository.writeAuditEvent(connection, {
          actorUserId,
          eventType: afterEffect === null ? 'user_permission_override_removed' : 'user_permission_override_set',
          targetUserId: safeUserId,
          permissionKeySnapshot: entry.permissionKey,
          beforeState: before,
          afterState: after
        });
        changed.push({ permissionKey: entry.permissionKey, beforeEffect, afterEffect });
      }

      const activeOverrides = await repository.getUserPermissionOverrides(safeUserId, connection);
      return { userId: safeUserId, changed, overrides: activeOverrides };
    });
  }

  async function getUserAccessProfile({ actorPermissions, userId }) {
    requirePermissions(actorPermissions, ['users.view', 'roles.view']);
    const safeUserId = normalizePositiveInteger(userId, 'User ID');
    const user = await repository.getUserById(safeUserId);
    if (!user) throw policyError('USER_NOT_FOUND', 'User was not found.');
    const [roles, overrides] = await Promise.all([
      repository.getUserRoles(safeUserId),
      repository.getUserPermissionOverrides(safeUserId)
    ]);
    return { user, roles, overrides };
  }

  async function getUserPermissionAdministrationState({ actorPermissions, userId }) {
    requirePermissions(actorPermissions, ['users.view', 'roles.view']);
    const safeUserId = normalizePositiveInteger(userId, 'User ID');
    const user = await repository.getUserById(safeUserId);
    if (!user) throw policyError('USER_NOT_FOUND', 'User was not found.');

    const [roles, overrides, catalog] = await Promise.all([
      repository.getUserRoles(safeUserId),
      repository.getUserPermissionOverrides(safeUserId),
      repository.listPermissionCatalog()
    ]);

    const rolePermissionEntries = await Promise.all(roles.map(async (role) => ({
      role,
      permissionKeys: (await repository.getRolePermissionKeys(role.role_id))
        .filter((permissionKey) => !isUserOnlyPermissionKey(permissionKey))
    })));
    const rolePermissionKeys = [...new Set(rolePermissionEntries.flatMap((entry) => entry.permissionKeys))];
    const effectivePermissions = resolveEffectivePermissions({
      rolePermissionKeys,
      userOverrides: overrides
    });
    const overrideByKey = new Map(overrides.map((override) => [override.permission_key, override.effect]));
    const roleSourcesByKey = new Map();

    for (const entry of rolePermissionEntries) {
      for (const permissionKey of entry.permissionKeys) {
        if (!roleSourcesByKey.has(permissionKey)) roleSourcesByKey.set(permissionKey, []);
        roleSourcesByKey.get(permissionKey).push({
          roleId: Number(entry.role.role_id),
          name: entry.role.name
        });
      }
    }

    const permissions = catalog.map((permission) => {
      const roleSources = roleSourcesByKey.get(permission.permission_key) || [];
      const overrideEffect = overrideByKey.get(permission.permission_key) || null;
      return {
        ...permission,
        roleSources,
        inheritedAllowed: roleSources.length > 0,
        overrideEffect,
        effectiveAllowed: effectivePermissions.has(permission.permission_key)
      };
    });

    return {
      user,
      roles,
      overrides,
      permissions,
      effectivePermissions,
      isSuperAdmin: roles.some((role) => isSuperAdminRole(role)),
      canManageOverrides: hasPermission(actorPermissions, 'user_permissions.manage')
    };
  }

  async function listPermissionAuditEvents({ actorPermissions, page = 1, pageSize = 50, eventType = null, search = '' } = {}) {
    requirePermission(actorPermissions, 'audit.permissions.view');
    return repository.listPermissionAuditEvents({ page, pageSize, eventType, search });
  }

  async function getPermissionAuditEvent({ actorPermissions, eventId }) {
    requirePermission(actorPermissions, 'audit.permissions.view');
    const safeEventId = normalizePositiveInteger(eventId, 'Permission audit event ID');
    const event = await repository.getPermissionAuditEventById(safeEventId);
    if (!event) throw policyError('AUDIT_EVENT_NOT_FOUND', 'Permission audit event was not found.');
    return event;
  }

  return {
    listRoles,
    listPermissionCatalog,
    createRole,
    updateRole,
    setRolePermissions,
    duplicateRole,
    deleteRole,
    setUserRoles,
    setUserPermissionOverride,
    replaceUserPermissionOverrides,
    getUserAccessProfile,
    getUserPermissionAdministrationState,
    listPermissionAuditEvents,
    getPermissionAuditEvent
  };
}

let defaultService = null;

function getDefaultService() {
  if (!defaultService) defaultService = createPermissionManagementService();
  return defaultService;
}

const exported = {
  roleSnapshot,
  userRoleSnapshot,
  normalizeOverrideEntries,
  createPermissionManagementService
};

for (const methodName of [
  'listRoles',
  'listPermissionCatalog',
  'createRole',
  'updateRole',
  'setRolePermissions',
  'duplicateRole',
  'deleteRole',
  'setUserRoles',
  'setUserPermissionOverride',
  'replaceUserPermissionOverrides',
  'getUserAccessProfile',
  'getUserPermissionAdministrationState',
  'listPermissionAuditEvents',
  'getPermissionAuditEvent'
]) {
  exported[methodName] = (...args) => getDefaultService()[methodName](...args);
}

module.exports = exported;
