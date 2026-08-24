const USER_LIST_SORT_VALUES = new Set([
  'user_az',
  'user_za',
  'role_az',
  'role_za',
  'employee_asc',
  'employee_desc',
  'account_setup_asc',
  'account_setup_desc',
  'last_login_desc',
  'last_login_asc'
]);

function normalizeUserListSort(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return USER_LIST_SORT_VALUES.has(normalized) ? normalized : 'user_az';
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'base', numeric: true });
}

function compareDateValue(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
  return safeLeft - safeRight;
}

function compareUserIdentity(left, right) {
  return compareText(left.first_name, right.first_name)
    || compareText(left.last_name, right.last_name)
    || compareText(left.username, right.username)
    || Number(left.user_id || 0) - Number(right.user_id || 0);
}

function compareUserListRows(left, right, sort, activeOnly) {
  let result = 0;

  switch (sort) {
    case 'user_za':
      return -compareUserIdentity(left, right);
    case 'role_az':
    case 'role_za':
      result = compareText(left.primary_role_name || left.role_names || '', right.primary_role_name || right.role_names || '')
        || compareUserIdentity(left, right);
      return sort === 'role_za' ? -result : result;
    case 'employee_asc':
    case 'employee_desc': {
      const dateField = activeOnly === false ? 'end_date' : 'start_date';
      result = compareDateValue(left[dateField], right[dateField]) || compareUserIdentity(left, right);
      return sort === 'employee_desc' ? -result : result;
    }
    case 'account_setup_asc':
    case 'account_setup_desc': {
      const leftKey = `${left.account_status_code === 'active' ? '0' : '1'}|${left.has_password ? '0' : '1'}|${left.account_status_label || ''}|${left.latest_password_link_status || ''}`;
      const rightKey = `${right.account_status_code === 'active' ? '0' : '1'}|${right.has_password ? '0' : '1'}|${right.account_status_label || ''}|${right.latest_password_link_status || ''}`;
      result = compareText(leftKey, rightKey) || compareUserIdentity(left, right);
      return sort === 'account_setup_desc' ? -result : result;
    }
    case 'last_login_asc':
    case 'last_login_desc':
      result = compareDateValue(left.last_login_at, right.last_login_at) || compareUserIdentity(left, right);
      return sort === 'last_login_desc' ? -result : result;
    case 'user_az':
    default:
      return compareUserIdentity(left, right);
  }
}

function sortUserRows(rows, options = {}) {
  const activeOnly = options.activeOnly !== false;
  const sort = normalizeUserListSort(options.sort);
  return [...rows].sort((left, right) => compareUserListRows(left, right, sort, activeOnly));
}

module.exports = {
  normalizeUserListSort,
  sortUserRows
};
