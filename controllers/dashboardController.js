async function renderRoleDashboard(req, res, next) {
  try {
    const dashboard = req.dashboardDefinition;

    res.render('pages/role-dashboard', {
      pageTitle: dashboard.title,
      currentNav: `dashboard:${dashboard.key}`,
      dashboard
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderRoleDashboard
};