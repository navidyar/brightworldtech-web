const crypto = require('crypto');
const authModel = require('../models/authModel');
const managementModel = require('../models/managementModel');
const accessPolicy = require('../config/accessPolicy');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'https://bwtdallas.com').replace(/\/$/, '');
}

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
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

  if (submittedRoleCodes.length === 0) {
    return [];
  }

  const primaryRoleCode = accessPolicy.ROLE_HIERARCHY.find((roleCode) => submittedRoleCodes.includes(roleCode)) || submittedRoleCodes[0];

  return primaryRoleCode ? [primaryRoleCode] : [];
}

function canAssignAdminRole(req) {
  return Boolean(req.currentUser && Array.isArray(req.currentUser.roles) && req.currentUser.roles.includes('admin'));
}

function getAssignableRolesForCurrentUser(roles, req) {
  const accountRoleCodes = new Set(accessPolicy.ACCOUNT_ROLE_CODES);
  const safeRoles = Array.isArray(roles)
    ? roles.filter((role) => accountRoleCodes.has(role.code))
    : [];

  if (canAssignAdminRole(req)) {
    return safeRoles;
  }

  return safeRoles.filter((role) => role.code !== 'admin');
}

function filterAssignableRoleCodes(roleCodes, req) {
  const safeRoleCodes = Array.isArray(roleCodes) ? roleCodes : [];

  if (canAssignAdminRole(req)) {
    return safeRoleCodes;
  }

  return safeRoleCodes.filter((roleCode) => roleCode !== 'admin');
}

function addAdminRoleAssignmentErrors(errorMessages, requestedRoleCodes, req) {
  if (!canAssignAdminRole(req) && requestedRoleCodes.includes('admin')) {
    errorMessages.push('Only Admin users can assign the Admin role.');
  }
}

function isAdminUserRecord(user) {
  return Array.isArray(user?.roles) && user.roles.includes('admin');
}

function normalizeReturnPath(returnPath) {
  return returnPath === 'inactive' ? 'inactive' : 'active';
}

function getUsersReturnUrl(returnPath, queryString = '') {
  const basePath = returnPath === 'inactive' ? '/management/users/inactive' : '/management/users';
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function validateUserForm({ firstName, lastName, email, roleCodes }) {
  const errors = [];

  if (!firstName || firstName.length < 2) {
    errors.push('First name is required.');
  }

  if (!lastName || lastName.length < 2) {
    errors.push('Last name is required.');
  }

  if (!email || !email.includes('@')) {
    errors.push('A valid email address is required.');
  }

  if (roleCodes.length === 0) {
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

async function createSetupLinkForUser(user, createdByUserId = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresInHours = Number(process.env.PASSWORD_SETUP_EXPIRES_HOURS || 24);
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
    const users = await managementModel.listUsers({ activeOnly: true });
    const userCounts = await managementModel.countUsersByActiveStatus();
    const messages = getUserListMessages(req.query);

    res.render('pages/management-users', {
      pageTitle: 'Management',
      currentNav: 'management',
      users,
      userCounts,
      isInactiveView: false,
      currentUserId: req.currentUser.user_id,
      successMessage: messages.successMessage,
      errorMessages: messages.errorMessages
    });
  } catch (error) {
    next(error);
  }
}

async function renderInactiveUsersPage(req, res, next) {
  try {
    const users = await managementModel.listUsers({ activeOnly: false });
    const userCounts = await managementModel.countUsersByActiveStatus();
    const messages = getUserListMessages(req.query);

    res.render('pages/management-users', {
      pageTitle: 'Inactive Users',
      currentNav: 'management',
      users,
      userCounts,
      isInactiveView: true,
      currentUserId: req.currentUser.user_id,
      successMessage: messages.successMessage,
      errorMessages: messages.errorMessages
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewUserPage(req, res, next) {
  try {
    const roles = getAssignableRolesForCurrentUser(await managementModel.listAssignableAccountRoles(), req);

    res.render('pages/management-user-new', {
      pageTitle: 'Create User',
      currentNav: 'management',
      roles,
      errorMessages: [],
      formData: {
        firstName: '',
        lastName: '',
        email: '',
        roleCodes: []
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
    const roleCodes = normalizeRoleCodes(req.body.roleCodes);

    const roles = getAssignableRolesForCurrentUser(await managementModel.listAssignableAccountRoles(), req);
    const allowedRoleCodes = new Set(roles.map((role) => role.code));
    const validRoleCodes = filterAssignableRoleCodes(
      roleCodes.filter((roleCode) => allowedRoleCodes.has(roleCode) || roleCode === 'admin'),
      req
    );

    const errorMessages = validateUserForm({
      firstName,
      lastName,
      email,
      roleCodes: validRoleCodes
    });
    addAdminRoleAssignmentErrors(errorMessages, roleCodes, req);

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/management-user-new', {
        pageTitle: 'Create User',
        currentNav: 'management',
        roles,
        errorMessages,
        formData: {
          firstName,
          lastName,
          email,
          roleCodes: validRoleCodes
        }
      });
    }

    const user = await authModel.createUserWithRoles({
      firstName,
      lastName,
      email,
      roleCodes: validRoleCodes
    });

    const setupLink = await createSetupLinkForUser(
      {
        ...user,
        has_password: false
      },
      req.currentUser.user_id
    );

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

    if (isAdminUserRecord(user) && !canAssignAdminRole(req)) {
      return res.status(403).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user,
        returnPath,
        errorMessages: ['Only Admin users can edit users with the Admin role.']
      });
    }

    const roles = getAssignableRolesForCurrentUser(await managementModel.listAssignableAccountRoles(), req);

    return res.render('fragments/management-user-edit-modal', {
      user,
      roles,
      returnPath,
      errorMessages: [],
      formData: {
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        roleCodes: normalizeRoleCodes(user.roles || [])
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

    if (isAdminUserRecord(user) && !canAssignAdminRole(req)) {
      return res.status(403).render('fragments/management-user-action-modal', {
        actionType: 'error',
        user,
        returnPath,
        errorMessages: ['Only Admin users can edit users with the Admin role.']
      });
    }

    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = authModel.normalizeEmail(req.body.email);
    const roleCodes = normalizeRoleCodes(req.body.roleCodes);

    const roles = getAssignableRolesForCurrentUser(await managementModel.listAssignableAccountRoles(), req);
    const allowedRoleCodes = new Set(roles.map((role) => role.code));
    const validRoleCodes = filterAssignableRoleCodes(
      roleCodes.filter((roleCode) => allowedRoleCodes.has(roleCode) || roleCode === 'admin'),
      req
    );

    const errorMessages = validateUserForm({
      firstName,
      lastName,
      email,
      roleCodes: validRoleCodes
    });
    addAdminRoleAssignmentErrors(errorMessages, roleCodes, req);

    if (errorMessages.length > 0) {
      return res.render('fragments/management-user-edit-modal', {
        user,
        roles,
        returnPath,
        errorMessages,
        formData: {
          firstName,
          lastName,
          email,
          roleCodes: validRoleCodes
        }
      });
    }

    try {
      await managementModel.updateUserWithRoles({
        userId,
        firstName,
        lastName,
        email,
        roleCodes: validRoleCodes
      });
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return res.render('fragments/management-user-edit-modal', {
          user,
          roles,
          returnPath,
          errorMessages: ['That email address is already assigned to another user.'],
          formData: {
            firstName,
            lastName,
            email,
            roleCodes: validRoleCodes
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
      return res.redirect('/management/users/inactive?error=inactive_setup_link');
    }

    const setupLink = await createSetupLinkForUser(user, req.currentUser.user_id);

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
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=self_deactivate'));
    }

    const user = await managementModel.getUserById(userId);

    if (!user) {
      return redirectAfterHtmxAwareAction(req, res, getUsersReturnUrl(returnPath, 'error=not_found'));
    }

    await managementModel.deactivateUser(userId);

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

    await managementModel.reactivateUser(userId);

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
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=self_delete`);
    }

    const result = await managementModel.deletePendingSetupUser(userId);

    if (result.reason === 'not_found') {
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=not_found`);
    }

    if (result.reason === 'not_allowed') {
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=pending_delete_not_allowed`);
    }

    if (result.reason === 'has_links') {
      return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?error=pending_user_has_links`);
    }

    return redirectAfterHtmxAwareAction(req, res, `${returnUrl}?deleted=1`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderUsersPage,
  renderInactiveUsersPage,
  renderNewUserPage,
  createUser,
  renderEditUserModal,
  updateUserModal,
  createSetupLinkForExistingUser,
  renderDeactivateUserModal,
  renderReactivateUserModal,
  renderDeletePendingUserModal,
  deactivateUser,
  reactivateUser,
  deletePendingSetupUser
};
