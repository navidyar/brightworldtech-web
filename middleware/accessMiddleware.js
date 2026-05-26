const accessPolicy = require('../config/accessPolicy');

function attachAccessLocals(req, res, next) {
  const currentRoles = res.locals.currentRoles || [];

  res.locals.dashboardDefinitions = accessPolicy.DASHBOARD_DEFINITIONS;
  res.locals.getAccessibleDashboards = () => accessPolicy.getAccessibleDashboards(currentRoles);
  res.locals.canAccessDashboard = (dashboardKey) => accessPolicy.canAccessDashboard(currentRoles, dashboardKey);
  res.locals.canAccessMenuArea = (menuAreaKey) => accessPolicy.canAccessMenuArea(currentRoles, menuAreaKey);

  return next();
}

function requireDashboardAccess(req, res, next) {
  const dashboardKey = req.params.dashboardKey;
  const dashboard = accessPolicy.getDashboardDefinition(dashboardKey);

  if (!dashboard) {
    return res.status(404).render('pages/not-found', {
      pageTitle: 'Dashboard Not Found',
      requestedPath: req.originalUrl
    });
  }

  if (!req.currentUser) {
    return res.redirect('/login');
  }

  if (!accessPolicy.canAccessDashboard(req.currentUser.roles, dashboardKey)) {
    return res.status(403).render('pages/error', {
      pageTitle: 'Access Denied',
      message: 'You do not have permission to access this dashboard.',
      error: null
    });
  }

  req.dashboardDefinition = dashboard;

  return next();
}

module.exports = {
  attachAccessLocals,
  requireDashboardAccess
};