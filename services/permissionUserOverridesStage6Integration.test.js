'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('user management exposes a dedicated permission workspace without crowding the edit-user form', () => {
  const usersPage = read('views/pages/management-users.ejs');
  const routes = read('routes/management.js');
  const modal = read('views/fragments/permission-user-manage-modal.ejs');

  assert.match(usersPage, /users\/<%= user\.user_id %>\/permissions\/modal/);
  assert.match(usersPage, />Permissions<\/a>/);
  assert.match(routes, /users\/:userId\/permissions\/modal[\s\S]*renderUserPermissionModal/);
  assert.match(routes, /users\/:userId\/permissions\/modal[\s\S]*updateUserPermissionOverrides/);
  assert.match(modal, /Assigned Roles/);
  assert.match(modal, /User Override/);
  assert.match(modal, /Effective/);
  assert.doesNotMatch(read('views/fragments/management-user-edit-modal.ejs'), /overrideEffects\[/);
});

test('user permission workspace uses Inherit Allow Deny and explains inherited role sources', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');

  assert.match(modal, /value="inherit"/);
  assert.match(modal, /value="allow"/);
  assert.match(modal, /value="deny"/);
  assert.match(modal, /permission\.roleSources/);
  assert.match(modal, /permission\.effectiveAllowed/);
  assert.match(modal, /Save User Overrides/);
  assert.match(modal, /Super Admin users retain all role-assignable authority permissions/);
});

test('role library and user permission cards use the shared modal and CSS ecosystem', () => {
  const css = read('public/css/app.css');
  const modal = read('views/fragments/permission-user-manage-modal.ejs');

  assert.match(css, /\.permission-role-table table th,[\s\S]*?\.permission-role-table table td\s*\{[\s\S]*?vertical-align:\s*middle/);
  assert.match(css, /\.modal-panel\.site-clean-modal\.permission-role-manage-modal,[\s\S]*?\.modal-panel\.site-clean-modal\.permission-user-manage-modal[\s\S]*?width:\s*min\(1320px, calc\(100vw - 36px\)\)/);
  assert.match(modal, /class="permission-role-permission-list permission-user-permission-list"/);
  assert.match(modal, /class="form-field permission-user-override-field"/);
  assert.doesNotMatch(modal, /<style[\s>]/i);
});

test('user permission cards keep descriptions stacked and use the role grid at desktop widths', () => {
  const css = read('public/css/app.css');
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  const head = read('views/partials/head.ejs');

  assert.match(css, /\.permission-role-permission-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.permission-role-permission-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /\.permission-user-permission-row\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(modal, /class="permission-user-permission-title"><%= permission\.name %><\/div>\s*<div class="permission-user-permission-description"><%= permission\.description %><\/div>\s*<code class="permission-user-permission-key"><%= permission\.permission_key %><\/code>/);
  assert.match(head, /app\.css\?v=[^\"']+/);
});

test('user permission workspace keeps Save and Close in one shared modal footer row', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');

  assert.match(modal, /id="permission-user-overrides-form-<%= safeUser\.user_id %>"/);
  assert.match(modal, /class="site-clean-actions permission-role-manage-footer"[\s\S]*?Save User Overrides[\s\S]*?data-modal-close>Close<\/button>/);
  assert.match(modal, /form="permission-user-overrides-form-<%= safeUser\.user_id %>"/);
  assert.doesNotMatch(modal, /class="form-actions"><button class="primary-button" type="submit">Save User Overrides/);
});

test('Stage 6 service computes effective permissions and saves override changes through the audited service layer', () => {
  const service = read('services/permissionManagementService.js');
  const controller = read('controllers/permissionManagementController.js');

  assert.match(service, /getUserPermissionAdministrationState/);
  assert.match(service, /resolveEffectivePermissions/);
  assert.match(service, /replaceUserPermissionOverrides/);
  assert.match(service, /eventType: afterEffect === null \? 'user_permission_override_removed' : 'user_permission_override_set'/);
  assert.match(controller, /normalizeOverrideEntriesFromBody/);
  assert.match(controller, /replaceUserPermissionOverrides/);
});

test('Super Admin user overrides remain protected and security authority changes remain separately guarded', () => {
  const service = read('services/permissionManagementService.js');
  const modal = read('views/fragments/permission-user-manage-modal.ejs');

  assert.match(service, /SUPER_ADMIN_OVERRIDE_PROTECTED/);
  assert.match(service, /entry\.permissionKey === 'security\.super_admin\.manage'/);
  assert.match(service, /requirePermission\(actorPermissions, 'security\.super_admin\.manage'\)/);
  assert.match(modal, /securityLocked/);
  assert.match(modal, /Requires Super Admin management authority/);
});

test('Users read and override workspace access use granular permissions', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /'\/management\/users'[\s\S]*?requirePermission\('users\.view'\)/);
  assert.match(routes, /users\/:userId\/permissions\/modal[\s\S]*?requirePermission\('roles\.view'\)/);
  assert.match(routes, /requireRole\(/);
});
