const crypto = require('crypto');
const argon2 = require('argon2');
const authModel = require('../models/authModel');
const userManagementAudit = require('../models/userManagementAuditModel');
const { validateToolPin } = require('../services/toolPinPolicy');
const { isHtmxRequest } = require('../utils/htmxRequest');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function validatePassword(password, confirmPassword) {
  const errors = [];

  if (!password || password.length < 10) {
    errors.push('Password must be at least 10 characters long.');
  }

  if (password && password.length > 25) {
    errors.push('Password must be 25 characters or fewer.');
  }

  if (password !== confirmPassword) {
    errors.push('Password confirmation does not match.');
  }

  return errors;
}

function getLoginSuccessMessage(req) {
  if (req.query.setup === 'complete') {
    return 'Password created successfully. You can now sign in.';
  }

  if (req.query.password === 'reset') {
    return 'Password reset successfully. You can now sign in.';
  }

  return null;
}

function getLoginErrorMessage(req) {
  if (req.query.session === 'expired') {
    return 'Your session has ended. Please sign in again.';
  }

  return null;
}

function renderLogin(req, res) {
  res.render('pages/login', {
    pageTitle: 'Sign In',
    errorMessage: getLoginErrorMessage(req),
    successMessage: getLoginSuccessMessage(req),
    formData: {
      identifier: ''
    }
  });
}

async function login(req, res, next) {
  try {
    const identifier = authModel.normalizeLoginIdentifier(req.body.identifier || req.body.email);
    const password = req.body.password || '';

    const genericError = 'Invalid email, username, or password.';

    const user = await authModel.getUserByLoginIdentifier(identifier);

    if (!user || !user.password_hash || !user.is_active || user.account_status_code !== 'active') {
      await authModel.recordFailedLogin(identifier);

      return res.status(401).render('pages/login', {
        pageTitle: 'Sign In',
        errorMessage: genericError,
        successMessage: null,
        formData: { identifier }
      });
    }

    const passwordIsValid = await argon2.verify(user.password_hash, password);

    if (!passwordIsValid) {
      await authModel.recordFailedLogin(identifier);

      return res.status(401).render('pages/login', {
        pageTitle: 'Sign In',
        errorMessage: genericError,
        successMessage: null,
        formData: { identifier }
      });
    }

    req.session.regenerate(async (sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.session.userId = user.user_id;
      if (Number.isFinite(req.sessionInactivityTimeoutMs) && req.sessionInactivityTimeoutMs > 0) {
        req.session.cookie.maxAge = req.sessionInactivityTimeoutMs;
      }

      await authModel.recordSuccessfulLogin(user.user_id);

      return req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }

        return res.redirect('/');
      });
    });
  } catch (error) {
    next(error);
  }
}

async function renderOwnToolPinModal(req, res, next) {
  try {
    const pinState = await authModel.getUserToolPinState(req.currentUser.user_id);
    if (!pinState) return res.status(404).send('User account not found.');
    return res.render('fragments/account-tool-pin-modal', {
      pinState,
      errorMessages: [],
      successMessage: null
    });
  } catch (error) {
    return next(error);
  }
}

async function updateOwnToolPin(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const toolPin = String(req.body.toolPin || '').trim();
    const confirmToolPin = String(req.body.confirmToolPin || '').trim();
    const errorMessages = validateToolPin(toolPin, confirmToolPin);

    const credential = await authModel.getUserCredentialById(req.currentUser.user_id);
    const passwordIsValid = Boolean(
      currentPassword
      && credential?.password_hash
      && await argon2.verify(credential.password_hash, currentPassword)
    );
    if (!passwordIsValid) errorMessages.unshift('Current account password is incorrect.');

    if (errorMessages.length > 0) {
      const pinState = await authModel.getUserToolPinState(req.currentUser.user_id);
      return res.status(isHtmxRequest(req) ? 200 : 400).render('fragments/account-tool-pin-modal', {
        pinState,
        errorMessages,
        successMessage: null
      });
    }

    const toolPinHash = await argon2.hash(toolPin, { type: argon2.argon2id });
    await authModel.setUserToolPin({
      userId: req.currentUser.user_id,
      toolPinHash
    });
    await userManagementAudit.recordEvent({
      actorUserId: req.currentUser.user_id,
      targetUserId: req.currentUser.user_id,
      action: 'user_tool_pin_updated',
      reason: 'User changed own Tool PIN.'
    });

    const pinState = await authModel.getUserToolPinState(req.currentUser.user_id);
    return res.render('fragments/account-tool-pin-modal', {
      pinState,
      errorMessages: [],
      successMessage: 'Tool PIN updated successfully.'
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie('bwtdallas.sid');
    return res.redirect('/login');
  });
}

async function renderSetupPassword(req, res, next) {
  try {
    const token = String(req.query.token || '').trim();
    const tokenHash = hashToken(token);
    const link = token ? await authModel.getValidPasswordLink(tokenHash) : null;

    res.render('pages/setup-password', {
      pageTitle: link && link.link_type_code === 'password_reset' ? 'Reset Password' : 'Set Password',
      token,
      link,
      errorMessages: [],
      successMessage: null
    });
  } catch (error) {
    next(error);
  }
}

async function setupPassword(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    const password = req.body.password || '';
    const confirmPassword = req.body.confirmPassword || '';

    const tokenHash = hashToken(token);
    const link = token ? await authModel.getValidPasswordLink(tokenHash) : null;

    if (!link) {
      return res.status(400).render('pages/setup-password', {
        pageTitle: 'Set Password',
        token: '',
        link: null,
        errorMessages: ['This password link is invalid, expired, used, or revoked.'],
        successMessage: null
      });
    }

    const validationErrors = validatePassword(password, confirmPassword);

    if (validationErrors.length > 0) {
      return res.status(400).render('pages/setup-password', {
        pageTitle: link.link_type_code === 'password_reset' ? 'Reset Password' : 'Set Password',
        token,
        link,
        errorMessages: validationErrors,
        successMessage: null
      });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id
    });

    await authModel.setPasswordFromLink({
      userPasswordLinkId: link.user_password_link_id,
      userId: link.user_id,
      passwordHash
    });

    if (link.link_type_code === 'password_reset') {
      return res.redirect('/login?password=reset');
    }

    return res.redirect('/login?setup=complete');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLogin,
  login,
  renderOwnToolPinModal,
  updateOwnToolPin,
  logout,
  renderSetupPassword,
  setupPassword,
  hashToken
};