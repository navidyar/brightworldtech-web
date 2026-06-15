const dashboardModel = require('../models/dashboardModel');

function formatDashboardTitle(key) {
  return String(key || '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeDashboardDefinition(dashboard) {
  const key = String(dashboard.key || '').trim();
  const title = dashboard.title || dashboard.menuLabel || dashboard.label || formatDashboardTitle(key);

  return {
    key,
    title,
    menuLabel: dashboard.menuLabel || title,
    description:
      dashboard.description ||
      dashboard.summary ||
      `Access the ${title} dashboard and related operational views.`,
    kicker: dashboard.kicker || dashboard.menuArea || 'Dashboard',
    accent: dashboard.accent || 'slate'
  };
}

function getDashboardDefinitions(res) {
  if (!Array.isArray(res.locals.dashboardDefinitions)) {
    return [];
  }

  return res.locals.dashboardDefinitions
    .filter((dashboard) => dashboard && dashboard.key)
    .map(normalizeDashboardDefinition);
}

function getAccessibleDashboards(res) {
  const dashboardDefinitions = getDashboardDefinitions(res);
  const canAccessDashboard = res.locals.canAccessDashboard;

  if (typeof canAccessDashboard !== 'function') {
    return [];
  }

  return dashboardDefinitions.filter((dashboard) => canAccessDashboard(dashboard.key));
}

function findDashboardByKey(res, dashboardKey) {
  const dashboardDefinitions = getDashboardDefinitions(res);

  return dashboardDefinitions.find((dashboard) => dashboard.key === dashboardKey) || null;
}

function getDashboardFilterConfig(dashboardKey = null) {
  const isRoleDashboard = Boolean(dashboardKey);
  const pageHref = isRoleDashboard ? `/dashboards/${encodeURIComponent(dashboardKey)}` : '/';

  return {
    pageHref,
    summaryHref: isRoleDashboard
      ? `/dashboards/${encodeURIComponent(dashboardKey)}/summary`
      : '/dashboard/summary',
    resetHref: pageHref
  };
}

async function buildDashboardPayload(req, dashboardKey = null) {
  const dashboardFilters = dashboardModel.normalizeDashboardFilters(req.query || {});
  const [dashboardData, dashboardFilterOptions] = await Promise.all([
    dashboardModel.getDashboardData(dashboardFilters, {
      currentUser: req.currentUser,
      currentRoles: req.currentUser ? req.currentUser.roles : [],
      dashboardKey
    }),
    dashboardModel.getDashboardFilterOptions()
  ]);

  return {
    dashboardData,
    dashboardFilters,
    dashboardFilterOptions,
    dashboardFilterConfig: getDashboardFilterConfig(dashboardKey),
    dashboardKey
  };
}

async function renderDashboardHome(req, res, next) {
  try {
    const dashboards = getAccessibleDashboards(res);

    if (dashboards.length === 1) {
      return res.redirect(`/dashboards/${encodeURIComponent(dashboards[0].key)}`);
    }

    const dashboardPayload = await buildDashboardPayload(req);

    return res.render('pages/dashboard', {
      pageTitle: 'Dashboard',
      currentNav: 'dashboard',
      dashboards,
      ...dashboardPayload
    });
  } catch (error) {
    next(error);
  }
}

async function renderDashboardSummary(req, res, next) {
  try {
    const dashboardPayload = await buildDashboardPayload(req);

    return res.render('fragments/dashboard-live-region', dashboardPayload);
  } catch (error) {
    next(error);
  }
}

async function renderRoleDashboard(req, res, next) {
  try {
    const dashboardKey = String(req.params.dashboardKey || '').trim();
    const dashboard = findDashboardByKey(res, dashboardKey);
    const canAccessDashboard = res.locals.canAccessDashboard;

    if (!dashboard || typeof canAccessDashboard !== 'function' || !canAccessDashboard(dashboard.key)) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Dashboard Not Found',
        requestedPath: req.originalUrl
      });
    }

    const dashboardPayload = await buildDashboardPayload(req, dashboard.key);

    return res.render('pages/role-dashboard', {
      pageTitle: dashboard.title,
      currentNav: `dashboard:${dashboard.key}`,
      dashboard,
      ...dashboardPayload
    });
  } catch (error) {
    next(error);
  }
}

async function renderRoleDashboardSummary(req, res, next) {
  try {
    const dashboardKey = String(req.params.dashboardKey || '').trim();
    const dashboard = findDashboardByKey(res, dashboardKey);
    const canAccessDashboard = res.locals.canAccessDashboard;

    if (!dashboard || typeof canAccessDashboard !== 'function' || !canAccessDashboard(dashboard.key)) {
      return res.status(404).render('fragments/dashboard-live-region', {
        dashboardData: {},
        dashboardFilters: dashboardModel.normalizeDashboardFilters({}),
        dashboardFilterOptions: {
          categories: [],
          lots: [],
          techUsers: []
        },
        dashboardFilterConfig: getDashboardFilterConfig(dashboardKey),
        dashboardKey,
        dashboardErrorMessage: 'This dashboard is not available for your account.'
      });
    }

    const dashboardPayload = await buildDashboardPayload(req, dashboard.key);

    return res.render('fragments/dashboard-live-region', dashboardPayload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderDashboardHome,
  renderDashboardSummary,
  renderRoleDashboard,
  renderRoleDashboardSummary
};
