'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('role permission save stays in the HTMX modal and is excluded from global page reload broadcasts', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  const middleware = read('middleware/applicationLiveRefreshMiddleware.js');

  assert.match(modal, /hx-post="\/management\/roles-permissions\/<%= safeRole\.role_id %>\/permissions"/);
  assert.match(modal, /hx-target="#modal-root"/);
  assert.match(middleware, /roles-permissions\\\/\\d\+\\\/permissions\$\/|roles-permissions\\\/\\d\+\\\/permissions/);
});

test('role permission modal preserves expanded groups, filters, and scroll position after save', () => {
  const modal = read('views/fragments/permission-role-manage-modal.ejs');
  const page = read('views/pages/management-roles-permissions.ejs');
  const script = read('public/js/permission-role-management.js');

  assert.match(modal, /data-permission-group-key/);
  assert.match(modal, /data-role-approved-summary/);
  assert.match(page, /data-role-permission-count/);
  assert.match(page, /permission-role-management\.js\?v=/);
  assert.match(script, /capturePermissionState/);
  assert.match(script, /openGroups/);
  assert.match(script, /group\.open = openGroups\.has/);
  assert.match(script, /searchValue/);
  assert.match(script, /stateValue/);
  assert.match(script, /scrollTop/);
  assert.match(script, /syncRoleLibraryPermissionCount/);
});
