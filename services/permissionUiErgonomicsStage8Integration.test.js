'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Permission Audit aligns its filters and vertically centers audit records through shared management CSS', () => {
  const page = read('views/pages/management-permission-audit.ejs');
  const css = read('public/css/app.css');

  assert.match(page, /class="management-login-filter-form management-permission-audit-filter-form"/);
  assert.match(page, /class="management-login-filter-actions"/);
  assert.match(page, /class="table-card management-permission-audit-table-card/);
  assert.match(css, /\.management-permission-audit-filter-form \.form-field:nth-child\(2\)[\s\S]*?flex:\s*0 1 360px[\s\S]*?max-width:\s*360px/);
  assert.match(css, /\.management-permission-audit-table-card th,[\s\S]*?\.management-permission-audit-table-card td\s*\{[\s\S]*?vertical-align:\s*middle/);
});

test('User management replaces the old large summary bubbles with a compact flat summary and live search filters', () => {
  const page = read('views/pages/management-users.ejs');
  const css = read('public/css/app.css');

  assert.doesNotMatch(page, /management-user-summary-card/);
  assert.match(page, /class="management-user-summary-inline"/);
  assert.match(page, /data-live-filter-control="search"/);
  assert.match(page, /data-live-filter-control="role"/);
  assert.match(page, /data-live-filter-row data-live-filter-search=/);
  assert.match(css, /:is\(\.management-user-summary-inline, \.management-summary-inline\) \{[\s\S]*?border-bottom:/);
  assert.doesNotMatch(css, /\.management-user-summary-card\s*\{/);
});

test('Roles & Permissions library supports live role search and status filtering', () => {
  const page = read('views/pages/management-roles-permissions.ejs');

  assert.match(page, /data-live-filter/);
  assert.match(page, /Search Roles/);
  assert.match(page, /data-live-filter-control="status"/);
  assert.match(page, /data-live-filter-search="<%= \[role\.name, role\.description, role\.code\]/);
  assert.match(page, /data-live-filter-empty hidden/);
});

test('Role Management modal supports permission search and approval filtering without changing permission semantics', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');

  assert.match(modal, /class="permission-role-permissions-form"[\s\S]*?data-live-filter/);
  assert.match(modal, /Search Permissions/);
  assert.match(modal, /data-live-filter-control="state"/);
  assert.match(modal, /value="approved">Approved/);
  assert.match(modal, /value="not-approved">Not Approved/);
  assert.match(modal, /data-live-filter-group/);
  assert.match(modal, /data-live-filter-state="<%= approved \? 'approved' : 'not-approved' %>"/);
});

test('User permission categories can apply Inherit Allow or Deny in bulk while keeping individual selects editable', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  const script = read('public/js/live-list-filter.js');

  assert.match(modal, /data-permission-override-group/);
  assert.match(modal, /Set Entire Category/);
  assert.match(modal, /data-permission-category-override/);
  assert.match(modal, /value="inherit">Inherit/);
  assert.match(modal, /value="allow">Allow/);
  assert.match(modal, /value="deny">Deny/);
  assert.match(modal, /data-permission-override-select/);
  assert.match(script, /querySelectorAll\('select\[data-permission-override-select\]:not\(:disabled\)'\)/);
  assert.match(script, /select\.value = value/);
});

test('shared live-list filtering initializes on full page load and HTMX modal swaps', () => {
  const head = read('views/partials/head.ejs');
  const script = read('public/js/live-list-filter.js');

  assert.match(head, /live-list-filter\.js\?v=20260930-[^\"]+/);
  assert.match(script, /document\.addEventListener\('htmx:afterSwap'/);
  assert.match(script, /terms\.every\(\(term\) => searchable\.includes\(term\)\)/);
  assert.match(script, /group\.hidden = groupRows\.length > 0 && !groupRows\.some/);
});


test('permission audit live validator closes the database pool so validation exits cleanly', () => {
  const validator = read('scripts/validatePermissionAuditUi.js');

  assert.match(validator, /const \{ pool \} = require\('\.\.\/models\/db'\)/);
  assert.match(validator, /\.finally\(async \(\) => \{[\s\S]*?await pool\.end\(\)/);
});
