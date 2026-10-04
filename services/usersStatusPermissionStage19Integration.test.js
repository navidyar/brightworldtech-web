'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function routeBlock(routes, routePath, method) {
  const marker = `router.${method}(\n  '${routePath}'`;
  const start = routes.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${method.toUpperCase()} ${routePath}`);
  const end = routes.indexOf('\n);', start);
  assert.notEqual(end, -1, `Could not delimit ${method.toUpperCase()} ${routePath}`);
  return routes.slice(start, end + 3);
}

test('deactivate and reactivate routes require users.view plus users.status.manage', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/users/:userId/deactivate/modal'],
    ['get', '/management/users/:userId/reactivate/modal'],
    ['post', '/management/users/:userId/deactivate'],
    ['post', '/management/users/:userId/reactivate']
  ]) {
    const block = routeBlock(routes, routePath, method);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.match(block, /requirePermission\('users\.status\.manage'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
});

test('Users row actions expose status controls from users.status.manage independently of legacy admin', () => {
  const page = read('views/pages/management-users.ejs');
  assert.match(page, /const canManageUserStatus = [^;]*hasPermission\('users\.status\.manage'\)/);
  assert.match(page, /if \(canManageUserStatus\)[\s\S]*?reactivate\/modal/);
  assert.match(page, /if \(canManageUserStatus\)[\s\S]*?deactivate\/modal/);
  assert.match(page, /if \(!isInactiveView && canManageUserSetupLinks\)[\s\S]*?setup-link\/modal/);
  assert.match(page, /if \(canDeleteUsers\)[\s\S]*?delete-pending\/modal/);
});

test('status migration preserves self-deactivation and protected-admin safeguards', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/managementController.js');
  assert.match(routes, /router\.use\(\s*'\/management\/users\/:userId'[\s\S]*?requireProtectedAdminAccess/);
  assert.match(controller, /if \(userId === Number\(req\.currentUser\.user_id\)\)/);
  assert.match(controller, /Users cannot deactivate their own signed-in account/);
});

test('Access Roles checkboxes keep a fixed size inside the Edit User modal', () => {
  const css = read('public/css/app.css');
  const rule = css.match(/#modal-root \.flat-form-modal \.management-user-modal-roles \.workflow-item input\[type="checkbox"\] \{[\s\S]*?\}/);
  assert.ok(rule, 'Expected dedicated Access Roles checkbox sizing rule');
  assert.match(rule[0], /flex: 0 0 18px/);
  assert.match(rule[0], /min-width: 18px/);
  assert.match(rule[0], /width: 18px/);
  assert.match(rule[0], /height: 18px/);
});
