const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeUserListSort, sortUserRows } = require('../utils/managementUserSort');

const projectRoot = path.join(__dirname, '..');

function user(overrides = {}) {
  return {
    user_id: 1,
    first_name: 'Alpha',
    last_name: 'User',
    username: 'ALUS',
    primary_role_name: 'Tech',
    role_names: 'Tech',
    account_status_code: 'active',
    account_status_label: 'Active Account',
    has_password: true,
    latest_password_link_status: null,
    start_date: '2026-01-01',
    end_date: null,
    last_login_at: '2026-08-01T12:00:00Z',
    ...overrides
  };
}

test('management user sorting accepts only supported sort values', () => {
  assert.equal(normalizeUserListSort('role_za'), 'role_za');
  assert.equal(normalizeUserListSort('last_login_desc'), 'last_login_desc');
  assert.equal(normalizeUserListSort('DROP TABLE users'), 'user_az');
  assert.equal(normalizeUserListSort(''), 'user_az');
});

test('management users can sort by user and primary role', () => {
  const rows = [
    user({ user_id: 1, first_name: 'Zoe', last_name: 'Adams', primary_role_name: 'Tech' }),
    user({ user_id: 2, first_name: 'Amy', last_name: 'Brown', primary_role_name: 'Admin' }),
    user({ user_id: 3, first_name: 'Ben', last_name: 'Brown', primary_role_name: 'QC' })
  ];

  assert.deepEqual(
    sortUserRows(rows, { sort: 'user_az' }).map((row) => row.user_id),
    [2, 3, 1]
  );
  assert.deepEqual(
    sortUserRows(rows, { sort: 'user_za' }).map((row) => row.user_id),
    [1, 3, 2]
  );
  assert.deepEqual(
    sortUserRows(rows, { sort: 'role_az' }).map((row) => row.user_id),
    [2, 3, 1]
  );
});

test('employee sorting uses start date for active users and end date for inactive users', () => {
  const activeRows = [
    user({ user_id: 1, start_date: '2025-01-01' }),
    user({ user_id: 2, start_date: '2026-06-01' })
  ];
  const inactiveRows = [
    user({ user_id: 3, end_date: '2026-02-01' }),
    user({ user_id: 4, end_date: '2026-07-01' })
  ];

  assert.deepEqual(
    sortUserRows(activeRows, { sort: 'employee_desc', activeOnly: true }).map((row) => row.user_id),
    [2, 1]
  );
  assert.deepEqual(
    sortUserRows(inactiveRows, { sort: 'employee_desc', activeOnly: false }).map((row) => row.user_id),
    [4, 3]
  );
});

test('account setup and last-login sorting use the visible account state and login timestamp', () => {
  const rows = [
    user({ user_id: 1, account_status_code: 'pending_setup', account_status_label: 'Pending Setup', has_password: false, last_login_at: null }),
    user({ user_id: 2, account_status_code: 'active', account_status_label: 'Active Account', has_password: true, last_login_at: '2026-08-01T12:00:00Z' }),
    user({ user_id: 3, account_status_code: 'active', account_status_label: 'Active Account', has_password: true, last_login_at: '2026-08-20T12:00:00Z' })
  ];

  assert.equal(sortUserRows(rows, { sort: 'account_setup_asc' })[0].user_id, 2);
  assert.deepEqual(
    sortUserRows(rows, { sort: 'last_login_desc' }).map((row) => row.user_id),
    [3, 2, 1]
  );
});

test('management users view exposes only the requested sortable headers and reuses shared header styling', () => {
  const view = fs.readFileSync(path.join(projectRoot, 'views/pages/management-users.ejs'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public/css/work-area.css'), 'utf8');

  ['User', 'Primary Role', 'Employee', 'Account Setup', 'Last Login'].forEach((label) => {
    assert.match(view, new RegExp(`\\b${label.replace(' ', '\\s+')}\\b`));
  });
  assert.match(view, /table-sort-link/);
  assert.doesNotMatch(view, /<a[^>]*>\s*Actions\s*<\/a>/i);
  assert.match(css, /\.table-sort-link/);
});
