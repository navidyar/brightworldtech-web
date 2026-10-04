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

test('pending-user deletion modal and POST require users.view plus users.delete', () => {
  const routes = read('routes/management.js');
  for (const [method, routePath] of [
    ['get', '/management/users/:userId/delete-pending/modal'],
    ['post', '/management/users/:userId/delete-pending']
  ]) {
    const block = routeBlock(routes, method, routePath);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.match(block, /requirePermission\('users\.delete'\)/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  }
  const sharedGuard = routeBlock(routes, 'use', '/management/users/:userId');
  assert.match(sharedGuard, /requireProtectedAdminAccess/);
  assert.ok(routes.indexOf(sharedGuard) < routes.indexOf("'/management/users/:userId/delete-pending/modal'"));
});

test('Delete Pending User control follows users.delete and account eligibility', () => {
  const page = read('views/pages/management-users.ejs');
  assert.match(page, /const canDeleteUsers = [^;]*hasPermission\('users\.delete'\)/);
  const row = page.slice(page.indexOf('management-user-row-actions'));
  const permissionsStart = row.indexOf("<% if (typeof hasPermission === 'function' && hasPermission('roles.view')) { %>");
  const deleteStart = row.indexOf('<% if (canDeleteUsers) { %>');
  const setupStart = row.indexOf('<% if (!isInactiveView && canManageUserSetupLinks) { %>');
  assert.ok(permissionsStart >= 0 && deleteStart > permissionsStart && setupStart > deleteStart);
  const permissionsBlock = row.slice(permissionsStart, deleteStart);
  assert.doesNotMatch(permissionsBlock, /delete-pending\/modal/);
  const deleteBlock = row.slice(deleteStart, setupStart);
  assert.match(deleteBlock, /user\.can_delete_pending_setup/);
  assert.match(deleteBlock, /Number\(user\.user_id\) !== Number\(currentUserId\)/);
  assert.match(deleteBlock, /returnPath=inactive/);
  assert.match(deleteBlock, /returnPath=active/);
});

test('pending-user deletion retains protected, self-delete, and eligibility safeguards', () => {
  const controller = read('controllers/managementController.js');
  const modal = controller.slice(controller.indexOf('async function renderDeletePendingUserModal'), controller.indexOf('async function deactivateUser'));
  const action = controller.slice(controller.indexOf('async function deletePendingSetupUser'), controller.indexOf('module.exports'));
  const model = read('models/managementModel.js');
  const deletion = model.slice(model.indexOf('async function deletePendingSetupUser'), model.indexOf('async function', model.indexOf('async function deletePendingSetupUser') + 1));
  assert.match(modal, /userId === Number\(req\.currentUser\.user_id\)/);
  assert.match(action, /userId === Number\(req\.currentUser\.user_id\)/);
  assert.match(action, /reason === 'not_allowed'/);
  assert.match(action, /reason === 'has_links'/);
  assert.match(deletion, /assertProtectedAdminInvariant\(\{ userId: safeUserId, deleting: true \}\)/);
  assert.match(deletion, /ACCOUNT_PENDING_SETUP/);
  assert.match(deletion, /Number\(user\.has_password\) !== 1/);
  assert.match(deletion, /!user\.last_login_at/);
});
