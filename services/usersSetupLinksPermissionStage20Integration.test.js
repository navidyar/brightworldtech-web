'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, method, routePath) {
  const marker = `router.${method}(\n  '${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${method.toUpperCase()} ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `Could not delimit ${method.toUpperCase()} ${routePath}`);
  return routes.slice(start, end + 3);
}

test('existing-user setup/reset-link modal and generation require users.view and users.setup_links.manage', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/users/:userId/setup-link/modal'],
    ['post', '/management/users/:userId/setup-link']
  ]) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.match(block, /requirePermission\('users\.setup_links\.manage'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('the Users row shows setup/reset links only for active users with the effective permission', () => {
  const page = read('views/pages/management-users.ejs');
  assert.match(page, /const canManageUserSetupLinks = [^;]*hasPermission\('users\.setup_links\.manage'\)/);
  const start = page.indexOf('<% if (!isInactiveView && canManageUserSetupLinks) { %>');
  const end = page.indexOf('<% } %>', start);
  assert.ok(start >= 0 && end > start, 'Expected a separate active-user setup-link guard');
  const action = page.slice(start, end);
  assert.match(action, /setup-link\/modal\?returnPath=active/);
  assert.match(action, /user\.has_password \? 'Generate Reset Link' : 'Generate Setup Link'/);
  const permissionsStart = page.indexOf("<% if (typeof hasPermission === 'function' && hasPermission('roles.view')) { %>", page.indexOf('management-user-row-actions'));
  assert.ok(permissionsStart >= 0 && permissionsStart < start);
  assert.doesNotMatch(page.slice(permissionsStart, start), /setup-link\/modal/);
});

test('protected-user guard and inactive-account rejection still cover existing-user links', () => {
  const routes = read('routes/management.js');
  const sharedGuard = routeBlock(routes, 'use', '/management/users/:userId');
  assert.match(sharedGuard, /requireProtectedAdminAccess/);
  assert.ok(routes.indexOf(sharedGuard) < routes.indexOf("'/management/users/:userId/setup-link/modal'"));
  const controller = read('controllers/managementController.js');
  const start = controller.indexOf('async function createSetupLinkForExistingUser');
  const end = controller.indexOf('async function renderDeactivateUserModal', start);
  const action = controller.slice(start, end);
  assert.match(action, /if \(!user\.is_active\)/);
  assert.match(action, /password_link_blocked/);
});

test('new-user creation keeps its own users.create gate and initial link flow', () => {
  const routes = read('routes/management.js');
  const create = routeBlock(routes, 'post', '/management/users');
  assert.match(create, /requirePermission\('users\.create'\)/);
  assert.doesNotMatch(create, /users\.setup_links\.manage/);
  const controller = read('controllers/managementController.js');
  assert.match(controller, /async function createUser[\s\S]*?createSetupLinkForUser\(/);
});
