const ROLE_HIERARCHY = [
  'admin',
  'management',
  'tech_lead',
  'qc',
  'tech'
];

const ROLE_EFFECTIVE_ROLES = Object.freeze({
  admin: Object.freeze(['admin', 'management', 'tech_lead', 'tech']),
  management: Object.freeze(['management', 'tech_lead', 'tech']),
  tech_lead: Object.freeze(['tech_lead', 'tech']),
  qc: Object.freeze(['qc']),
  tech: Object.freeze(['tech'])
});

const ACCOUNT_ROLE_CODES = [
  'admin',
  'management',
  'tech_lead',
  'qc',
  'tech'
];

const UNIT_BROWSER_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'qc', 'tech']);
const UNIT_PRODUCTION_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'tech']);
const UNIT_HISTORY_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'qc', 'tech']);
const QC_PORTAL_ROLE_CODES = Object.freeze(['admin', 'management', 'qc']);
const QC_REVIEW_ROLE_CODES = Object.freeze(['admin', 'management', 'qc']);
const QC_REPORTING_ROLE_CODES = Object.freeze(['admin', 'management']);
const UNIT_REQUEST_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'qc', 'tech']);

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
    allowedRoles: ['admin', 'management', 'tech_lead', 'qc', 'tech'],
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
    allowedRoles: ['admin', 'management', 'tech_lead', 'qc', 'tech']
  },
  {
    key: 'qc',
    label: 'QC Portal',
    allowedRoles: [...QC_PORTAL_ROLE_CODES]
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

  return ROLE_EFFECTIVE_ROLES[primaryRole]
    ? [...ROLE_EFFECTIVE_ROLES[primaryRole]]
    : [primaryRole];
}

function hasAnyRole(userRoleCodes, allowedRoles) {
  const effectiveRoles = getEffectiveRoles(userRoleCodes);

  return effectiveRoles.some((roleCode) => allowedRoles.includes(roleCode));
}

function hasAnyAssignedRole(userRoleCodes, allowedRoles) {
  const normalizedUserRoles = normalizeRoles(userRoleCodes);

  return normalizedUserRoles.some((roleCode) => allowedRoles.includes(roleCode));
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

function canAccessUnitRequests(userRoleCodes) {
  return hasAnyAssignedRole(userRoleCodes, UNIT_REQUEST_ROLE_CODES);
}

function canCreateOrEditTechUnits(userRoleCodes) {
  return hasAnyAssignedRole(userRoleCodes, UNIT_PRODUCTION_ROLE_CODES);
}

function getAccessibleDashboards(userRoleCodes) {
  return DASHBOARD_DEFINITIONS.filter((dashboard) => canAccessDashboard(userRoleCodes, dashboard.key));
}

module.exports = {
  ROLE_HIERARCHY,
  ROLE_EFFECTIVE_ROLES,
  ACCOUNT_ROLE_CODES,
  UNIT_BROWSER_ROLE_CODES,
  UNIT_PRODUCTION_ROLE_CODES,
  UNIT_HISTORY_ROLE_CODES,
  UNIT_REQUEST_ROLE_CODES,
  QC_PORTAL_ROLE_CODES,
  QC_REVIEW_ROLE_CODES,
  QC_REPORTING_ROLE_CODES,
  DASHBOARD_DEFINITIONS,
  MENU_AREAS,
  canAccessDashboard,
  canAccessMenuArea,
  canAccessUnitRequests,
  canCreateOrEditTechUnits,
  getAccessibleDashboards,
  getDashboardDefinition,
  getEffectiveRoles,
  getPrimaryRole,
  hasAnyAssignedRole
};
