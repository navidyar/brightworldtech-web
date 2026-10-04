'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
test('requirePermission uses the effective permission context and fails closed when context is absent', () => {
  const middleware = read('middleware/authMiddleware.js');

  assert.match(middleware, /function requirePermission\(permissionKey\)/);
  assert.match(middleware, /req\.currentPermissions instanceof Set \? req\.currentPermissions : new Set\(\)/);
  assert.match(middleware, /if \(!permissions\.has\(permissionKey\)\)[\s\S]*?status\(403\)\.render\('pages\/error'/);
  assert.match(middleware, /if \(!req\.currentUser\)[\s\S]*?redirect\('\/login'\)/);
  assert.match(middleware, /module\.exports = \{[\s\S]*?requirePermission/);
});

test('Login Activity route uses audit.login.view instead of the legacy Management role gate', () => {
  const routes = read('routes/management.js');
  const loginRoute = routes.match(/router\.get\(\s*'\/management\/login-activity',[\s\S]*?managementController\.renderLoginActivityPage\s*\);/);

  assert.ok(loginRoute, 'Login Activity route should exist');
  assert.match(loginRoute[0], /requirePermission\('audit\.login\.view'\)/);
  assert.doesNotMatch(loginRoute[0], /requireRole\(/);
});

test('Login Activity navigation follows the granular permission without exposing unrelated Management links', () => {
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(sidebar, /const canViewLoginAudit = typeof hasPermission === 'function' && hasPermission\('audit\.login\.view'\)/);
  assert.match(sidebar, /showAdminSection = canViewConfiguration \|\| canViewLoginAudit \|\| canViewPermissionAudit/);
  assert.equal((sidebar.match(/href="\/management\/login-activity"/g) || []).length, 1);
  assert.match(sidebar, /<% if \(canViewLoginAudit\) \{ %>[\s\S]*?href="\/management\/login-activity"/);
});

test('Login Activity uses the modern page heading and segmented summary instead of the legacy hero', () => {
  const page = read('views/pages/management-login-activity.ejs');
  const css = read('public/css/app.css');

  assert.match(page, /class="page-heading site-work-page-heading management-login-page-heading"/);
  assert.match(page, /class="site-summary-panel site-summary-panel--expanded management-login-summary-panel"/);
  assert.doesNotMatch(page, /dashboard-hero|hero-badge|management-summary-inline/);
  assert.match(page, /<small>Permission<\/small><strong>Login Audit<\/strong>/);
  assert.match(page, /hasPermission\('users\.view'\)[\s\S]*?Back to Users/);
  assert.doesNotMatch(css, /\.management-login-summary-card/);
  assert.match(css, /\.management-login-table-card table th,[\s\S]*?\.management-login-table-card table td \{[\s\S]*?vertical-align:\s*middle/);
});

test('recent live filters provide one-click Clear and keep search fields compact on desktop', () => {
  const users = read('views/pages/management-users.ejs');
  const roles = read('views/pages/management-roles-permissions.ejs');
  const roleModal = read('views/fragments/permission-role-manage-modal.ejs');
  const script = read('public/js/live-list-filter.js');
  const css = read('public/css/app.css');

  for (const markup of [users, roles, roleModal]) {
    assert.match(markup, /data-live-filter-clear>Clear<\/button>/);
  }
  assert.match(script, /const clear = root\.querySelector\('\[data-live-filter-clear\]'\)/);
  assert.match(script, /controls\.forEach\(\(control\) => \{\s*control\.value = '';\s*\}\);/);
  assert.match(css, /\.management-live-filter-search \{[\s\S]*?flex:\s*0 1 360px;[\s\S]*?max-width:\s*360px/);
  assert.match(css, /\.management-permission-audit-filter-form \.form-field:nth-child\(2\) \{[\s\S]*?max-width:\s*360px/);
});
