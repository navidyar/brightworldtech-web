'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const accessPolicy = require('../config/accessPolicy');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
const { attachAccessLocals } = require('../middleware/accessMiddleware');

test('dashboard definitions map directly to granular view permissions', () => {
  const permissionByDashboard = Object.fromEntries(
    accessPolicy.DASHBOARD_DEFINITIONS.map((dashboard) => [dashboard.key, dashboard.permissionKey])
  );

  assert.deepEqual(permissionByDashboard, {
    admin: 'dashboards.admin.view',
    management: 'dashboards.management.view',
    tech: 'dashboards.tech.view'
  });
});

test('runtime dashboard discovery uses effective permissions instead of assigned roles', () => {
  const effectivePermissions = new Set(['dashboards.management.view']);
  const res = {
    locals: {
      currentRoles: ['custom_role_without_legacy_dashboard_hierarchy'],
      hasPermission: (permissionKey) => effectivePermissions.has(permissionKey)
    }
  };

  let nextCalled = false;
  attachAccessLocals({}, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.locals.canAccessDashboard('admin'), false);
  assert.equal(res.locals.canAccessDashboard('management'), true);
  assert.equal(res.locals.canAccessDashboard('tech'), false);
  assert.deepEqual(res.locals.getAccessibleDashboards().map((dashboard) => dashboard.key), ['management']);
});

test('dashboard routes and home selection no longer depend on the legacy Operations Dashboard feature or primary role', () => {
  const routes = read('routes/dashboard.js');
  const controller = read('controllers/dashboardController.js');

  assert.match(routes, /'\/dashboard\/summary',[\s\S]*?requirePermission\('dashboards\.admin\.view'\)/);
  assert.doesNotMatch(routes, /requireFeature\('operationsDashboard'\)/);

  assert.match(controller, /dashboard\.key === 'admin'/);
  assert.match(controller, /dashboard\.key === 'management'/);
  assert.match(controller, /dashboard\.key === 'tech'/);
  assert.match(controller, /status\(403\)[\s\S]*?You do not have permission to access a dashboard/);
  assert.doesNotMatch(controller, /getPrimaryRole|operationsDashboard|requireFeature/);
});

test('role dashboard page and summary authorization remain server-side through canAccessDashboard', () => {
  const controller = read('controllers/dashboardController.js');

  const accessChecks = controller.match(/!dashboard \|\| typeof canAccessDashboard !== 'function' \|\| !canAccessDashboard\(dashboard\.key\)/g) || [];
  assert.equal(accessChecks.length, 2);
});

test('legacy role grants preserve existing dashboard access during migration', () => {
  const has = (role, permissionKey) => LEGACY_ROLE_GRANTS[role].includes(permissionKey);

  assert.equal(has('admin', 'dashboards.admin.view'), true);
  assert.equal(has('admin', 'dashboards.management.view'), true);
  assert.equal(has('admin', 'dashboards.tech.view'), true);

  assert.equal(has('management', 'dashboards.admin.view'), false);
  assert.equal(has('management', 'dashboards.management.view'), true);
  assert.equal(has('management', 'dashboards.tech.view'), true);

  for (const role of ['tech_lead', 'qc', 'tech']) {
    assert.equal(has(role, 'dashboards.admin.view'), false, `${role} should not gain the Admin dashboard`);
    assert.equal(has(role, 'dashboards.management.view'), false, `${role} should not gain the Management dashboard`);
    assert.equal(has(role, 'dashboards.tech.view'), true, `${role} should retain the Tech dashboard`);
  }
});
