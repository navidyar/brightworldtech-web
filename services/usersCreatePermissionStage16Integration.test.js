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
  assert.notEqual(start, -1, `Missing ${method.toUpperCase()} ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `Could not delimit ${method.toUpperCase()} ${routePath}`);
  return routes.slice(start, end + 3);
}

test('Create User page and POST layer users.create on top of users.view', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/users/new'],
    ['post', '/management/users']
  ]) {
    const block = routeBlock(routes, routePath, method);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.match(block, /requirePermission\('users\.create'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('Users page shows Create User from users.create and existing-user links from their own permission', () => {
  const page = read('views/pages/management-users.ejs');
  assert.match(page, /const canCreateUsers = [^;]*hasPermission\('users\.create'\)/);
  assert.match(page, /if \(canCreateUsers\)[\s\S]*?\/management\/users\/new[\s\S]*?Create User/);
  assert.doesNotMatch(page, /canManageUsersLegacy/);
  assert.match(page, /hasPermission\('users\.edit'\)[\s\S]*?\/edit\/modal/);
  assert.match(page, /if \(!isInactiveView && canManageUserSetupLinks\)[\s\S]*?setup-link\/modal/);
});

test('pending-user deletion uses users.delete after the deletion migration', () => {
  const routes = read('routes/management.js');
  assert.match(routeBlock(routes, '/management/users/:userId/delete-pending/modal'), /requirePermission\('users\.delete'\)/);
});
