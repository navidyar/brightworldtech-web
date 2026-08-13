'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('admin role dashboard omits the generic metric-card rows while other dashboard foundation consumers retain them', () => {
  const liveRegion = read('views/fragments/dashboard-live-region.ejs');
  const foundation = read('views/fragments/dashboard-foundation.ejs');

  assert.match(liveRegion, /dashboard-foundation', \{ dashboardData, dashboardKey \}/);
  assert.match(foundation, /if \(dashboardKey !== 'admin'\)/);
  assert.match(foundation, /Units Loaded/);
  assert.match(foundation, /Pending Overrides/);
});

test('management role dashboard no longer renders the redundant Current Management Areas section', () => {
  const roleDashboard = read('views/pages/role-dashboard.ejs');

  assert.doesNotMatch(roleDashboard, /Current Management Areas/);
  assert.doesNotMatch(roleDashboard, /Management Tools/);
  assert.doesNotMatch(roleDashboard, /Create users, edit users, assign roles/);
  assert.match(roleDashboard, /dashboard-live-region/);
});
