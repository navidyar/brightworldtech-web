'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { getPermissionDefinition } = require('../config/permissionCatalog');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

test('Tech Dashboard cross-user selector is controlled by a dedicated permission', () => {
  const definition = getPermissionDefinition('dashboards.tech.team_metrics.view');
  assert.ok(definition);
  assert.equal(definition.name, 'View Team Tech Metrics');
  const model = read('models/dashboardModel.js');
  const controller = read('controllers/dashboardController.js');
  assert.match(model, /permissions\.has\('dashboards\.tech\.team_metrics\.view'\)/);
  assert.doesNotMatch(model.match(/function isElevatedTechDashboardViewer[\s\S]*?\n}/)?.[0] || '', /roles\.includes/);
  assert.match(controller, /currentPermissions: req\.currentPermissions instanceof Set/);
  for (const role of ['admin', 'management', 'tech_lead', 'super_admin']) {
    assert.equal(LEGACY_ROLE_GRANTS[role].includes('dashboards.tech.team_metrics.view'), true, role);
  }
  for (const role of ['tech', 'qc']) {
    assert.equal(LEGACY_ROLE_GRANTS[role].includes('dashboards.tech.team_metrics.view'), false, role);
  }
});

test('dashboard home redirects directly to a permitted named dashboard instead of rendering the generic aggregator', () => {
  const controller = read('controllers/dashboardController.js');
  const home = controller.match(/async function renderDashboardHome[\s\S]*?\n}\n\nasync function renderDashboardSummary/)?.[0] || '';
  assert.match(home, /dashboard\.key === 'admin'/);
  assert.match(home, /dashboard\.key === 'management'/);
  assert.match(home, /dashboard\.key === 'tech'/);
  assert.match(home, /res\.redirect\(`\/dashboards\/\$\{encodeURIComponent\(preferredDashboard\.key\)\}`\)/);
  assert.doesNotMatch(home, /res\.render\('pages\/dashboard'/);
});

test('User Permissions modal uses a compact flat role context instead of a large Assigned Roles section', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  const css = read('public/css/app.css');
  assert.match(modal, /permission-user-context-strip/);
  assert.match(modal, /Role grants combine; user Deny overrides take precedence/);
  assert.doesNotMatch(modal, /site-clean-section permission-user-role-summary/);
  assert.match(css, /\.permission-user-context-strip \{[\s\S]*?padding: 8px 0 10px/);
});
