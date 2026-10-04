const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('User Account History route requires the granular audit permission', () => {
  const routes = read('routes/management.js');
  const route = routes.match(/router\.get\(\s*'\/management\/users\/history',[\s\S]*?managementController\.renderUserHistoryPage\s*\);/);
  assert.ok(route, 'expected User Account History route');
  assert.match(route[0], /requirePermission\('audit\.user_management\.view'\)/);
  assert.doesNotMatch(route[0], /requireFeature\('userAdministration'\)/);
});

test('User Account History has permission-aware Admin navigation', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /canViewUserManagementAudit[\s\S]*hasPermission\('audit\.user_management\.view'\)/);
  assert.match(sidebar, /if \(canViewUserManagementAudit\)[\s\S]*href="\/management\/users\/history"[\s\S]*Account History/);
  assert.match(sidebar, /showAdminSection = [^;]*canViewUserManagementAudit/);
});

test('standalone Account History does not expose a Users link without users.view', () => {
  const controller = read('controllers/managementController.js');
  const page = read('views/pages/management-user-history.ejs');
  assert.match(controller, /pageTitle: 'Account History', currentNav: 'management-user-history'/);
  assert.match(page, /hasPermission\('users\.view'\)[\s\S]*href="\/management\/users"/);
});
