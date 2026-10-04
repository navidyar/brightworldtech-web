'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, routePath, method = 'get') {
  const marker = `router.${method}(\n  '${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `missing ${method.toUpperCase()} ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `unterminated route ${routePath}`);
  return routes.slice(start, end + 3);
}

test('Roles & Permissions page and Manage modal require roles.view without legacy userAdministration', () => {
  const routes = read('routes/management.js');
  for (const routePath of [
    '/management/roles-permissions',
    '/management/roles-permissions/:roleId/manage/modal'
  ]) {
    const block = routeBlock(routes, routePath);
    assert.match(block, /requirePermission\('roles\.view'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('role mutations layer dedicated permissions on top of roles.view', () => {
  const routes = read('routes/management.js');
  const expectations = [
    ['get', '/management/roles-permissions/new/modal', ['roles.view', 'roles.create']],
    ['post', '/management/roles-permissions/new/modal', ['roles.view', 'roles.create']],
    ['post', '/management/roles-permissions/:roleId/details', ['roles.view', 'roles.edit']],
    ['post', '/management/roles-permissions/:roleId/permissions', ['roles.view', 'role_permissions.manage']],
    ['get', '/management/roles-permissions/:roleId/duplicate/modal', ['roles.view', 'roles.create', 'role_permissions.manage']],
    ['post', '/management/roles-permissions/:roleId/duplicate/modal', ['roles.view', 'roles.create', 'role_permissions.manage']],
    ['get', '/management/roles-permissions/:roleId/delete/modal', ['roles.view', 'roles.delete']],
    ['post', '/management/roles-permissions/:roleId/delete', ['roles.view', 'roles.delete']]
  ];

  for (const [method, routePath, permissionKeys] of expectations) {
    const block = routeBlock(routes, routePath, method);
    for (const permissionKey of permissionKeys) {
      assert.match(block, new RegExp(`requirePermission\\('${permissionKey.replace('.', '\\.')}'\\)`));
    }
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('Admin navigation exposes Roles & Permissions and Users from their independent read permissions', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /const canViewRolesPermissions = [^;]*hasPermission\('roles\.view'\)/);
  assert.match(sidebar, /showAdminSection = [^;]*canViewRolesPermissions/);
  assert.match(sidebar, /if \(canViewRolesPermissions\)[\s\S]*?Roles &amp; Permissions/);
  assert.match(sidebar, /const canViewUsers = [^;]*hasPermission\('users\.view'\)/);
  assert.match(sidebar, /if \(canViewUsers\)[\s\S]*?>Users</);
});

test('read-only role workspace keeps write controls permission-aware', () => {
  const page = read('views/pages/management-roles-permissions.ejs');
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  assert.match(page, /hasPermission\('roles\.create'\)/);
  assert.match(modal, /hasPermission\('roles\.edit'\)/);
  assert.match(modal, /hasPermission\('role_permissions\.manage'\)/);
  assert.match(modal, /hasPermission\('roles\.delete'\)/);
  assert.match(modal, /hasAllPermissions\(\['roles\.create', 'role_permissions\.manage'\]\)/);
});
