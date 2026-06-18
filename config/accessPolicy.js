const ROLE_HIERARCHY = [
  'admin',
  'management',
  'tech_lead',
  'tech'
];

const ACCOUNT_ROLE_CODES = [
  'admin',
  'management',
  'tech_lead',
  'tech'
];

const DASHBOARD_DEFINITIONS = [
  {
    key: 'admin',
    title: 'Admin Dashboard',
    menuLabel: 'Admin',
    kicker: 'System Administration',
    description: 'Full system access, global configuration, user controls, security, and operational oversight.',
    menuArea: 'admin',
    allowedRoles: ['admin'],
    accent: 'purple'
  },
  {
    key: 'management',
    title: 'Management Dashboard',
    menuLabel: 'Management',
    kicker: 'Management Overview',
    description: 'Overall operations, productivity, user metrics, approvals, and management reporting.',
    menuArea: 'management',
    allowedRoles: ['admin', 'management'],
    accent: 'blue'
  },
  {
    key: 'tech',
    title: 'Tech Dashboard',
    menuLabel: 'Tech',
    kicker: 'Tech Portal',
    description: 'Tech productivity, personal metrics, team averages, and unit progress.',
    menuArea: 'tech',
    allowedRoles: ['admin', 'management', 'tech_lead', 'tech'],
    accent: 'green'
  }
];

const MENU_AREAS = [
  {
    key: 'admin',
    label: 'Admin',
    allowedRoles: ['admin']
  },
  {
    key: 'management',
    label: 'Management',
    allowedRoles: ['admin', 'management']
  },
  {
    key: 'tech',
    label: 'Tech',
    allowedRoles: ['admin', 'management', 'tech_lead', 'tech']
  },
  {
    key: 'database',
    label: 'Database Check',
    allowedRoles: ['admin']
  }
];

function normalizeRoles(roleCodes) {
  if (!Array.isArray(roleCodes)) {
    return [];
  }

  return roleCodes.map((roleCode) => String(roleCode).trim()).filter(Boolean);
}

function getPrimaryRole(userRoleCodes) {
  const normalizedUserRoles = normalizeRoles(userRoleCodes);

  return ROLE_HIERARCHY.find((roleCode) => normalizedUserRoles.includes(roleCode)) || normalizedUserRoles[0] || '';
}

function getEffectiveRoles(userRoleCodes) {
  const primaryRole = getPrimaryRole(userRoleCodes);

  if (!primaryRole) {
    return [];
  }

  const primaryRoleIndex = ROLE_HIERARCHY.indexOf(primaryRole);

  if (primaryRoleIndex < 0) {
    return [primaryRole];
  }

  return ROLE_HIERARCHY.slice(primaryRoleIndex);
}

function hasAnyRole(userRoleCodes, allowedRoles) {
  const effectiveRoles = getEffectiveRoles(userRoleCodes);

  return effectiveRoles.some((roleCode) => allowedRoles.includes(roleCode));
}

function getDashboardDefinition(dashboardKey) {
  return DASHBOARD_DEFINITIONS.find((dashboard) => dashboard.key === dashboardKey) || null;
}

function canAccessDashboard(userRoleCodes, dashboardKey) {
  const dashboard = getDashboardDefinition(dashboardKey);

  if (!dashboard) {
    return false;
  }

  return hasAnyRole(userRoleCodes, dashboard.allowedRoles);
}

function canAccessMenuArea(userRoleCodes, menuAreaKey) {
  const menuArea = MENU_AREAS.find((area) => area.key === menuAreaKey);

  if (!menuArea) {
    return false;
  }

  return hasAnyRole(userRoleCodes, menuArea.allowedRoles);
}

function getAccessibleDashboards(userRoleCodes) {
  return DASHBOARD_DEFINITIONS.filter((dashboard) => canAccessDashboard(userRoleCodes, dashboard.key));
}

module.exports = {
  ROLE_HIERARCHY,
  ACCOUNT_ROLE_CODES,
  DASHBOARD_DEFINITIONS,
  MENU_AREAS,
  canAccessDashboard,
  canAccessMenuArea,
  getAccessibleDashboards,
  getDashboardDefinition,
  getEffectiveRoles,
  getPrimaryRole
};
