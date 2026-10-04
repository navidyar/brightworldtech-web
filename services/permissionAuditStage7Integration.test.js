'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Permission Audit routes require authentication but rely on the dedicated audit permission instead of legacy userAdministration', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /'\/management\/permission-audit'[\s\S]*?requireAuth[\s\S]*?renderPermissionAuditPage/);
  assert.match(routes, /'\/management\/permission-audit\/:eventId\/modal'[\s\S]*?requireAuth[\s\S]*?renderPermissionAuditEventModal/);

  const pageRoute = routes.match(/router\.get\(\s*'\/management\/permission-audit',[\s\S]*?\n\);/);
  assert.ok(pageRoute);
  assert.doesNotMatch(pageRoute[0], /requireFeature\('userAdministration'\)|requireRole\(/);
});

test('Permission Audit navigation is visible from the granular audit permission without exposing unrelated Admin links', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /canViewPermissionAudit[\s\S]*hasPermission\('audit\.permissions\.view'\)/);
  assert.match(sidebar, /showAdminSection = canAccessMenuArea\('admin'\) \|\| canViewConfiguration \|\| canViewLoginAudit \|\| canViewPermissionAudit/);
  assert.match(sidebar, /if \(canViewConfiguration\)[\s\S]*Configuration/);
  assert.match(sidebar, /if \(canViewPermissionAudit\)[\s\S]*Permission Audit/);
});

test('Permission Audit page reuses existing management table, form, action, and modal patterns', () => {
  const page = read('views/pages/management-permission-audit.ejs');
  const modal = read('views/fragments/permission-audit-event-modal.ejs');
  assert.match(page, /class="content-card"/);
  assert.match(page, /class="management-login-filter-form management-permission-audit-filter-form"/);
  assert.match(page, /class="table-card/);
  assert.match(page, /hx-target="#modal-root"/);
  assert.match(modal, /class="modal-backdrop"/);
  assert.match(modal, /class="modal-panel site-clean-modal management-user-history-modal"/);
  assert.match(modal, /Before \/ After/);
});

test('Permission Audit supports event filtering, search, pagination, and target user context', () => {
  const model = read('models/permissionManagementModel.js');
  const page = read('views/pages/management-permission-audit.ejs');
  assert.match(model, /eventType = null, search = ''/);
  assert.match(model, /LEFT JOIN users target_user/);
  assert.match(model, /target_user\.email LIKE \?/);
  assert.match(page, /name="eventType"/);
  assert.match(page, /name="search"/);
  assert.match(page, /Previous/);
  assert.match(page, /Next/);
});

test('Permission Audit service enforces audit.permissions.view for both list and detail access', () => {
  const service = read('services/permissionManagementService.js');
  assert.match(service, /async function listPermissionAuditEvents[\s\S]*requirePermission\(actorPermissions, 'audit\.permissions\.view'\)/);
  assert.match(service, /async function getPermissionAuditEvent[\s\S]*requirePermission\(actorPermissions, 'audit\.permissions\.view'\)/);
});
