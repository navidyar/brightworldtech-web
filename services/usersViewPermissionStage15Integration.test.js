'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, routePath) {
  const marker = `'${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `Missing route ${routePath}`);
  const blockStart = routes.lastIndexOf('router.', start);
  const next = routes.indexOf('\n);', start);
  assert.notEqual(next, -1, `Could not delimit route ${routePath}`);
  return routes.slice(blockStart, next + 3);
}

test('active and inactive Users lists require users.view instead of legacy userAdministration', () => {
  const routes = read('routes/management.js');
  for (const routePath of ['/management/users', '/management/users/inactive']) {
    const block = routeBlock(routes, routePath);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('Users creation, Edit, status, setup links, and deletion use their own permissions', () => {
  const routes = read('routes/management.js');
  const createBlock = routeBlock(routes, '/management/users/new');
  assert.match(createBlock, /requirePermission\('users\.view'\)/);
  assert.match(createBlock, /requirePermission\('users\.create'\)/);
  assert.doesNotMatch(createBlock, /requireFeature\('userAdministration'\)/);
  assert.match(routeBlock(routes, '/management/users/:userId/edit/modal'), /requirePermission\('users\.edit'\)/);
  assert.match(routeBlock(routes, '/management/users/:userId/setup-link/modal'), /requirePermission\('users\.setup_links\.manage'\)/);
  assert.match(routeBlock(routes, '/management/users/:userId/deactivate/modal'), /requirePermission\('users\.status\.manage'\)/);
  assert.match(routeBlock(routes, '/management/users/:userId/delete-pending/modal'), /requirePermission\('users\.delete'\)/);
});

test('Users navigation follows users.view and exposes the Admin section without unrelated permissions', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /const canViewUsers = [^;]*hasPermission\('users\.view'\)/);
  assert.match(sidebar, /showAdminSection = [^;]*canViewUsers/);
  assert.match(sidebar, /if \(canViewUsers\)[\s\S]*?href="\/management\/users"[\s\S]*?>Users</);
});

test('Users page exposes Create User, Edit, status, setup links, and deletion through their own permissions', () => {
  const page = read('views/pages/management-users.ejs');
  assert.match(page, /const canCreateUsers = [^;]*hasPermission\('users\.create'\)/);
  assert.match(page, /if \(canCreateUsers\)[\s\S]*?Create User/);
  assert.doesNotMatch(page, /canManageUsersLegacy/);
  assert.match(page, /hasPermission\('users\.edit'\)[\s\S]*?\/edit\/modal/);
  assert.match(page, /hasPermission\('users\.status\.manage'\)/);
  assert.match(page, /if \(canManageUserStatus\)[\s\S]*?(?:reactivate|deactivate)\/modal/);
  assert.match(page, /if \(!isInactiveView && canManageUserSetupLinks\)[\s\S]*?setup-link\/modal/);
  assert.match(page, /if \(canViewUserManagementAudit\)[\s\S]*?Account History/);
  assert.match(page, /if \(canDeleteUsers\)[\s\S]*?delete-pending\/modal/);
});
