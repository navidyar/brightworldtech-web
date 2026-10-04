'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Roles & Permissions read access uses roles.view while mutations keep dedicated permission gates', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /permissionManagementController/);
  assert.match(routes, /'\/management\/roles-permissions'[\s\S]*?requirePermission\('roles\.view'\)[\s\S]*?renderRolesPermissionsPage/);
  assert.match(routes, /roles-permissions\/:roleId\/details[\s\S]*?requirePermission\('roles\.edit'\)/);
  assert.match(routes, /roles-permissions\/:roleId\/permissions[\s\S]*?requirePermission\('role_permissions\.manage'\)/);
  assert.match(routes, /roles-permissions\/:roleId\/delete[\s\S]*?requirePermission\('roles\.delete'\)/);
});

test('other role gates remain while user overrides use granular access', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /requireRole\(/);
  assert.match(routes, /requirePermission\('user_permissions\.manage'\)/);
});

test('role UI models defaults as Approved or Not Approved with no role-level deny state', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  assert.match(modal, /Checked means Approved\. Unchecked means Not Approved\./);
  assert.match(modal, /name="permissionKeys"/);
  assert.doesNotMatch(modal, /name="permissionKeys"[^>]*value="deny"/i);
});

test('role UI exposes generic create rename duplicate deactivate and delete behavior with transitional safeguards', () => {
  const page = read('views/pages/management-roles-permissions.ejs');
  const createModal = read('views/fragments/permission-role-create-modal.ejs');
  const duplicateModal = read('views/fragments/permission-role-duplicate-modal.ejs');
  const deleteModal = read('views/fragments/permission-role-delete-modal.ejs');

  assert.match(createModal, /The new role starts with no default permissions/);
  assert.match(duplicateModal, /independent copy of the role's current default permissions/);
  const manageModal = read('views/fragments/permission-role-manage-modal.ejs');
  assert.match(page, /manage\/modal/);
  assert.match(manageModal, /Save Role Details/);
  assert.match(manageModal, /name="isActive"/);
  assert.match(page, /Legacy Gate/);
  assert.match(deleteModal, /replacementRoleIds/);
  assert.match(deleteModal, /removeAssignments/);
  assert.match(deleteModal, /permission audit history remains preserved/i);
});

test('Super Admin is visibly permanent and the sidebar exposes Roles & Permissions only with roles.view', () => {
  const page = read('views/pages/management-roles-permissions.ejs');
  const manageModal = read('views/fragments/permission-role-manage-modal.ejs');
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(page, /Permanent/);
  assert.match(manageModal, /Super Admin permanently retains every active permission/);
  assert.match(sidebar, /hasPermission\('roles\.view'\)/);
  assert.match(sidebar, /Roles &amp; Permissions/);
});

test('security.super_admin.manage remains read-only in the UI unless the actor already has that authority', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  const service = read('services/permissionManagementService.js');

  assert.match(modal, /permission\.permission_key === 'security\.super_admin\.manage'/);
  assert.match(modal, /hasPermission\('security\.super_admin\.manage'\)/);
  assert.match(service, /hadSuperAdminManagement !== willHaveSuperAdminManagement/);
});
