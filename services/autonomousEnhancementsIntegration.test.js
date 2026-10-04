'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { businessDaysSince, getLoginInactivityState } = require('./loginInactivityPolicy');
const { normalizePrinterInput } = require('./labelPrinterPolicy');
const { isKnownPermission } = require('../config/permissionCatalog');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('login inactivity triggers only after more than five business days', () => {
  const friday = new Date('2026-09-18T12:00:00Z');
  assert.equal(businessDaysSince(friday, new Date('2026-09-25T12:00:00Z')), 5);
  assert.equal(businessDaysSince(friday, new Date('2026-09-28T12:00:00Z')), 6);
  assert.equal(getLoginInactivityState({ monitored: true, isActive: true, accountStatusCode: 'active', lastLoginAt: friday, now: new Date('2026-09-28T12:00:00Z') }).overdue, true);
  assert.equal(getLoginInactivityState({ monitored: false, isActive: true, accountStatusCode: 'active', lastLoginAt: friday, now: new Date('2026-09-28T12:00:00Z') }).overdue, false);
});

test('login inactivity is a role/user effective permission', () => {
  assert.equal(isKnownPermission('users.login_inactivity.monitor'), true);
  const usersPage = read('views/pages/management-users.ejs');
  assert.match(usersPage, /login_inactivity_overdue/);
  assert.match(usersPage, /business days/);
});

test('printer alias is cosmetic and remains separate from registered printer name', () => {
  const data = normalizePrinterInput({ displayName: 'Brother QL-810W 01', aliasLabel: 'Macho Man', hostAddress: '192.168.10.50', protocolCode: 'raw_9100', port: 9100 }, { scope: 'solo' });
  assert.equal(data.displayName, 'Brother QL-810W 01');
  assert.equal(data.aliasLabel, 'Macho Man');
  assert.equal(data.hostAddress, '192.168.10.50');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  assert.match(form, /name="aliasLabel"/);
  assert.match(form, /never changes ownership/);
});

test('Tool PIN remains separate from browser password authentication', () => {
  const api = read('controllers/apiAuthController.js');
  const browser = read('controllers/authController.js');
  const routes = read('routes/auth.js');
  assert.match(api, /req\.body\?\.pin/);
  assert.match(api, /tool_pin_hash/);
  assert.match(api, /TOOL_PIN_LOCKED/);
  const browserLogin = browser.slice(browser.indexOf('async function login('), browser.indexOf('async function renderOwnToolPinModal('));
  assert.doesNotMatch(browserLogin, /toolPin|tool_pin|req\.body.*pin/);
  assert.match(routes, /\/account\/tool-pin/);
  assert.match(routes, /tools\.unit_api\.use/);
  assert.match(read('views/partials/topbar.ejs'), /Tool PIN|account\/tool-pin/);
});

test('Huddle administration uses the three-state queue and configurable resolution-based archive timing', () => {
  const model = read('models/virtualHuddleModel.js');
  const page = read('views/pages/management-virtual-huddle.ejs');
  assert.match(model, /DEFAULT_HUDDLE_ARCHIVE_DAYS/);
  assert.match(model, /getApplicationSettings\(\)/);
  for (const status of ['pending', 'acknowledged', 'archived']) assert.match(model, new RegExp(`statusFilter === '${status}'`));
  assert.doesNotMatch(model, /statusFilter === 'revoked'|statusFilter === 'active'/);
  assert.match(model, /m\.subject LIKE/);
  assert.match(page, /Pending/);
  assert.match(page, /Acknowledged/);
  assert.match(page, /Archived/);
  assert.doesNotMatch(page, /\['revoked', 'Revoked'\]|\['active', 'All Active'\]/);
  assert.match(page, /Search Huddles/);
  assert.match(page, /Message Type/);
});

test('legacy nested guidance/dashboard hero are removed and unpinned sidebar is discoverable', () => {
  const users = read('views/pages/management-users.ejs');
  const dashboard = read('views/pages/dashboard.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  const sidebarJs = read('public/js/sidebar.js');
  assert.doesNotMatch(users, /How Deactivation Works|management-user-guidance/);
  assert.doesNotMatch(dashboard, /dashboard-hero/);
  assert.doesNotMatch(dashboard, /hero-badge/);
  assert.match(dashboard, /admin-dashboard-access-list/);
  assert.match(sidebar, /sidebar-edge-handle/);
  assert.match(sidebar, /<svg viewBox=/);
  assert.match(sidebarJs, /bwtdallas-sidebar-handle-y/);
  assert.match(sidebarJs, /pointermove/);
});


test('Huddle filters submit one message type and queue rows keep acknowledgment detail in the modal', () => {
  const page = read('views/pages/management-virtual-huddle.ejs');
  const js = read('public/js/virtual-huddle-management.js');
  assert.match(js, /requestSubmit/);
  assert.doesNotMatch(js, /createElement\('input'\)[\s\S]*messageType/);
  assert.doesNotMatch(page, /Acknowledged<\/dt>|Outstanding \/ Revoked|acknowledged_count/);
  assert.match(page, /virtual-huddle-message-sent/);
});

test('user create and edit surfaces expose inactivity controls and signup Tool PIN', () => {
  const create = read('views/fragments/management-user-create-modal.ejs');
  const edit = read('views/fragments/management-user-edit-modal.ejs');
  const controller = read('controllers/managementController.js');
  assert.match(create, /name="loginInactivityMode"/);
  assert.match(create, /name="toolPin"/);
  assert.match(create, /name="confirmToolPin"/);
  assert.match(edit, /name="loginInactivityMode"/);
  assert.match(controller, /setUserPermissionOverride/);
  assert.match(controller, /argon2\.hash\(toolPin/);
});

test('printer modal uses an aligned printer-specific grid and the sidebar handle uses red contrast', () => {
  const form = read('views/fragments/label-printer-form-modal.ejs');
  const css = read('public/css/app.css');
  assert.match(form, /label-printer-form-grid/);
  assert.match(form, /label-printer-grid-note/);
  assert.match(css, /\.sidebar-edge-handle[\s\S]*background: var\(--red\)/);
});
