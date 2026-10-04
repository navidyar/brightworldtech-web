const crypto = require('crypto');
const argon2 = require('argon2');
const authModel = require('../models/authModel');
const managementModel = require('../models/managementModel');
const { normalizeUserListSort } = require('../utils/managementUserSort');
const managementUserRoleEditPolicy = require('../services/managementUserRoleEditPolicy');
const permissionManagementService = require('../services/permissionManagementService');
const permissionManagementModel = require('../models/permissionManagementModel');
const { PROTECTED_ADMIN_USER_ID } = require('../config/protectedAdmin');
const userManagementAudit = require('../models/userManagementAuditModel');
const { buildUsernameStem } = require('../services/userUsernamePolicy');
const { formatDateKey, getDayRangeUtc } = require('../utils/timeZone');
const { isHtmxRequest } = require('../utils/htmxRequest');
const { validateToolPin } = require('../services/toolPinPolicy');
const {
  DEFAULT_PASSWORD_LINK_EXPIRY_HOURS,
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  parsePasswordLinkExpiryHours
} = require('../services/passwordLinkExpiryPolicy');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'https://bwtdallas.com').replace(/\/$/, '');
}

function redirectAfterHtmxAwareAction(req, res, redirectUrl) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', redirectUrl);
    return res.status(204).send('');
  }

  return res.redirect(redirectUrl);
}

function normalizeRoleCodes(roleCodes) {
  const submittedRoleCodes = Array.isArray(roleCodes)
    ? roleCodes.map((roleCode) => String(roleCode).trim()).filter(Boolean)
    : [String(roleCodes || '').trim()].filter(Boolean);

  return [...new Set(submittedRoleCodes)];
}

function canAssignSuperAdminRole(req) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has('security.super_admin.manage');
}

function canAssignRoles(req) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has('roles.assign');
}

function canManageUserPermissionOverrides(req) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has('user_permissions.manage');
}

function canManageToolPins(req) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has('users.tool_pin.manage');
}

function normalizeLoginInactivityMode(value) {
  const mode = String(value || 'inherit').trim().toLowerCase();
  return ['inherit', 'allow', 'deny'].includes(mode) ? mode : null;
}

function validateOptionalToolPin(pin, confirmPin) {
  const safePin = String(pin || '').trim();
  const safeConfirm = String(confirmPin || '').trim();
  if (!safePin && !safeConfirm) return [];
  return validateToolPin(safePin, safeConfirm);
}

function getAssignableRolesForCurrentUser(roles, req, { includeInactiveCodes = [] } = {}) {
  const preservedCodes = new Set(normalizeRoleCodes(includeInactiveCodes));
  const canManageSuperAdmin = canAssignSuperAdminRole(req);
  const safeRoles = Array.isArray(roles)
    ? roles.filter((role) => role && (role.is_active || preservedCodes.has(role.code)))
    : [];

  return safeRoles.flatMap((role) => {
    if (role.system_key !== 'super_admin') return [{ ...role, assignmentLocked: false }];
    if (canManageSuperAdmin) return [{ ...role, assignmentLocked: false }];
    if (preservedCodes.has(role.code)) return [{ ...role, assignmentLocked: true }];
    return [];
  });
}

function filterAssignableRoleCodes(roleCodes, allowedRoleCodes) {
  const allowed = allowedRoleCodes instanceof Set ? allowedRoleCodes : new Set();
  return normalizeRoleCodes(roleCodes).filter((roleCode) => allowed.has(roleCode));
}

async function listRoleAdministrationChoices(req, { includeInactiveCodes = [] } = {}) {
  if (!canAssignRoles(req)) return [];
  const roles = await permissionManagementModel.listRoles();
  return getAssignableRolesForCurrentUser(roles, req, { includeInactiveCodes });
}

async function listUserCreationRoleChoices(req) {
  if (!canAssignRoles(req)) return [];
  const roles = await permissionManagementModel.listRoles();
  return getAssignableRolesForCurrentUser(roles, req);
}

function normalizeReturnPath(returnPath) {
  return returnPath === 'inactive' ? 'inactive' : 'active';
}

function getUsersReturnUrl(returnPath, queryString = '') {
  const basePath = returnPath === 'inactive' ? '/management/users/inactive' : '/management/users';
  return queryString ? `${basePath}?${queryString}` : basePath;
}

const AUDIT_ACTION_LABELS = Object.freeze({
  user_created: 'User created',
  user_profile_updated: 'Profile updated',
  user_roles_updated: 'Roles updated',
  user_activated: 'User activated',
  user_deactivated: 'User deactivated',
  user_deleted: 'User deleted',
  password_setup_initiated: 'Password setup initiated',
  password_reset_initiated: 'Password reset initiated',
  user_tool_pin_updated: 'Tool PIN updated',
  user_tool_pin_removed: 'Tool PIN removed',
  user_role_change_blocked: 'Role change attempted',
  user_deactivation_blocked: 'Deactivation attempted',
  user_deletion_blocked: 'Deletion attempted',
  user_update_blocked: 'Update attempted',
  user_management_blocked: 'Account action attempted',
  password_link_blocked: 'Password link attempted'
});

const AUDIT_FIELD_LABELS = Object.freeze({
  first_name: 'First name', last_name: 'Last name', email: 'Email',
  personal_email: 'Personal email', phone: 'Phone', start_date: 'Start date',
  end_date: 'End date', roles: 'Roles', is_active: 'Active status'
});

async function renderUserHistoryPage(req, res, next) {
  try {
    const targetUserId = Number(req.query.userId) > 0 ? Number(req.query.userId) : null;
    const page = Number.isInteger(Number(req.query.page)) && Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const history = await userManagementAudit.listEvents({ targetUserId, page });
    return res.render(isHtmxRequest(req) ? 'fragments/management-user-history-modal' : 'pages/management-user-history', {
      pageTitle: 'Account History', currentNav: 'management-user-history',
      ...history, targetUserId, historyModal: isHtmxRequest(req),
      actionLabels: AUDIT_ACTION_LABELS, fieldLabels: AUDIT_FIELD_LABELS
    });
  } catch (error) {
    return next(error);
  }
}

function normalizeOptionalUserText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeOptionalUserEmail(value) {
  const normalized = authModel.normalizeEmail(value);
  return normalized || null;
}

function normalizeOptionalDate(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function isValidDateInput(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateUserForm({ firstName, lastName, email, personalEmail, phone, startDate, endDate, roleCodes, requireRole = true }) {
  const errors = [];

  if (!firstName || firstName.length < 2) {
    errors.push('First name is required.');
  }

  if (!lastName || lastName.length < 2) {
    errors.push('Last name is required.');
  }

  if (!email || !email.includes('@')) {
    errors.push('A valid work/login email address is required.');
  }

  if (personalEmail && !personalEmail.includes('@')) {
    errors.push('Personal Email must be a valid email address when provided.');
  }

  if (personalEmail && personalEmail.length > 255) {
    errors.push('Personal Email cannot exceed 255 characters.');
  }

  if (phone && phone.length > 50) {
    errors.push('Phone cannot exceed 50 characters.');
  }

  if (!isValidDateInput(startDate)) {
    errors.push('Start Date must be a valid date.');
  }

  if (!isValidDateInput(endDate)) {
    errors.push('End Date must be a valid date.');
  }

  if (startDate && endDate && isValidDateInput(startDate) && isValidDateInput(endDate) && endDate < startDate) {
    errors.push('End Date cannot be before Start Date.');
  }

  if (requireRole && roleCodes.length === 0) {
    errors.push('At least one role must be selected.');
  }

  return errors;
}

function getUserListMessages(query) {
  const successMessages = [];
  const errorMessages = [];

  if (query.created === '1') {
    successMessages.push('User created successfully. Copy the setup link before leaving the setup-link page.');
  }

  if (query.updated === '1') {
    successMessages.push('User information updated successfully.');
  }

  if (query.toolPinUpdated === '1') {
    successMessages.push('Tool PIN registered or reset successfully.');
  }

  if (query.toolPinRemoved === '1') {
    successMessages.push('Tool PIN removed successfully.');
  }

  if (query.deactivated === '1') {
    successMessages.push('User deactivated successfully. Their history remains linked to their completed work.');
  }

  if (query.reactivated === '1') {
    successMessages.push('User reactivated successfully. They can continue using the same account.');
  }

  if (query.deleted === '1') {
    successMessages.push('Pending setup user deleted successfully. No work history was removed because this account had never been activated.');
  }

  if (query.error === 'self_deactivate') {
    errorMessages.push('You cannot deactivate your own account while signed in.');
  }

  if (query.error === 'self_delete') {
    errorMessages.push('You cannot delete your own signed-in account.');
  }

  if (query.error === 'pending_delete_not_allowed') {
    errorMessages.push('Only users with Pending Setup status, no password, and no login history can be deleted. Deactivate users with work history instead.');
  }

  if (query.error === 'pending_user_has_links') {
    errorMessages.push('This pending setup user is already linked to application records, so they cannot be deleted. Deactivate them instead.');
  }

  if (query.error === 'inactive_setup_link') {
    errorMessages.push('Inactive users cannot receive setup or reset links. Reactivate the user first.');
  }

  if (query.error === 'not_found') {
    errorMessages.push('The selected user could not be found.');
  }

  return {
    successMessage: successMessages.length > 0 ? successMessages.join(' ') : null,
    errorMessages
  };
}

function getSafeUserId(req) {
  const userId = Number(req.params.userId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function createSetupLinkForUser(user, createdByUserId = null, requestedExpiryHours = DEFAULT_PASSWORD_LINK_EXPIRY_HOURS) {
  const expiresInHours = parsePasswordLinkExpiryHours(requestedExpiryHours);

  if (expiresInHours === null) {
    throw new Error(`Password setup/reset link expiration must be a whole number from ${MIN_PASSWORD_LINK_EXPIRY_HOURS} through ${MAX_PASSWORD_LINK_EXPIRY_HOURS} hours.`);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = addHours(new Date(), expiresInHours);

  const hasExistingPassword = user.has_password === true || Number(user.has_password) === 1;
  const linkTypeCode = hasExistingPassword ? 'password_reset' : 'initial_password_setup';

  await authModel.createPasswordLink({
    userId: user.user_id,
    linkTypeCode,
    tokenHash,
    expiresAt,
    createdByUserId
  });

  return {
    setupUrl: `${getBaseUrl()}/setup-password?token=${token}`,
    expiresAt,
    expiresInHours,
    linkTypeCode,
    isResetLink: linkTypeCode === 'password_reset',
    linkLabel: linkTypeCode === 'password_reset' ? 'Password Reset Link' : 'Initial Setup Link',
    actionLabel: linkTypeCode === 'password_reset' ? 'Reset Password' : 'Set Password'
  };
}

async function renderUsersPage(req, res, next) {
  try {
    const activeSort = normalizeUserListSort(req.query.sort);
    const users = await managementModel.listUsers({ activeOnly: true, sort: activeSort });
    const userCounts = await managementModel.countUsersByActiveStatus();
    const messages = getUserListMessages(req.query);

    res.render('pages/management-users', {
      pageTitle: 'Management',
      currentNav: 'management',
      users,
      userCounts,
      isInactiveView: false,
      activeSort,
      currentUserId: req.currentUser.user_id,
      protectedAdminUserId: PROTECTED_ADMIN_USER_ID,
      successMessage: messages.successMessage,
      errorMessages: messages.errorMessages
    });
  } catch (error) {
    next(error);
  }
}

async function renderInactiveUsersPage(req, res, next) {
  try {
    const activeSort = normalizeUserListSort(req.query.sort);
    const users = await managementModel.listUsers({ activeOnly: false, sort: activeSort });
    const userCounts = await managementModel.countUsersByActiveStatus();
    const messages = getUserListMessages(req.query);

    res.render('pages/management-users', {
      pageTitle: 'Inactive Users',
      currentNav: 'management',
      users,
      userCounts,
      isInactiveView: true,
      activeSort,
      currentUserId: req.currentUser.user_id,
      protectedAdminUserId: PROTECTED_ADMIN_USER_ID,
      successMessage: messages.successMessage,
      errorMessages: messages.errorMessages
    });
  } catch (error) {
    next(error);
  }
}

async function renderLoginActivityPage(req, res, next) {
  try {
    const todayDate = formatDateKey(new Date(), req.timeZone);
    const requestedDate = String(req.query.date || '').trim();
    const selectedDate = getDayRangeUtc(requestedDate, req.timeZone) ? requestedDate : todayDate;
    const dayRange = getDayRangeUtc(selectedDate, req.timeZone);

    const loginActivity = await managementModel.listLoginActivityForDay(dayRange);
    const successfulLoginCount = loginActivity.reduce(
      (total, activity) => total + Number(activity.successful_login_count || 0),
      0
    );

    return res.render('pages/management-login-activity', {
      pageTitle: 'Login Activity',
      currentNav: 'management-login-activity',
      selectedDate,
      todayDate,
      loginActivity,
      signedInUserCount: loginActivity.length,
      successfulLoginCount
    });
  } catch (error) {
    return next(error);
  }
}

async function renderLoginActivityUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    if (!userId) return res.status(404).send('User not found.');

    const todayDate = formatDateKey(new Date(), req.timeZone);
    const requestedDate = String(req.query.date || '').trim();
    const selectedDate = getDayRangeUtc(requestedDate, req.timeZone) ? requestedDate : todayDate;
    const dayRange = getDayRangeUtc(selectedDate, req.timeZone);

    const [user, activity] = await Promise.all([
      managementModel.getUserById(userId),
      managementModel.listUserLoginActivityForDay({ userId, ...dayRange })
    ]);

    if (!user) return res.status(404).send('User not found.');

    return res.render('fragments/management-login-activity-user-modal', {
      user,
      activity,
      selectedDate
    });
  } catch (error) {
    return next(error);
  }
}

async function renderNewUserPage(req, res, next) {
  try {
    const roles = await listUserCreationRoleChoices(req);
    const canAssignRolesOnCreate = canAssignRoles(req);
    const canManageLoginInactivityOnCreate = canManageUserPermissionOverrides(req);
    const canManageToolPinsOnCreate = canManageToolPins(req);

    res.render(isHtmxRequest(req) ? 'fragments/management-user-create-modal' : 'pages/management-user-new', {
      pageTitle: 'Create User',
      currentNav: 'management',
      roles,
      canAssignRolesOnCreate,
      canManageLoginInactivityOnCreate,
      canManageToolPinsOnCreate,
      errorMessages: [],
      formData: {
        firstName: '',
        lastName: '',
        email: '',
        personalEmail: '',
        phone: '',
        startDate: '',
        endDate: '',
        roleCodes: [],
        loginInactivityMode: 'inherit',
        setupLinkExpiryHours: String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS)
      },
      passwordLinkExpiryPolicy: {
        minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
        maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
        defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = authModel.normalizeEmail(req.body.email);
    const personalEmail = normalizeOptionalUserEmail(req.body.personalEmail);
    const phone = normalizeOptionalUserText(req.body.phone);
    const startDate = normalizeOptionalDate(req.body.startDate);
    const endDate = normalizeOptionalDate(req.body.endDate);
    const roleCodes = normalizeRoleCodes(req.body.roleCodes);
    const canAssignRolesOnCreate = canAssignRoles(req);
    const canManageLoginInactivityOnCreate = canManageUserPermissionOverrides(req);
    const canManageToolPinsOnCreate = canManageToolPins(req);
    const submittedLoginInactivityMode = normalizeLoginInactivityMode(req.body.loginInactivityMode);
    const loginInactivityMode = canManageLoginInactivityOnCreate ? submittedLoginInactivityMode : 'inherit';
    const toolPin = String(req.body.toolPin || '').trim();
    const confirmToolPin = String(req.body.confirmToolPin || '').trim();
    const setupLinkExpiryHoursRaw = String(req.body.setupLinkExpiryHours || '').trim();
    const setupLinkExpiryHours = parsePasswordLinkExpiryHours(setupLinkExpiryHoursRaw);

    const roles = await listUserCreationRoleChoices(req);
    const allowedRoleCodes = new Set(roles.map((role) => role.code));
    const validRoleCodes = filterAssignableRoleCodes(roleCodes, allowedRoleCodes);

    const errorMessages = validateUserForm({
      firstName,
      lastName,
      email,
      personalEmail,
      phone,
      startDate,
      endDate,
      roleCodes: validRoleCodes,
      requireRole: canAssignRolesOnCreate
    });
    if (canManageToolPinsOnCreate) {
      errorMessages.push(...validateOptionalToolPin(toolPin, confirmToolPin));
    } else if (toolPin || confirmToolPin) {
      errorMessages.push('You do not have permission to manage Tool PINs.');
    }
    if (canManageLoginInactivityOnCreate && !submittedLoginInactivityMode) {
      errorMessages.push('Choose a valid login inactivity monitoring option.');
    }
    const selectedSuperAdmin = roles.some((role) => role.system_key === 'super_admin' && validRoleCodes.includes(role.code));
    if (selectedSuperAdmin && loginInactivityMode && loginInactivityMode !== 'inherit') {
      errorMessages.push('Super Admin users cannot have user-level login inactivity overrides.');
    }

    if (setupLinkExpiryHours === null) {
      errorMessages.push(`Setup link expiration must be a whole number from ${MIN_PASSWORD_LINK_EXPIRY_HOURS} through ${MAX_PASSWORD_LINK_EXPIRY_HOURS} hours.`);
    }

    if (!canAssignRolesOnCreate && roleCodes.length > 0) {
      errorMessages.push('You do not have permission to assign roles while creating a user.');
    }

    if (firstName.length >= 2 && lastName.length >= 2) {
      try {
        buildUsernameStem(firstName, lastName);
      } catch (error) {
        errorMessages.push(error.message);
      }
    }

    if (errorMessages.length > 0) {
      return res.status(isHtmxRequest(req) ? 200 : 400).render(isHtmxRequest(req) ? 'fragments/management-user-create-modal' : 'pages/management-user-new', {
        pageTitle: 'Create User',
        currentNav: 'management',
        roles,
        canAssignRolesOnCreate,
        canManageLoginInactivityOnCreate,
        canManageToolPinsOnCreate,
        errorMessages,
        formData: {
          firstName,
          lastName,
          email,
          personalEmail: personalEmail || '',
          phone: phone || '',
          startDate: startDate || '',
          endDate: endDate || '',
          roleCodes: validRoleCodes,
          loginInactivityMode: loginInactivityMode || 'inherit',
          setupLinkExpiryHours: setupLinkExpiryHoursRaw || String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS)
        },
        passwordLinkExpiryPolicy: {
          minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
          maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
          defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
        }
      });
    }

    const toolPinHash = canManageToolPinsOnCreate && toolPin
      ? await argon2.hash(toolPin, { type: argon2.argon2id })
      : null;

    let user;
    try {
      user = await authModel.createUserWithRoles({
        firstName,
        lastName,
        email,
        personalEmail,
        phone,
        startDate,
        endDate,
        roleCodes: validRoleCodes,
        toolPinHash,
        actorUserId: req.currentUser.user_id
      });
    } catch (error) {
      if (error && error.code === 'PROTECTED_ADMIN_USER') {
        return res.status(403).render('pages/error', {
          pageTitle: 'Protected Admin Account',
          message: error.message,
          error: null
        });
      }
      throw error;
    }

    if (canManageLoginInactivityOnCreate && !selectedSuperAdmin && loginInactivityMode !== 'inherit') {
      await permissionManagementService.setUserPermissionOverride({
        actorUserId: req.currentUser.user_id,
        actorPermissions: req.currentPermissions,
        userId: user.user_id,
        permissionKey: 'users.login_inactivity.monitor',
        effect: loginInactivityMode
      });
    }

    const setupLink = await createSetupLinkForUser(
      {
        ...user,
        has_password: false
      },
      req.currentUser.user_id,
      setupLinkExpiryHours
    );

    if (isHtmxRequest(req)) {
      return res.render('fragments/management-user-created-modal', { user, setupLink });
    }

    return res.render('pages/management-setup-link', {
      pageTitle: setupLink.linkLabel,
      currentNav: 'management',
      user,
      setupLink
    });
  } catch (error) {
    next(error);
  }
}

async function renderUserToolPinModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath);
    if (!userId) {
      return res.status(400).render('fragments/management-user-tool-pin-modal', {
        user: null, pinState: null, returnPath, errorMessages: ['The selected user ID is invalid.']
      });
    }

    const [user, pinState] = await Promise.all([
      managementModel.getUserById(userId),
      authModel.getUserToolPinState(userId)
    ]);
    if (!user || !pinState) {
      return res.status(404).render('fragments/management-user-tool-pin-modal', {
        user: null, pinState: null, returnPath, errorMessages: ['The selected user could not be found.']
      });
    }

    return res.render('fragments/management-user-tool-pin-modal', {
      user, pinState, returnPath, errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUserToolPin(req, res, next) {
  const returnPath = normalizeReturnPath(req.body.returnPath);
  try {
    const userId = getSafeUserId(req);
    if (!userId) return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));

    const user = await managementModel.getUserById(userId);
    if (!user) return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));

    const action = String(req.body.toolPinAction || 'set').trim().toLowerCase();
    if (action === 'remove') {
      await authModel.clearUserToolPin(userId);
      await userManagementAudit.recordEvent({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'user_tool_pin_removed', reason: 'Tool PIN removed by an authorized user.'
      });
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'toolPinRemoved=1'));
    }

    const toolPin = String(req.body.toolPin || '').trim();
    const confirmToolPin = String(req.body.confirmToolPin || '').trim();
    const errorMessages = validateOptionalToolPin(toolPin, confirmToolPin);
    if (!toolPin && !confirmToolPin) errorMessages.push('Enter a new 6-digit Tool PIN.');

    if (errorMessages.length > 0) {
      const pinState = await authModel.getUserToolPinState(userId);
      return res.status(400).render('fragments/management-user-tool-pin-modal', {
        user, pinState, returnPath, errorMessages
      });
    }

    const toolPinHash = await argon2.hash(toolPin, { type: argon2.argon2id });
    await authModel.setUserToolPin({ userId, toolPinHash });
    await userManagementAudit.recordEvent({
      actorUserId: req.currentUser.user_id, targetUserId: userId,
      action: 'user_tool_pin_updated', reason: 'Tool PIN registered or reset by an authorized user.'
    });
    return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'toolPinUpdated=1'));
  } catch (error) {
    return next(error);
  }
}

async function renderEditUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath);

    if (!userId) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user ID is invalid.']
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user could not be found.']
      });
    }

    const roleEditingLockCode = managementUserRoleEditPolicy.getSelfRoleLockCode({
      actorUser: req.currentUser,
      targetUserId: userId
    });
    const roleEditingLocked = Boolean(roleEditingLockCode);
    const canEditRoles = canAssignRoles(req) && !roleEditingLocked;
    const roles = canEditRoles
      ? await listRoleAdministrationChoices(req, { includeInactiveCodes: user.roles || [] })
      : [];
    const targetIsSuperAdmin = normalizeRoleCodes(user.roles || []).includes('super_admin');
    const canManageLoginInactivity = canManageUserPermissionOverrides(req) && !targetIsSuperAdmin;
    const loginInactivityOverride = canManageLoginInactivity
      ? await permissionManagementModel.getUserPermissionOverride(userId, 'users.login_inactivity.monitor')
      : null;

    return res.render('fragments/management-user-edit-modal', {
      user,
      roles,
      roleEditingLocked,
      roleEditingLockCode,
      canEditRoles,
      canManageLoginInactivity,
      returnPath,
      errorMessages: [],
      formData: {
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        personalEmail: user.personal_email || '',
        phone: user.phone || '',
        startDate: user.start_date || '',
        endDate: user.end_date || '',
        roleCodes: normalizeRoleCodes(user.roles || []),
        loginInactivityMode: loginInactivityOverride?.effect || 'inherit'
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.body.returnPath);

    if (!userId) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = authModel.normalizeEmail(req.body.email);
    const personalEmail = normalizeOptionalUserEmail(req.body.personalEmail);
    const phone = normalizeOptionalUserText(req.body.phone);
    const startDate = normalizeOptionalDate(req.body.startDate);
    const endDate = normalizeOptionalDate(req.body.endDate);
    const roleCodes = normalizeRoleCodes(req.body.roleCodes);
    const existingRoleCodes = normalizeRoleCodes(user.roles || []);
    const roleEditingLockCode = managementUserRoleEditPolicy.getSelfRoleLockCode({
      actorUser: req.currentUser,
      targetUserId: userId
    });
    const roleEditingLocked = Boolean(roleEditingLockCode);
    const canEditRoles = canAssignRoles(req) && !roleEditingLocked;

    const roles = canEditRoles
      ? await listRoleAdministrationChoices(req, { includeInactiveCodes: existingRoleCodes })
      : [];
    const allowedRoleCodes = new Set(roles.map((role) => role.code));
    const lockedRoleCodes = roles.filter((role) => role.assignmentLocked).map((role) => role.code);
    const validRoleCodes = canEditRoles
      ? [...new Set([...filterAssignableRoleCodes(roleCodes, allowedRoleCodes), ...lockedRoleCodes])]
      : existingRoleCodes;
    const targetWillBeSuperAdmin = validRoleCodes.includes('super_admin');
    const canManageLoginInactivity = canManageUserPermissionOverrides(req) && !targetWillBeSuperAdmin;
    const submittedLoginInactivityMode = normalizeLoginInactivityMode(req.body.loginInactivityMode);
    const loginInactivityMode = canManageLoginInactivity ? submittedLoginInactivityMode : 'inherit';

    const errorMessages = validateUserForm({
      firstName,
      lastName,
      email,
      personalEmail,
      phone,
      startDate,
      endDate,
      roleCodes: validRoleCodes,
      requireRole: canEditRoles
    });

    if (canManageLoginInactivity && !submittedLoginInactivityMode) {
      errorMessages.push('Choose a valid login inactivity monitoring option.');
    }

    if (!canEditRoles) {
      if (roleEditingLocked && managementUserRoleEditPolicy.isSubmittedRoleChange({
        submittedRoleCodes: roleCodes,
        currentRoleCodes: existingRoleCodes
      })) {
        const lockedRoleLabel = roleEditingLockCode === 'admin' ? 'Admin' : 'Management';
        errorMessages.push(`${lockedRoleLabel} users cannot change their own access role. Another authorized user must make that change.`);
        await userManagementAudit.recordBlocked({
          actorUserId: req.currentUser.user_id, targetUserId: userId,
          action: 'user_role_change_blocked',
          reason: userId === PROTECTED_ADMIN_USER_ID
            ? 'Protected Administrator role cannot be removed.'
            : 'Users cannot change their own access role.'
        });
      }
    }

    if (errorMessages.length > 0) {
      return res.render('fragments/management-user-edit-modal', {
        user,
        roles,
        roleEditingLocked,
        roleEditingLockCode,
        canEditRoles,
        canManageLoginInactivity,
        returnPath,
        errorMessages,
        formData: {
          firstName,
          lastName,
          email,
          personalEmail: personalEmail || '',
          phone: phone || '',
          startDate: startDate || '',
          endDate: endDate || '',
          roleCodes: validRoleCodes,
          loginInactivityMode: loginInactivityMode || 'inherit'
        }
      });
    }

    try {
      if (!canEditRoles) {
        await managementModel.updateUserProfile({
          userId,
          actorUserId: req.currentUser.user_id,
          firstName,
          lastName,
          email,
          personalEmail,
          phone,
          startDate,
          endDate
        });
      } else {
        await managementModel.updateUserWithRoles({
          userId,
          actorUserId: req.currentUser.user_id,
          firstName,
          lastName,
          email,
          personalEmail,
          phone,
          startDate,
          endDate,
          roleCodes: validRoleCodes
        });
      }

      if (canManageLoginInactivity) {
        await permissionManagementService.setUserPermissionOverride({
          actorUserId: req.currentUser.user_id,
          actorPermissions: req.currentPermissions,
          userId,
          permissionKey: 'users.login_inactivity.monitor',
          effect: loginInactivityMode
        });
      }
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return res.render('fragments/management-user-edit-modal', {
          user,
          roles,
          roleEditingLocked,
          roleEditingLockCode,
          canEditRoles,
          canManageLoginInactivity,
          returnPath,
          errorMessages: ['That email address is already assigned to another user.'],
          formData: {
            firstName,
            lastName,
            email,
            personalEmail: personalEmail || '',
            phone: phone || '',
            startDate: startDate || '',
            endDate: endDate || '',
            roleCodes: validRoleCodes,
            loginInactivityMode: loginInactivityMode || 'inherit'
          }
        });
      }

      throw error;
    }

    return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'updated=1'));
  } catch (error) {
    next(error);
  }
}

async function renderSetupLinkModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath);

    if (!userId) {
      return res.status(400).render('fragments/management-user-setup-link-modal', {
        user: null,
        returnPath,
        expiryHours: String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS),
        passwordLinkExpiryPolicy: {
          minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
          maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
          defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
        },
        errorMessages: ['The selected user ID is invalid.']
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('fragments/management-user-setup-link-modal', {
        user: null,
        returnPath,
        expiryHours: String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS),
        passwordLinkExpiryPolicy: {
          minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
          maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
          defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
        },
        errorMessages: ['The selected user could not be found.']
      });
    }

    if (!user.is_active) {
      return res.status(400).render('fragments/management-user-setup-link-modal', {
        user,
        returnPath,
        expiryHours: String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS),
        passwordLinkExpiryPolicy: {
          minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
          maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
          defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
        },
        errorMessages: ['Inactive users cannot receive setup or reset links. Reactivate the user first.']
      });
    }

    return res.render('fragments/management-user-setup-link-modal', {
      user,
      returnPath,
      expiryHours: String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS),
      passwordLinkExpiryPolicy: {
        minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
        maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
        defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
      },
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createSetupLinkForExistingUser(req, res, next) {
  try {
    const userId = getSafeUserId(req);

    if (!userId) {
      return res.status(400).render('pages/error', {
        pageTitle: 'Invalid User',
        message: 'The selected user ID is invalid.',
        error: null
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('pages/error', {
        pageTitle: 'User Not Found',
        message: 'The selected user could not be found.',
        error: null
      });
    }

    if (!user.is_active) {
      await userManagementAudit.recordBlocked({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'password_link_blocked', reason: 'Inactive users cannot receive setup or reset links.'
      });
      return res.redirect('/management/users/inactive?error=inactive_setup_link');
    }

    const expiryHoursRaw = String(req.body.expiryHours || '').trim();
    const expiryHours = parsePasswordLinkExpiryHours(expiryHoursRaw);

    if (expiryHours === null) {
      return res.status(400).render('fragments/management-user-setup-link-modal', {
        user,
        returnPath: normalizeReturnPath(req.body.returnPath),
        expiryHours: expiryHoursRaw || String(DEFAULT_PASSWORD_LINK_EXPIRY_HOURS),
        passwordLinkExpiryPolicy: {
          minHours: MIN_PASSWORD_LINK_EXPIRY_HOURS,
          maxHours: MAX_PASSWORD_LINK_EXPIRY_HOURS,
          defaultHours: DEFAULT_PASSWORD_LINK_EXPIRY_HOURS
        },
        errorMessages: [`Link expiration must be a whole number from ${MIN_PASSWORD_LINK_EXPIRY_HOURS} through ${MAX_PASSWORD_LINK_EXPIRY_HOURS} hours.`]
      });
    }

    const setupLink = await createSetupLinkForUser(user, req.currentUser.user_id, expiryHours);

    return res.render('pages/management-setup-link', {
      pageTitle: setupLink.linkLabel,
      currentNav: 'management',
      user,
      setupLink
    });
  } catch (error) {
    next(error);
  }
}

async function renderDeactivateUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath);

    if (!userId) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user ID is invalid.']
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user could not be found.']
      });
    }

    if (userId === Number(req.currentUser.user_id)) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user,
        returnPath,
        errorMessages: ['You cannot deactivate your own account while signed in.']
      });
    }

    return res.render('fragments/management-user-action-modal', {
      actionType: 'deactivate',
      user,
      returnPath,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderReactivateUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath || 'inactive');

    if (!userId) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user ID is invalid.']
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user could not be found.']
      });
    }

    return res.render('fragments/management-user-action-modal', {
      actionType: 'reactivate',
      user,
      returnPath,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderDeletePendingUserModal(req, res, next) {
  try {
    const userId = getSafeUserId(req);
    const returnPath = normalizeReturnPath(req.query.returnPath);

    if (!userId) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user ID is invalid.']
      });
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return res.status(404).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user: null,
        returnPath,
        errorMessages: ['The selected user could not be found.']
      });
    }

    if (userId === Number(req.currentUser.user_id)) {
      return res.status(400).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user,
        returnPath,
        errorMessages: ['You cannot delete your own signed-in account.']
      });
    }

    return res.render('fragments/management-user-action-modal', {
      actionType: 'delete-pending',
      user,
      returnPath,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deactivateUser(req, res, next) {
  const returnPath = normalizeReturnPath(req.body.returnPath);

  try {
    const userId = getSafeUserId(req);

    if (!userId) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    if (userId === Number(req.currentUser.user_id)) {
      await userManagementAudit.recordBlocked({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'user_deactivation_blocked',
        reason: userId === PROTECTED_ADMIN_USER_ID
          ? 'Protected Administrator cannot be deactivated.'
          : 'Users cannot deactivate their own signed-in account.'
      });
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=self_deactivate'));
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    await managementModel.deactivateUser(userId, req.currentUser.user_id);

    return redirectAfterHtmxAwareAction(req, res, '/management/users?deactivated=1');
  } catch (error) {
    next(error);
  }
}

async function reactivateUser(req, res, next) {
  const returnPath = normalizeReturnPath(req.body.returnPath || 'inactive');

  try {
    const userId = getSafeUserId(req);

    if (!userId) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    await managementModel.reactivateUser(userId, req.currentUser.user_id);

    return redirectAfterHtmxAwareAction(req, res, '/management/users/inactive?reactivated=1');
  } catch (error) {
    next(error);
  }
}

async function deletePendingSetupUser(req, res, next) {
  const returnPath = normalizeReturnPath(req.body.returnPath);
  const returnUrl = getUsersReturnUrl(returnPath);

  try {
    const userId = getSafeUserId(req);

    if (!userId) {
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=not_found`);
    }

    if (userId === Number(req.currentUser.user_id)) {
      await userManagementAudit.recordBlocked({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'user_deletion_blocked',
        reason: userId === PROTECTED_ADMIN_USER_ID
          ? 'Protected Administrator cannot be deleted.'
          : 'Users cannot delete their own signed-in account.'
      });
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=self_delete`);
    }

    const result = await managementModel.deletePendingSetupUser(userId, req.currentUser.user_id);

    if (result.reason === 'not_found') {
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=not_found`);
    }

    if (result.reason === 'not_allowed') {
      await userManagementAudit.recordBlocked({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'user_deletion_blocked', reason: 'Only unused Pending Setup accounts may be deleted.'
      });
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=pending_delete_not_allowed`);
    }

    if (result.reason === 'has_links') {
      await userManagementAudit.recordBlocked({
        actorUserId: req.currentUser.user_id, targetUserId: userId,
        action: 'user_deletion_blocked', reason: 'Account is linked to application records.'
      });
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=pending_user_has_links`);
    }

    return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?deleted=1`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderUserHistoryPage,
  renderUsersPage,
  renderInactiveUsersPage,
  renderLoginActivityPage,
  renderLoginActivityUserModal,
  renderNewUserPage,
  createUser,
  renderUserToolPinModal,
  updateUserToolPin,
  renderEditUserModal,
  updateUserModal,
  renderSetupLinkModal,
  createSetupLinkForExistingUser,
  renderDeactivateUserModal,
  renderReactivateUserModal,
  renderDeletePendingUserModal,
  deactivateUser,
  reactivateUser,
  deletePendingSetupUser
};
