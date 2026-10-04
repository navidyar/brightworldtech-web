'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('users.create no longer has an implicit roles.view dependency', () => {
  const controller = read('controllers/managementController.js');
  assert.match(controller, /async function listUserCreationRoleChoices\(req\)[\s\S]*?!canAssignRoles\(req\)[\s\S]*?return \[\][\s\S]*?permissionManagementModel\.listRoles\(\)/);
  const createStart = controller.indexOf('async function renderNewUserPage');
  const createEnd = controller.indexOf('async function renderEditUserModal');
  const createFlow = controller.slice(createStart, createEnd);
  assert.match(createFlow, /listUserCreationRoleChoices\(req\)/);
  assert.doesNotMatch(createFlow, /permissionManagementService\.listRoles/);
  assert.match(createFlow, /requireRole: canAssignRolesOnCreate/);
  assert.match(createFlow, /You do not have permission to assign roles while creating a user/);
});

test('legacy tech-role routes are fronted by granular permission guards', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /router\.use\('\/unit-requests', requireAuth, requirePermission\('requests\.view'\)\)/);
  assert.match(routes, /router\.use\('\/tech\/printers', requireAuth, requirePermission\('printers\.solo\.manage'\)\)/);
  assert.match(routes, /router\.use\('\/tech\/units', requireAuth, requirePermission\('units\.view'\)\)/);
  assert.match(routes, /router\.use\('\/tech\/unit-catalog-requests', requireAuth, requirePermission\('catalog_requests\.submit'\)\)/);
  assert.match(routes, /router\.use\('\/tech\/print-queue', requireAuth, requirePermission\('labels\.print'\)\)/);
  assert.match(routes, /'\/label-printers\/events',[\s\S]*?requirePermission\('printers\.solo\.manage'\)[\s\S]*?requireRole\(techRoles\)/);
});

test('Tech navigation follows granular permissions instead of role membership alone', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /hasPermission\('units\.view'\)/);
  assert.match(sidebar, /hasPermission\('printers\.solo\.manage'\)/);
  assert.match(sidebar, /hasPermission\('requests\.view'\)/);
  assert.match(sidebar, /if \(canViewUnits\)[\s\S]*?>Units</);
  assert.match(sidebar, /if \(canManageOwnPrinters\)[\s\S]*?>My Printers</);
  assert.match(sidebar, /if \(canViewRequests\)[\s\S]*?>Requests</);
});

test('My Huddles history is permission-controlled while required delivery remains authenticated baseline', () => {
  const routes = read('routes/virtualHuddle.js');
  assert.match(routes, /router\.get\('\/my-huddles', requireAuth, requirePermission\('huddle\.personal\.view'\), virtualHuddleController\.renderMyHuddles\)/);
  assert.match(routes, /router\.get\('\/virtual-huddle\/current', requireAuth, virtualHuddleController\.renderCurrentPresentation\)/);
  assert.match(routes, /router\.post\('\/virtual-huddle\/recipients\/:recipientId\/acknowledge', requireAuth, virtualHuddleController\.acknowledge\)/);
});

test('Create User templates hide role assignment unless roles.assign is effective', () => {
  for (const relativePath of ['views/fragments/management-user-create-modal.ejs', 'views/pages/management-user-new.ejs']) {
    const view = read(relativePath);
    assert.match(view, /if \(canAssignRolesOnCreate\)/);
    assert.match(view, /created without roles/);
  }
});
