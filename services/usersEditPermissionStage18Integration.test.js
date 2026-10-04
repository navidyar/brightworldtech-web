const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('existing-user Edit routes require users.view and users.edit without legacy userAdministration', () => {
  const routes = read('routes/management.js');
  const editGet = routes.match(/router\.get\(\s*'\/management\/users\/:userId\/edit\/modal'[\s\S]*?\);/)[0];
  const editPost = routes.match(/router\.post\(\s*'\/management\/users\/:userId\/edit\/modal'[\s\S]*?\);/)[0];
  for (const route of [editGet, editPost]) {
    assert.match(route, /requirePermission\('users\.view'\)/);
    assert.match(route, /requirePermission\('users\.edit'\)/);
    assert.doesNotMatch(route, /requireFeature\('userAdministration'\)/);
  }
  const sharedGuard = routes.match(/router\.use\(\s*'\/management\/users\/:userId'[\s\S]*?\);/)[0];
  assert.doesNotMatch(sharedGuard, /userAdministration/);
  assert.match(sharedGuard, /requireProtectedAdminAccess/);
});


test('roles.assign can load edit role choices without also requiring roles.view', () => {
  const controller = read('controllers/managementController.js');
  const helper = controller.match(/async function listRoleAdministrationChoices[\s\S]*?\n}/)[0];
  assert.match(helper, /if \(!canAssignRoles\(req\)\) return \[\];/);
  assert.match(helper, /permissionManagementModel\.listRoles\(\)/);
  assert.doesNotMatch(helper, /permissionManagementService\.listRoles/);
});

test('users.edit without roles.assign preserves roles and uses profile-only update', () => {
  const controller = read('controllers/managementController.js');
  assert.match(controller, /const canEditRoles = canAssignRoles\(req\) && !roleEditingLocked;/);
  assert.match(controller, /const validRoleCodes = canEditRoles[\s\S]*?: existingRoleCodes;/);
  assert.match(controller, /requireRole: canEditRoles/);
  assert.match(controller, /if \(!canEditRoles\) \{\s*await managementModel\.updateUserProfile/);
  assert.match(controller, /else \{\s*await managementModel\.updateUserWithRoles/);
});

test('Edit control follows users.edit while role assignment UI follows roles.assign', () => {
  const usersPage = read('views/pages/management-users.ejs');
  const editModal = read('views/fragments/management-user-edit-modal.ejs');
  assert.match(usersPage, /hasPermission\('users\.edit'\)/);
  assert.doesNotMatch(usersPage, /hasPermission\('users\.edit'\)\) \|\| canManageUsersLegacy/);
  assert.match(usersPage, />Edit<\/a>/);
  assert.match(editModal, /const canEditRoleAssignments = Boolean\(canEditRoles\)/);
  assert.match(editModal, /if \(canEditRoleAssignments \|\| isRoleEditingLocked\)/);
});

test('permission-override mutation uses user_permissions.manage with read prerequisites', () => {
  const routes = read('routes/management.js');
  const route = routes.match(/router\.post\(\s*'\/management\/users\/:userId\/permissions\/modal'[\s\S]*?\);/)[0];
  assert.match(route, /requirePermission\('users\.view'\)/);
  assert.match(route, /requirePermission\('roles\.view'\)/);
  assert.match(route, /requirePermission\('user_permissions\.manage'\)/);
  assert.doesNotMatch(route, /requireFeature\('userAdministration'\)/);
});
