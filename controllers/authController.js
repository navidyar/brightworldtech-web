const crypto = require('crypto');
const argon2 = require('argon2');
const authModel = require('../models/authModel');

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

function renderLogin(req, res) {
  res.render('pages/login', {
    pageTitle: 'Sign In',
    errorMessage: null,
    successMessage: getLoginSuccessMessage(req),
    formData: {
      email: ''
    }
  });
}

async function login(req, res, next) {
  try {
    const email = authModel.normalizeEmail(req.body.email);
    const password = req.body.password || '';

    const genericError = 'Invalid email or password.';

    const user = await authModel.getUserByEmail(email);

    if (!user || !user.password_hash || !user.is_active || user.account_status_code !== 'active') {
      await authModel.recordFailedLogin(email);

      return res.status(401).render('pages/login', {
        pageTitle: 'Sign In',
        errorMessage: genericError,
        successMessage: null,
        formData: { email }
      });
    }

    const passwordIsValid = await argon2.verify(user.password_hash, password);

    if (!passwordIsValid) {
      await authModel.recordFailedLogin(email);

      return res.status(401).render('pages/login', {
        pageTitle: 'Sign In',
        errorMessage: genericError,
        successMessage: null,
        formData: { email }
      });
    }

    req.session.regenerate(async (sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.session.userId = user.user_id;

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
  logout,
  renderSetupPassword,
  setupPassword,
  hashToken
};