const accessPolicy = require('../config/accessPolicy');

function attachAccessLocals(req, res, next) {
  const currentRoles = res.locals.currentRoles || [];

  res.locals.dashboardDefinitions = accessPolicy.DASHBOARD_DEFINITIONS;
  res.locals.getAccessibleDashboards = () => accessPolicy.getAccessibleDashboards(currentRoles);
  res.locals.canAccessDashboard = (dashboardKey) => accessPolicy.canAccessDashboard(currentRoles, dashboardKey);
  res.locals.canAccessFeature = (featureKey) => accessPolicy.canAccessFeature(currentRoles, featureKey);
  res.locals.canAccessMenuArea = (menuAreaKey) => accessPolicy.canAccessMenuArea(currentRoles, menuAreaKey);
  res.locals.canAccessUnitRequests = () => accessPolicy.canAccessUnitRequests(currentRoles);
  res.locals.canCreateOrEditTechUnits = () => accessPolicy.canCreateOrEditTechUnits(currentRoles);

  return next();
}
module.exports = {
  attachAccessLocals,
};