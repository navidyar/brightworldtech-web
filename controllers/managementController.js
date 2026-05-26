const crypto = require('crypto');
const authModel = require('../models/authModel');
const managementModel = require('../models/managementModel');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'https://bwtdallas.com').replace(/\/$/, '');
}

function normalizeRoleCodes(roleCodes) {
  if (!roleCodes) {
    return [];
  }

  if (Array.isArray(roleCodes)) {
    return roleCodes.map((roleCode) => String(roleCode).trim()).filter(Boolean);
  }

  return [String(roleCodes).trim()].filter(Boolean);
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

async function createSetupLinkForUser(user, createdByUserId = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresInHours = Number(process.env.PASSWORD_SETUP_EXPIRES_HOURS || 24);
  const expiresAt = addHours(new Date(), expiresInHours);

  const linkTypeCode = user.has_password ? 'password_reset' : 'initial_password_setup';

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
    linkTypeCode
  };
}

async function renderUsersPage(req, res, next) {
  try {
    const users = await managementModel.listUsers();

    res.render('pages/management-users', {
      pageTitle: 'Management',
      currentNav: 'management',
      users,
      successMessage: req.query.created === '1'
        ? 'User created successfully. Copy the setup link before leaving the setup-link page.'
        : null,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewUserPage(req, res, next) {
  try {
    const roles = await managementModel.listActiveRoles();

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

    const roles = await managementModel.listActiveRoles();
    const allowedRoleCodes = new Set(roles.map((role) => role.code));
    const validRoleCodes = roleCodes.filter((roleCode) => allowedRoleCodes.has(roleCode));

    const errorMessages = validateUserForm({
      firstName,
      lastName,
      email,
      roleCodes: validRoleCodes
    });

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
      pageTitle: 'Setup Link Created',
      currentNav: 'management',
      user,
      setupLink
    });
  } catch (error) {
    next(error);
  }
}

async function createSetupLinkForExistingUser(req, res, next) {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
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

    const setupLink = await createSetupLinkForUser(user, req.currentUser.user_id);

    return res.render('pages/management-setup-link', {
      pageTitle: 'Setup Link Created',
      currentNav: 'management',
      user,
      setupLink
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderUsersPage,
  renderNewUserPage,
  createUser,
  createSetupLinkForExistingUser
};