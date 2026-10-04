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

test('permission workspace reads require users.view and roles.view without legacy Admin', () => {
  const routes = read('routes/management.js');
  const get = routeBlock(routes, 'get', '/management/users/:userId/permissions/modal');
  assert.match(get, /requireAuth/);
  assert.match(get, /requirePermission\('users\.view'\)/);
  assert.match(get, /requirePermission\('roles\.view'\)/);
  assert.doesNotMatch(get, /user_permissions\.manage|userAdministration/);
  const sharedGuard = routeBlock(routes, 'use', '/management/users/:userId');
  assert.match(sharedGuard, /requireProtectedAdminAccess/);
  assert.ok(routes.indexOf(sharedGuard) < routes.indexOf("'/management/users/:userId/permissions/modal'"));
});

test('override POST requires user_permissions.manage with the read prerequisites', () => {
  const routes = read('routes/management.js');
  const post = routeBlock(routes, 'post', '/management/users/:userId/permissions/modal');
  for (const key of ['users.view', 'roles.view', 'user_permissions.manage']) {
    assert.match(post, new RegExp(`requirePermission\\('${key.replace('.', '\\.')}\'\\)`));
  }
  assert.doesNotMatch(post, /userAdministration/);
  const service = read('services/permissionManagementService.js');
  const mutation = service.slice(service.indexOf('async function replaceUserPermissionOverrides'), service.indexOf('async function getUserAccessProfile'));
  assert.match(mutation, /requirePermission\(actorPermissions, 'user_permissions\.manage'\)/);
  assert.match(mutation, /SUPER_ADMIN_OVERRIDE_PROTECTED/);
  assert.match(mutation, /security\.super_admin\.manage/);
  assert.match(mutation, /writeAuditEvent/);
});

test('Users page offers the read-only workspace by roles.view and modal gates save controls', () => {
  const page = read('views/pages/management-users.ejs');
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  assert.doesNotMatch(page, /canManageUsersLegacy|canAccessFeature\('userAdministration'\)/);
  const row = page.slice(page.indexOf('management-user-row-actions'));
  const start = row.indexOf("<% if (typeof hasPermission === 'function' && hasPermission('roles.view')) { %>");
  assert.ok(start >= 0);
  assert.match(row.slice(start, row.indexOf('<% } %>', start)), /permissions\/modal/);
  assert.match(modal, /if \(canManageOverrides && !isSuperAdmin\)/);
  assert.match(modal, /Save User Overrides/);
});
