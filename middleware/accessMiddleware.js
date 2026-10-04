const accessPolicy = require('../config/accessPolicy');

function attachAccessLocals(req, res, next) {
  const currentRoles = res.locals.currentRoles || [];
  const hasPermission = typeof res.locals.hasPermission === 'function'
    ? res.locals.hasPermission
    : () => false;
  const canAccessDashboard = (dashboardKey) => {
    const dashboard = accessPolicy.getDashboardDefinition(dashboardKey);
    return Boolean(dashboard && dashboard.permissionKey && hasPermission(dashboard.permissionKey));
  };

  res.locals.dashboardDefinitions = accessPolicy.DASHBOARD_DEFINITIONS;
  res.locals.getAccessibleDashboards = () => accessPolicy.DASHBOARD_DEFINITIONS.filter((dashboard) => canAccessDashboard(dashboard.key));
  res.locals.canAccessDashboard = canAccessDashboard;
  res.locals.canAccessFeature = (featureKey) => accessPolicy.canAccessFeature(currentRoles, featureKey);
  res.locals.canAccessMenuArea = (menuAreaKey) => accessPolicy.canAccessMenuArea(currentRoles, menuAreaKey);
  res.locals.canAccessUnitRequests = () => accessPolicy.canAccessUnitRequests(currentRoles);
  res.locals.canCreateOrEditTechUnits = () => accessPolicy.canCreateOrEditTechUnits(currentRoles);

  return next();
}
module.exports = {
  attachAccessLocals,
};