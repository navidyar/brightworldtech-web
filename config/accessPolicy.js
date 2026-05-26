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
    description: 'Overall operations, productivity, user metrics, approvals, configuration, and management reporting.',
    menuArea: 'management',
    allowedRoles: ['admin', 'management'],
    accent: 'blue'
  },
  {
    key: 'tech-lead',
    title: 'Tech Lead Dashboard',
    menuLabel: 'Tech Lead',
    kicker: 'Lead Monitoring',
    description: 'Team productivity, tech performance, takeover approvals, lot progress, and daily monitoring.',
    menuArea: 'tech',
    allowedRoles: ['admin', 'management', 'tech_lead'],
    accent: 'green'
  },
  {
    key: 'tech',
    title: 'Tech Dashboard',
    menuLabel: 'Tech',
    kicker: 'Tech Portal',
    description: 'Individual tech work, assigned workflow activity, support tasks, and unit progress.',
    menuArea: 'tech',
    allowedRoles: ['admin', 'management', 'tech_lead', 'tech'],
    accent: 'green'
  },
  {
    key: 'qc',
    title: 'QC Dashboard',
    menuLabel: 'QC',
    kicker: 'Quality Control',
    description: 'QC checks, scoring, unit review, accuracy tracking, and weighted QC productivity.',
    menuArea: 'qc',
    allowedRoles: ['admin', 'management', 'tech_lead', 'qc'],
    accent: 'yellow'
  },
  {
    key: 'packing',
    title: 'Packing Dashboard',
    menuLabel: 'Packing',
    kicker: 'Packing Workflow',
    description: 'Packaging, boxed units, wrapped pallets, ready-to-ship statuses, and support work.',
    menuArea: 'packing',
    allowedRoles: ['admin', 'management', 'tech_lead', 'packing'],
    accent: 'orange'
  },
  {
    key: 'warehouse',
    title: 'Warehouse Dashboard',
    menuLabel: 'Warehouse',
    kicker: 'Warehouse Operations',
    description: 'Future warehouse inventory, pallet, rack, shelf, bin, and scan-batch workflows.',
    menuArea: 'warehouse',
    allowedRoles: ['admin', 'management', 'warehouse'],
    accent: 'slate'
  },
  {
    key: 'sales',
    title: 'Sales Dashboard',
    menuLabel: 'Sales',
    kicker: 'Sales Operations',
    description: 'Future sales lots, customer lots, sales status, shipping, delivery, and sales reporting.',
    menuArea: 'sales',
    allowedRoles: ['admin', 'management', 'sales'],
    accent: 'red'
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
    key: 'qc',
    label: 'QC',
    allowedRoles: ['admin', 'management', 'tech_lead', 'qc']
  },
  {
    key: 'packing',
    label: 'Packing',
    allowedRoles: ['admin', 'management', 'tech_lead', 'packing']
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    allowedRoles: ['admin', 'management', 'warehouse']
  },
  {
    key: 'sales',
    label: 'Sales',
    allowedRoles: ['admin', 'management', 'sales']
  },
  {
    key: 'database',
    label: 'Database Check',
    allowedRoles: ['admin', 'management']
  }
];

function normalizeRoles(roleCodes) {
  if (!Array.isArray(roleCodes)) {
    return [];
  }

  return roleCodes.map((roleCode) => String(roleCode).trim()).filter(Boolean);
}

function hasAnyRole(userRoleCodes, allowedRoles) {
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

function getAccessibleDashboards(userRoleCodes) {
  return DASHBOARD_DEFINITIONS.filter((dashboard) => canAccessDashboard(userRoleCodes, dashboard.key));
}

module.exports = {
  DASHBOARD_DEFINITIONS,
  MENU_AREAS,
  canAccessDashboard,
  canAccessMenuArea,
  getAccessibleDashboards,
  getDashboardDefinition
};