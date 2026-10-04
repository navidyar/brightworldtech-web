'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('role library stays compact and Manage opens a dedicated role workspace modal', () => {
  const page = read('views/pages/management-roles-permissions.ejs');
  const routes = read('routes/management.js');
  const controller = read('controllers/permissionManagementController.js');
  const modal = read('views/fragments/permission-role-manage-modal.ejs');

  assert.match(page, /roles-permissions\/<%= role\.role_id %>\/manage\/modal/);
  assert.match(page, />Manage<\/a>/);
  assert.doesNotMatch(page, /permission-role-editor-sections/);
  assert.match(routes, /roles-permissions\/:roleId\/manage\/modal[\s\S]*renderRoleManageModal/);
  assert.match(controller, /renderRoleManageModalContent/);
  assert.match(modal, /permission-role-manage-layout/);
  assert.match(modal, /Role Details/);
  assert.match(modal, /Default Permissions/);
});

test('role management modal is wide and viewport-responsive without sticky modal chrome', () => {
  const css = read('public/css/app.css');
  const featuresCss = read('public/css/features.css');

  assert.match(css, /\.modal-panel\.site-clean-modal\.permission-role-manage-modal[^{]*\{[\s\S]*?width:\s*min\(1320px, calc\(100vw - 36px\)\)/);
  assert.match(css, /\.permission-role-manage-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(260px, 320px\) minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.permission-role-manage-layout,[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(featuresCss, /Global modal natural-scroll contract/);
  assert.match(featuresCss, /#modal-root \.modal-panel > :is\([\s\S]*?position: static !important/);
});

test('role detail and permission saves refresh the open Manage modal through HTMX', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  const controller = read('controllers/permissionManagementController.js');

  assert.match(modal, /hx-post="\/management\/roles-permissions\/<%= safeRole\.role_id %>\/details"/);
  assert.match(modal, /hx-post="\/management\/roles-permissions\/<%= safeRole\.role_id %>\/permissions"/);
  assert.match(modal, /hx-target="#modal-root"/);
  assert.match(controller, /noticeMessage: 'Role details saved\.'/);
  assert.match(controller, /noticeMessage: 'Default permissions saved\.'/);
});

test('user create and edit surfaces support true multi-role checkbox assignment', () => {
  const createModal = read('views/fragments/management-user-create-modal.ejs');
  const editModal = read('views/fragments/management-user-edit-modal.ejs');
  const createPage = read('views/pages/management-user-new.ejs');
  const usersPage = read('views/pages/management-users.ejs');

  for (const view of [createModal, editModal, createPage]) {
    assert.match(view, /Access Roles/);
    assert.match(view, /type="checkbox"[^>]*name="roleCodes"/);
    assert.doesNotMatch(view, /type="radio"[^>]*name="roleCodes"/);
  }
  assert.match(usersPage, /Multiple Roles/);
  assert.match(usersPage, /users may receive multiple roles/i);
  assert.match(usersPage, /role_count/);
});

test('controller preserves multiple roles and loads assignable roles without requiring roles.view', () => {
  const controller = read('controllers/managementController.js');

  assert.match(controller, /return \[\.\.\.new Set\(submittedRoleCodes\)\]/);
  assert.doesNotMatch(controller, /ROLE_HIERARCHY\.find\([\s\S]*submittedRoleCodes/);
  assert.match(controller, /if \(!canAssignRoles\(req\)\) return \[\];/);
  assert.match(controller, /permissionManagementModel\.listRoles\(\)/);
  assert.match(controller, /role\.system_key !== 'super_admin'/);
  assert.match(controller, /assignmentLocked: true/);
});

test('user creation persists every submitted role instead of slicing to a primary role', () => {
  const authModel = read('models/authModel.js');

  assert.match(authModel, /const assignedRoleCodes = Array\.isArray\(roleCodes\)/);
  assert.match(authModel, /for \(const roleCode of assignedRoleCodes\)/);
  assert.doesNotMatch(authModel, /roleCodes\.slice\(0, 1\)/);
});

test('user role changes continue writing the established account audit and permission audit trails', () => {
  const authModel = read('models/authModel.js');
  const managementModel = read('models/managementModel.js');

  assert.match(authModel, /permissionManagementModel\.writeAuditEvent[\s\S]*eventType: 'user_roles_replaced'/);
  assert.match(managementModel, /permissionManagementModel\.writeAuditEvent[\s\S]*eventType: 'user_roles_replaced'/);
  assert.match(managementModel, /action: changes\.roles \? 'user_roles_updated' : 'user_profile_updated'/);
});

test('Users read and creation access use granular permissions', () => {
  const routes = read('routes/management.js');

  const usersList = routes.match(/router\.get\(\s*'\/management\/users',[\s\S]*?\);/)[0];
  const createUser = routes.match(/router\.get\(\s*'\/management\/users\/new',[\s\S]*?\);/)[0];
  assert.match(usersList, /requirePermission\('users\.view'\)/);
  assert.match(createUser, /requirePermission\('users\.view'\)/);
  assert.match(createUser, /requirePermission\('users\.create'\)/);
  assert.doesNotMatch(createUser, /requireFeature\('userAdministration'\)/);
  assert.match(routes, /'\/management\/roles-permissions'[\s\S]*?requirePermission\('roles\.view'\)/);
  assert.match(routes, /requireRole\(/);
});
