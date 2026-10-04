'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('each user permission category uses the same two-column list as a role category', () => {
  const roleModal = read('views/fragments/permission-role-manage-modal.ejs');
  const userModal = read('views/fragments/permission-user-manage-modal.ejs');
  const css = read('public/css/app.css');
  assert.match(roleModal, /class="permission-role-permission-list"/);
  assert.match(userModal, /class="permission-role-permission-list permission-user-permission-list"/);
  assert.match(css, /\.permission-role-permission-list\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.permission-role-permission-list\s*\{\s*grid-template-columns: 1fr/);
});

test('user permission cards preserve role sources, effective state, editable overrides, and bulk actions', () => {
  const modal = read('views/fragments/permission-user-manage-modal.ejs');
  const script = read('public/js/live-list-filter.js');
  assert.match(modal, /data-live-filter-group/);
  assert.match(modal, /data-live-filter-row/);
  assert.match(modal, /permission\.roleSources\.forEach/);
  assert.match(modal, /permission\.effectiveAllowed \? 'good' : 'muted'/);
  assert.match(modal, /name="overrideEffects\[<%= permission\.permission_key %>\]" data-permission-override-select/);
  assert.match(modal, /<% if \(readOnly\) \{ %>[\s\S]*?type="hidden" name="overrideEffects/);
  assert.match(modal, /data-permission-category-override/);
  assert.match(script, /select\[data-permission-override-select\]:not\(:disabled\)/);
});
