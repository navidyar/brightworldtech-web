const authModel = require('../models/authModel');

async function loadCurrentUser(req, res, next) {
  try {
    res.locals.currentUser = null;
    res.locals.isAuthenticated = false;
    res.locals.currentRoles = [];

    if (!req.session || !req.session.userId) {
      return next();
    }

    const user = await authModel.getUserByIdWithRoles(req.session.userId);

    if (!user || !user.is_active || user.account_status_code !== 'active') {
      req.session.destroy(() => {});
      return next();
    }

    req.currentUser = user;
    res.locals.currentUser = user;
    res.locals.isAuthenticated = true;
    res.locals.currentRoles = user.roles;

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    return res.redirect('/login');
  }

  return next();
}

function requireGuest(req, res, next) {
  if (req.currentUser) {
    return res.redirect('/');
  }

  return next();
}

function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.currentUser) {
      return res.redirect('/login');
    }

    const hasRole = req.currentUser.roles.some((roleCode) => allowed.includes(roleCode));

    if (!hasRole) {
      return res.status(403).render('pages/error', {
        pageTitle: 'Access Denied',
        message: 'You do not have permission to access this page.',
        error: null
      });
    }

    return next();
  };
}

module.exports = {
  loadCurrentUser,
  requireAuth,
  requireGuest,
  requireRole
};
