'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('QC Reporting places Reviewer Activity before Technician Comparison', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const reviewer = page.indexOf('<h2>Reviewer Activity</h2>');
  const technician = page.indexOf('<h2>Technician Comparison</h2>');
  assert.ok(reviewer >= 0);
  assert.ok(technician >= 0);
  assert.ok(reviewer < technician);
});

test('Role Management and User Permissions expose Expand All and Collapse All controls', () => {
  for (const file of ['views/fragments/permission-role-manage-modal.ejs', 'views/fragments/permission-user-manage-modal.ejs']) {
    const markup = read(file);
    assert.match(markup, /data-permission-groups-expand>Expand All<\/button>/);
    assert.match(markup, /data-permission-groups-collapse>Collapse All<\/button>/);
  }
});

test('permission category controls toggle visible details and user save restores category state', () => {
  const script = read('public/js/live-list-filter.js');
  const userModal = read('views/fragments/permission-user-manage-modal.ejs');
  const roleScript = read('public/js/permission-role-management.js');
  assert.match(script, /details\[data-live-filter-group\]:not\(\[hidden\]\)/);
  assert.match(script, /group\.open = shouldOpen/);
  assert.match(userModal, /data-permission-group-key="<%= group\.name %>"/);
  assert.match(script, /captureUserPermissionState/);
  assert.match(script, /restoreUserPermissionState/);
  assert.match(roleScript, /openGroups/);
  assert.match(roleScript, /group\.open = openGroups\.has/);
});
