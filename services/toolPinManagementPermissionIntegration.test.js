'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isKnownPermission } = require('../config/permissionCatalog');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Manage Tool PINs is a distinct catalog permission', () => {
  assert.equal(isKnownPermission('users.tool_pin.manage'), true);
  const catalog = read('config/permissionCatalog.js');
  assert.match(catalog, /users\.tool_pin\.manage'[\s\S]*?'Users'[\s\S]*?'Manage Tool PINs'/);
});

test('existing-user Tool PIN management has independent protected routes', () => {
  const routes = read('routes/management.js');
  for (const route of [
    '/management/users/:userId/tool-pin/modal',
    '/management/users/:userId/tool-pin'
  ]) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = routes.match(new RegExp(`router\\.(?:get|post)\\(\\s*'${escaped}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, /requirePermission\('users\.view'\)/);
    assert.match(block, /requirePermission\('users\.tool_pin\.manage'\)/);
  }
});

test('Create User exposes and accepts Tool PIN only with Manage Tool PINs', () => {
  const controller = read('controllers/managementController.js');
  const page = read('views/pages/management-user-new.ejs');
  const modal = read('views/fragments/management-user-create-modal.ejs');
  assert.match(controller, /function canManageToolPins\(req\)[\s\S]*?users\.tool_pin\.manage/);
  assert.match(controller, /canManageToolPinsOnCreate[\s\S]*?validateOptionalToolPin/);
  assert.match(controller, /You do not have permission to manage Tool PINs/);
  for (const markup of [page, modal]) {
    assert.match(markup, /if \(canManageToolPinsOnCreate\)[\s\S]*?name="toolPin"[\s\S]*?name="confirmToolPin"/);
  }
});

test('Users page exposes dedicated Tool PIN action only to authorized managers', () => {
  const users = read('views/pages/management-users.ejs');
  const modal = read('views/fragments/management-user-tool-pin-modal.ejs');
  assert.match(users, /hasPermission\('users\.tool_pin\.manage'\)[\s\S]*?\/tool-pin\/modal/);
  assert.match(modal, /Register Tool PIN|Reset Tool PIN/);
  assert.match(modal, /Remove Tool PIN/);
  assert.match(modal, /cannot be used to sign into the BWTDallas website/);
});

test('Tool PIN self-service is separate from Manage Tool PINs and requires own-PIN plus Tool API access', () => {
  const routes = read('routes/auth.js');
  const topbar = read('views/partials/topbar.ejs');
  assert.match(routes, /account\/tool-pin\/modal[\s\S]*users\.tool_pin\.self_manage[\s\S]*tools\.unit_api\.use/);
  assert.match(routes, /account\/tool-pin'[\s\S]*users\.tool_pin\.self_manage[\s\S]*tools\.unit_api\.use/);
  assert.doesNotMatch(routes, /account\/tool-pin[\s\S]{0,180}users\.tool_pin\.manage/);
  assert.match(topbar, /hasPermission\('users\.tool_pin\.self_manage'\)[\s\S]*hasPermission\('tools\.unit_api\.use'\)[\s\S]*Tool PIN[\s\S]*account-modal-root/);
});

test('migration seeds permission and grants it only to Admin and Super Admin by default', () => {
  const migration = read('scripts/migrateToolPinManagementPermission.js');
  assert.match(migration, /PERMISSION_KEY = 'users\.tool_pin\.manage'/);
  assert.match(migration, /DEFAULT_ROLE_CODES = Object\.freeze\(\['admin', 'super_admin'\]\)/);
  assert.match(migration, /INSERT IGNORE INTO role_permissions/);
  assert.doesNotMatch(migration, /management.*DEFAULT_ROLE_CODES/);
});
