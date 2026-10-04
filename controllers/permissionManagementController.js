'use strict';

const permissionManagementService = require('../services/permissionManagementService');
const {
  LEGACY_COMPATIBILITY_ROLE_CODES,
  isSuperAdminRole,
  isUserOnlyPermissionKey
} = require('../services/permissionManagementPolicy');
const { isHtmxRequest } = require('../utils/htmxRequest');

const POLICY_ERROR_CODES = new Set([
  'PERMISSION_REQUIRED',
  'ROLE_NOT_FOUND',
  'ROLE_NAME_REQUIRED',
  'ROLE_NAME_TOO_LONG',
  'ROLE_DESCRIPTION_TOO_LONG',
  'UNKNOWN_PERMISSION',
  'USER_ONLY_PERMISSION',
  'SUPER_ADMIN_ROLE_PROTECTED',
  'SUPER_ADMIN_PERMISSIONS_PROTECTED',
  'LEGACY_ROLE_GATE_ACTIVE',
  'ROLE_STILL_ASSIGNED',
  'INVALID_REPLACEMENT_ROLE',
  'INVALID_IDENTIFIER',
  'USER_NOT_FOUND',
  'INVALID_OVERRIDE_EFFECT',
  'SUPER_ADMIN_OVERRIDE_PROTECTED',
  'AUDIT_EVENT_NOT_FOUND'
]);

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || String(value).trim() === '') return [];
  return [value];
}

function parseRoleId(value) {
  const roleId = Number(value);
  return Number.isInteger(roleId) && roleId > 0 ? roleId : null;
}

function parseUserId(value) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function parseAuditEventId(value) {
  const eventId = Number(value);
  return Number.isInteger(eventId) && eventId > 0 ? eventId : null;
}

const PERMISSION_AUDIT_EVENT_LABELS = Object.freeze({
  role_created: 'Role Created',
  role_updated: 'Role Updated',
  role_permissions_replaced: 'Role Permissions Changed',
  role_duplicated: 'Role Duplicated',
  role_deleted: 'Role Deleted',
  user_roles_replaced: 'User Roles Changed',
  user_permission_override_set: 'User Permission Override Changed',
  user_permission_override_removed: 'User Permission Override Removed'
});

function getPermissionAuditEventLabel(eventType) {
  const normalized = String(eventType || '').trim();
  if (PERMISSION_AUDIT_EVENT_LABELS[normalized]) return PERMISSION_AUDIT_EVENT_LABELS[normalized];
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Permission Change';
}

function decoratePermissionAuditEvent(event) {
  const targetUserName = [event.target_user_first_name, event.target_user_last_name].filter(Boolean).join(' ').trim();
  const targetLabel = event.target_role_name_snapshot
    ? `Role: ${event.target_role_name_snapshot}`
    : event.target_user_id
      ? `User: ${targetUserName || event.target_user_email || `#${event.target_user_id}`}`
      : event.permission_key_snapshot
        ? `Permission: ${event.permission_key_snapshot}`
        : 'Security configuration';

  return {
    ...event,
    eventLabel: getPermissionAuditEventLabel(event.event_type),
    targetLabel,
    actorLabel: event.actor_name_snapshot || (event.actor_user_id ? `User #${event.actor_user_id}` : 'System')
  };
}

function normalizeOverrideEntriesFromBody(body = {}) {
  const raw = body && body.overrideEffects;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw).map(([permissionKey, effect]) => ({ permissionKey, effect }));
}

function redirectHtmxAware(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.status(204).send('');
  }
  return res.redirect(url);
}

function buildRolesUrl(roleId = null, params = {}) {
  const query = new URLSearchParams();
  if (roleId) query.set('roleId', String(roleId));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return `/management/roles-permissions${suffix ? `?${suffix}` : ''}`;
}

function getSafePolicyMessage(error, fallback = 'The requested role or permission change could not be completed.') {
  return error && POLICY_ERROR_CODES.has(error.code) && error.message ? error.message : fallback;
}

function groupPermissions(catalog) {
  const groups = [];
  const byName = new Map();
  for (const permission of catalog) {
    const groupName = permission.permission_group || 'Other';
    let group = byName.get(groupName);
    if (!group) {
      group = { name: groupName, permissions: [] };
      byName.set(groupName, group);
      groups.push(group);
    }
    group.permissions.push(permission);
  }
  return groups;
}

function isTransitionallyProtectedRole(role) {
  if (!role) return false;
  if (role.transitionallyProtected !== undefined) return Boolean(role.transitionallyProtected);
  return Boolean(!isSuperAdminRole(role) && LEGACY_COMPATIBILITY_ROLE_CODES.has(String(role.code || '')));
}

function getNoticeMessages(query = {}) {
  const notices = {
    role_created: 'Role created. Configure its default permissions below.',
    role_updated: 'Role details saved.',
    permissions_updated: 'Default permissions saved.',
    role_duplicated: 'Role duplicated with an independent copy of its default permissions.',
    role_deleted: 'Role deleted.'
  };
  const errors = {
    legacy_role_gate_active: 'This compatibility role cannot be deactivated or deleted until its remaining legacy role gates are retired.',
    super_admin_role_protected: 'The permanent Super Admin role cannot be deactivated or deleted.',
    permission_required: 'Your current effective permissions do not allow that action.',
    role_not_found: 'The selected role could not be found.',
    role_still_assigned: 'That role is still assigned to users. Choose replacement roles or explicitly remove its assignments.',
    invalid_replacement_role: 'One or more replacement roles are invalid or inactive.',
    invalid_role: 'The requested role change could not be completed.'
  };
  return {
    successMessage: notices[String(query.notice || '')] || '',
    errorMessage: errors[String(query.error || '')] || ''
  };
}

function policyErrorQuery(error) {
  const mapping = {
    LEGACY_ROLE_GATE_ACTIVE: 'legacy_role_gate_active',
    SUPER_ADMIN_ROLE_PROTECTED: 'super_admin_role_protected',
    PERMISSION_REQUIRED: 'permission_required',
    ROLE_NOT_FOUND: 'role_not_found',
    ROLE_STILL_ASSIGNED: 'role_still_assigned',
    INVALID_REPLACEMENT_ROLE: 'invalid_replacement_role'
  };
  return mapping[error && error.code] || 'invalid_role';
}

async function loadPageData(req) {
  const actorPermissions = req.currentPermissions;
  const [roles, catalog] = await Promise.all([
    permissionManagementService.listRoles({ actorPermissions }),
    permissionManagementService.listPermissionCatalog({ actorPermissions })
  ]);
  const roleAssignableCatalog = catalog.filter((permission) => !isUserOnlyPermissionKey(permission.permission_key));
  return { roles, catalog, permissionGroups: groupPermissions(roleAssignableCatalog) };
}

async function loadRoleManageData(req, roleId) {
  const { roles, permissionGroups } = await loadPageData(req);
  const role = roles.find((candidate) => Number(candidate.role_id) === Number(roleId));
  if (!role) {
    const error = new Error('Role was not found.');
    error.code = 'ROLE_NOT_FOUND';
    throw error;
  }
  return {
    role,
    permissionGroups,
    selectedPermissionKeys: new Set(role.permissionKeys || []),
    transitionallyProtected: isTransitionallyProtectedRole(role)
  };
}

async function renderRoleManageModalContent(req, res, roleId, { noticeMessage = '', errorMessage = '' } = {}) {
  const data = await loadRoleManageData(req, roleId);
  return res.render('fragments/permission-role-manage-modal', {
    ...data,
    noticeMessage,
    errorMessage
  });
}

async function renderRolesPermissionsPage(req, res, next) {
  try {
    const { roles } = await loadPageData(req);
    const messages = getNoticeMessages(req.query);
    return res.render('pages/management-roles-permissions', {
      pageTitle: 'Roles & Permissions',
      currentNav: 'management-roles-permissions',
      roles,
      ...messages
    });
  } catch (error) {
    if (error && error.code === 'PERMISSION_REQUIRED') {
      return res.status(403).render('pages/error', {
        pageTitle: 'Access Denied',
        message: 'You do not have permission to view role and permission administration.',
        error: null
      });
    }
    return next(error);
  }
}


async function renderRoleManageModal(req, res, next) {
  try {
    const roleId = parseRoleId(req.params.roleId);
    if (!roleId) {
      return res.status(400).render('fragments/permission-role-manage-modal', {
        role: null,
        permissionGroups: [],
        selectedPermissionKeys: new Set(),
        transitionallyProtected: false,
        noticeMessage: '',
        errorMessage: 'The selected role ID is invalid.'
      });
    }
    return await renderRoleManageModalContent(req, res, roleId);
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      return res.status(error.code === 'ROLE_NOT_FOUND' ? 404 : 403).render('fragments/permission-role-manage-modal', {
        role: null,
        permissionGroups: [],
        selectedPermissionKeys: new Set(),
        transitionallyProtected: false,
        noticeMessage: '',
        errorMessage: getSafePolicyMessage(error)
      });
    }
    return next(error);
  }
}

async function renderCreateRoleModal(req, res, next) {
  try {
    if (!(req.currentPermissions instanceof Set) || !req.currentPermissions.has('roles.create')) {
      return res.status(403).render('fragments/permission-role-create-modal', {
        errorMessages: ['You do not have permission to create roles.'],
        formData: { name: '', description: '' }
      });
    }
    return res.render('fragments/permission-role-create-modal', {
      errorMessages: [],
      formData: { name: '', description: '' }
    });
  } catch (error) {
    return next(error);
  }
}

async function createRole(req, res, next) {
  const formData = {
    name: String(req.body.name || ''),
    description: String(req.body.description || '')
  };
  try {
    const role = await permissionManagementService.createRole({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      name: formData.name,
      description: formData.description,
      permissionKeys: []
    });
    return redirectHtmxAware(req, res, buildRolesUrl(role.role_id, { notice: 'role_created' }));
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      return res.status(200).render('fragments/permission-role-create-modal', {
        errorMessages: [getSafePolicyMessage(error)],
        formData
      });
    }
    return next(error);
  }
}

async function updateRoleDetails(req, res, next) {
  const roleId = parseRoleId(req.params.roleId);
  try {
    if (!roleId) throw Object.assign(new Error('Role was not found.'), { code: 'ROLE_NOT_FOUND' });
    await permissionManagementService.updateRole({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      roleId,
      name: req.body.name,
      description: req.body.description,
      isActive: req.body.isActive === '1'
    });
    if (isHtmxRequest(req)) {
      return await renderRoleManageModalContent(req, res, roleId, { noticeMessage: 'Role details saved.' });
    }
    return res.redirect(buildRolesUrl(null, { notice: 'role_updated' }));
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      if (isHtmxRequest(req) && roleId) {
        try {
          return await renderRoleManageModalContent(req, res, roleId, { errorMessage: getSafePolicyMessage(error) });
        } catch (loadError) {
          if (!(loadError && loadError.code === 'ROLE_NOT_FOUND')) return next(loadError);
        }
      }
      return redirectHtmxAware(req, res, buildRolesUrl(null, { error: policyErrorQuery(error) }));
    }
    return next(error);
  }
}

async function updateRolePermissions(req, res, next) {
  const roleId = parseRoleId(req.params.roleId);
  try {
    if (!roleId) throw Object.assign(new Error('Role was not found.'), { code: 'ROLE_NOT_FOUND' });
    await permissionManagementService.setRolePermissions({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      roleId,
      permissionKeys: toArray(req.body.permissionKeys)
    });
    if (isHtmxRequest(req)) {
      return await renderRoleManageModalContent(req, res, roleId, { noticeMessage: 'Default permissions saved.' });
    }
    return res.redirect(buildRolesUrl(null, { notice: 'permissions_updated' }));
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      if (isHtmxRequest(req) && roleId) {
        try {
          return await renderRoleManageModalContent(req, res, roleId, { errorMessage: getSafePolicyMessage(error) });
        } catch (loadError) {
          if (!(loadError && loadError.code === 'ROLE_NOT_FOUND')) return next(loadError);
        }
      }
      return redirectHtmxAware(req, res, buildRolesUrl(null, { error: policyErrorQuery(error) }));
    }
    return next(error);
  }
}

async function loadUserPermissionData(req, userId) {
  const state = await permissionManagementService.getUserPermissionAdministrationState({
    actorPermissions: req.currentPermissions,
    userId
  });
  return {
    ...state,
    permissionGroups: groupPermissions(state.permissions)
  };
}

async function renderUserPermissionModalContent(req, res, userId, { noticeMessage = '', errorMessage = '' } = {}) {
  const data = await loadUserPermissionData(req, userId);
  return res.render('fragments/permission-user-manage-modal', {
    ...data,
    noticeMessage,
    errorMessage
  });
}

async function renderUserPermissionModal(req, res, next) {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      return res.status(400).render('fragments/permission-user-manage-modal', {
        user: null,
        roles: [],
        overrides: [],
        permissions: [],
        permissionGroups: [],
        effectivePermissions: new Set(),
        isSuperAdmin: false,
        canManageOverrides: false,
        noticeMessage: '',
        errorMessage: 'The selected user ID is invalid.'
      });
    }
    return await renderUserPermissionModalContent(req, res, userId);
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      return res.status(error.code === 'USER_NOT_FOUND' ? 404 : 403).render('fragments/permission-user-manage-modal', {
        user: null,
        roles: [],
        overrides: [],
        permissions: [],
        permissionGroups: [],
        effectivePermissions: new Set(),
        isSuperAdmin: false,
        canManageOverrides: false,
        noticeMessage: '',
        errorMessage: getSafePolicyMessage(error, 'The selected user permission profile could not be loaded.')
      });
    }
    return next(error);
  }
}

async function updateUserPermissionOverrides(req, res, next) {
  const userId = parseUserId(req.params.userId);
  try {
    if (!userId) throw Object.assign(new Error('User was not found.'), { code: 'USER_NOT_FOUND' });
    const result = await permissionManagementService.replaceUserPermissionOverrides({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      userId,
      overrides: normalizeOverrideEntriesFromBody(req.body)
    });
    const noticeMessage = result.changed.length === 0
      ? 'No user permission override changes were needed.'
      : `${result.changed.length} user permission override${result.changed.length === 1 ? '' : 's'} saved.`;
    if (isHtmxRequest(req)) {
      return await renderUserPermissionModalContent(req, res, userId, { noticeMessage });
    }
    return res.redirect('/management/users');
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      if (isHtmxRequest(req) && userId) {
        try {
          return await renderUserPermissionModalContent(req, res, userId, {
            errorMessage: getSafePolicyMessage(error, 'The user permission overrides could not be saved.')
          });
        } catch (loadError) {
          if (!(loadError && loadError.code === 'USER_NOT_FOUND')) return next(loadError);
        }
      }
      return res.status(error.code === 'USER_NOT_FOUND' ? 404 : 403).render('pages/error', {
        pageTitle: 'Permission Change Failed',
        message: getSafePolicyMessage(error, 'The user permission overrides could not be saved.'),
        error: null
      });
    }
    return next(error);
  }
}

async function renderDuplicateRoleModal(req, res, next) {
  try {
    const roleId = parseRoleId(req.params.roleId);
    const roles = await permissionManagementService.listRoles({ actorPermissions: req.currentPermissions });
    const role = roles.find((candidate) => Number(candidate.role_id) === roleId);
    if (!role) return res.status(404).render('pages/error', { pageTitle: 'Role Not Found', message: 'The selected role could not be found.', error: null });
    return res.render('fragments/permission-role-duplicate-modal', {
      role,
      errorMessages: [],
      formData: { name: `${role.name} Copy` }
    });
  } catch (error) {
    return next(error);
  }
}

async function duplicateRole(req, res, next) {
  const roleId = parseRoleId(req.params.roleId);
  const formData = { name: String(req.body.name || '') };
  try {
    const role = await permissionManagementService.duplicateRole({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      sourceRoleId: roleId,
      name: formData.name
    });
    return redirectHtmxAware(req, res, buildRolesUrl(role.role_id, { notice: 'role_duplicated' }));
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      const roles = await permissionManagementService.listRoles({ actorPermissions: req.currentPermissions });
      const role = roles.find((candidate) => Number(candidate.role_id) === roleId) || { role_id: roleId, name: 'Selected Role' };
      return res.status(200).render('fragments/permission-role-duplicate-modal', {
        role,
        errorMessages: [getSafePolicyMessage(error)],
        formData
      });
    }
    return next(error);
  }
}

async function renderPermissionAuditPage(req, res, next) {
  try {
    const page = Number.isInteger(Number(req.query.page)) && Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const eventType = Object.prototype.hasOwnProperty.call(PERMISSION_AUDIT_EVENT_LABELS, String(req.query.eventType || '').trim())
      ? String(req.query.eventType).trim()
      : '';
    const search = String(req.query.search || '').trim().slice(0, 150);
    const result = await permissionManagementService.listPermissionAuditEvents({
      actorPermissions: req.currentPermissions,
      page,
      pageSize: 50,
      eventType,
      search
    });

    return res.render('pages/management-permission-audit', {
      pageTitle: 'Permission Audit',
      currentNav: 'management-permission-audit',
      events: result.events.map(decoratePermissionAuditEvent),
      page: result.page,
      hasNext: result.hasNext,
      eventType,
      search,
      eventTypeLabels: PERMISSION_AUDIT_EVENT_LABELS
    });
  } catch (error) {
    if (error && error.code === 'PERMISSION_REQUIRED') {
      return res.status(403).render('pages/error', {
        pageTitle: 'Access Denied',
        message: 'You do not have permission to view the permission audit trail.',
        error: null
      });
    }
    return next(error);
  }
}

async function renderPermissionAuditEventModal(req, res, next) {
  try {
    const eventId = parseAuditEventId(req.params.eventId);
    if (!eventId) {
      return res.status(400).render('pages/error', {
        pageTitle: 'Invalid Audit Event',
        message: 'The selected permission audit event ID is invalid.',
        error: null
      });
    }
    const event = await permissionManagementService.getPermissionAuditEvent({
      actorPermissions: req.currentPermissions,
      eventId
    });
    return res.render('fragments/permission-audit-event-modal', {
      event: decoratePermissionAuditEvent(event)
    });
  } catch (error) {
    if (error && error.code === 'PERMISSION_REQUIRED') {
      return res.status(403).render('pages/error', {
        pageTitle: 'Access Denied',
        message: 'You do not have permission to view the permission audit trail.',
        error: null
      });
    }
    if (error && error.code === 'AUDIT_EVENT_NOT_FOUND') {
      return res.status(404).render('pages/error', {
        pageTitle: 'Audit Event Not Found',
        message: 'The selected permission audit event could not be found.',
        error: null
      });
    }
    return next(error);
  }
}

async function renderDeleteRoleModal(req, res, next) {
  try {
    const roleId = parseRoleId(req.params.roleId);
    const roles = await permissionManagementService.listRoles({ actorPermissions: req.currentPermissions });
    const role = roles.find((candidate) => Number(candidate.role_id) === roleId);
    if (!role) return res.status(404).render('pages/error', { pageTitle: 'Role Not Found', message: 'The selected role could not be found.', error: null });
    return res.render('fragments/permission-role-delete-modal', {
      role,
      replacementRoles: roles.filter((candidate) => candidate.is_active && Number(candidate.role_id) !== roleId && (!isSuperAdminRole(candidate) || req.currentPermissions.has('security.super_admin.manage'))),
      transitionallyProtected: isTransitionallyProtectedRole(role),
      permanentRole: isSuperAdminRole(role),
      errorMessages: [],
      formData: { replacementRoleIds: [], removeAssignments: false }
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteRole(req, res, next) {
  const roleId = parseRoleId(req.params.roleId);
  const formData = {
    replacementRoleIds: toArray(req.body.replacementRoleIds),
    removeAssignments: req.body.removeAssignments === '1'
  };
  try {
    await permissionManagementService.deleteRole({
      actorUserId: req.currentUser.user_id,
      actorPermissions: req.currentPermissions,
      roleId,
      replacementRoleIds: formData.replacementRoleIds,
      removeAssignments: formData.removeAssignments
    });
    return redirectHtmxAware(req, res, buildRolesUrl(null, { notice: 'role_deleted' }));
  } catch (error) {
    if (POLICY_ERROR_CODES.has(error && error.code)) {
      const roles = await permissionManagementService.listRoles({ actorPermissions: req.currentPermissions });
      const role = roles.find((candidate) => Number(candidate.role_id) === roleId) || { role_id: roleId, name: 'Selected Role', assignment_count: 0 };
      return res.status(200).render('fragments/permission-role-delete-modal', {
        role,
        replacementRoles: roles.filter((candidate) => candidate.is_active && Number(candidate.role_id) !== roleId && (!isSuperAdminRole(candidate) || req.currentPermissions.has('security.super_admin.manage'))),
        transitionallyProtected: isTransitionallyProtectedRole(role),
        permanentRole: isSuperAdminRole(role),
        errorMessages: [getSafePolicyMessage(error)],
        formData
      });
    }
    return next(error);
  }
}

module.exports = {
  renderRolesPermissionsPage,
  renderRoleManageModal,
  renderCreateRoleModal,
  createRole,
  updateRoleDetails,
  updateRolePermissions,
  renderUserPermissionModal,
  updateUserPermissionOverrides,
  renderDuplicateRoleModal,
  duplicateRole,
  renderDeleteRoleModal,
  deleteRole,
  renderPermissionAuditPage,
  renderPermissionAuditEventModal,
  groupPermissions,
  isTransitionallyProtectedRole,
  decoratePermissionAuditEvent,
  getPermissionAuditEventLabel
};
