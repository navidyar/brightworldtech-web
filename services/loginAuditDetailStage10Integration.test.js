'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Login Activity exposes every recorded successful sign-in for one user/day in a permission-gated modal', () => {
  const routes = read('routes/management.js');
  const model = read('models/managementModel.js');
  const controller = read('controllers/managementController.js');
  const page = read('views/pages/management-login-activity.ejs');
  const modal = read('views/fragments/management-login-activity-user-modal.ejs');

  const modalRoute = routes.match(/router\.get\(\s*'\/management\/login-activity\/:userId\/modal',[\s\S]*?managementController\.renderLoginActivityUserModal\s*\);/);
  assert.ok(modalRoute, 'per-user login activity modal route should exist');
  assert.match(modalRoute[0], /requirePermission\('audit\.login\.view'\)/);
  assert.doesNotMatch(modalRoute[0], /requireRole\(/);

  assert.match(model, /async function listUserLoginActivityForDay\(\{ userId, startAt, endAt \}\)/);
  assert.match(model, /WHERE ula\.user_id = \?[\s\S]*?ula\.logged_in_at >= \?[\s\S]*?ula\.logged_in_at < \?/);
  assert.match(model, /ORDER BY[\s\S]*?ula\.logged_in_at ASC,[\s\S]*?ula\.user_login_activity_id ASC/);
  assert.match(controller, /managementModel\.listUserLoginActivityForDay\(\{ userId, \.\.\.dayRange \}\)/);
  assert.match(page, /View Day/);
  assert.match(page, /hx-get="\/management\/login-activity\/<%= activity\.user_id %>\/modal\?date=/);
  assert.match(modal, /every recorded successful sign-in/);
  assert.match(modal, /safeActivity\.forEach\(\(entry, index\) =>/);
  assert.match(modal, /Role at Sign-in/);
});

test('Login Activity date selection submits immediately without a View Activity button', () => {
  const page = read('views/pages/management-login-activity.ejs');
  assert.match(page, /data-auto-submit-filter-form/);
  assert.match(page, /id="login-activity-date"[\s\S]*?data-auto-submit-filter="immediate"/);
  assert.doesNotMatch(page, />View Activity</);
});

test('Permission Audit filters refresh while the user types or changes event type without an Apply button', () => {
  const page = read('views/pages/management-permission-audit.ejs');
  const script = read('public/js/auto-submit-filters.js');

  assert.match(page, /data-auto-submit-filter-form/);
  assert.match(page, /data-auto-submit-filter-target="\.management-permission-audit-results-section"/);
  assert.match(page, /name="eventType" data-auto-submit-filter="immediate"/);
  assert.match(page, /name="search"[\s\S]*?data-auto-submit-filter="debounced"/);
  assert.match(page, /class="management-permission-audit-results-section"/);
  assert.doesNotMatch(page, />Apply</);
  assert.match(script, /data-auto-submit-filter="debounced"/);
  assert.match(script, /window\.history\.replaceState/);
});

test('User Permissions opens with every category collapsed and supports live permission search', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  const script = read('public/js/live-list-filter.js');
  const head = read('views/partials/head.ejs');

  assert.match(modal, /class="permission-user-overrides-form"[\s\S]*?data-live-filter[\s\S]*?data-live-filter-open-groups="search"/);
  assert.match(modal, /Search Permissions/);
  assert.match(modal, /data-live-filter-control="search"/);
  assert.match(modal, /data-live-filter-clear>Clear<\/button>/);
  assert.match(modal, /data-live-filter-group/);
  assert.match(modal, /data-live-filter-row/);
  assert.doesNotMatch(modal, /<details[^>]*\sopen(?:\s|>|=)/);
  assert.match(script, /autoOpenSearchGroups = root\.dataset\.liveFilterOpenGroups === 'search'/);
  assert.match(script, /group\.open = true/);
  assert.match(script, /group\.open = false/);
  assert.match(head, /live-list-filter\.js\?v=20260930-audit-detail-live-filter-stage10/);
});
