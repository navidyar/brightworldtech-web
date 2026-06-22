const { pool } = require('./db');

const schemaTableCache = new Map();
const schemaColumnCache = new Map();

const REPORTING_TIME_ZONE = 'America/Chicago';

function padTwo(value) {
  return String(value).padStart(2, '0');
}

function formatDateKeyFromParts(year, month, day) {
  return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

function parseDateKey(dateKey) {
  const normalized = normalizeDate(dateKey);

  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split('-').map(Number);

  return { year, month, day };
}

function addDaysToDateKey(dateKey, days) {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return '';
  }

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + Number(days || 0)));

  return formatDateKeyFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

function getCentralDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function getTimeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = partMap.hour === '24' ? '00' : partMap.hour;
  const localAsUtc = Date.UTC(
    Number(partMap.year),
    Number(partMap.month) - 1,
    Number(partMap.day),
    Number(hour),
    Number(partMap.minute),
    Number(partMap.second)
  );

  return localAsUtc - date.getTime();
}

function zonedDateTimeToUtc(dateKey, hour = 0, minute = 0, second = 0) {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return null;
  }

  const localAsUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute, second);
  let utcDate = new Date(localAsUtc - getTimeZoneOffsetMs(REPORTING_TIME_ZONE, new Date(localAsUtc)));
  utcDate = new Date(localAsUtc - getTimeZoneOffsetMs(REPORTING_TIME_ZONE, utcDate));

  return utcDate;
}

function formatSqlDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear(),
    padTwo(date.getUTCMonth() + 1),
    padTwo(date.getUTCDate())
  ].join('-') + ' ' + [
    padTwo(date.getUTCHours()),
    padTwo(date.getUTCMinutes()),
    padTwo(date.getUTCSeconds())
  ].join(':');
}

function getDateKeyDayOfWeek(dateKey) {
  const parsed = parseDateKey(dateKey);

  if (!parsed) {
    return 0;
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

function getWeekdayWorkWindow(dateKey) {
  const safeDateKey = normalizeDate(dateKey) || getCentralDateKey();
  const dayOfWeek = getDateKeyDayOfWeek(safeDateKey);
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = addDaysToDateKey(safeDateKey, offsetToMonday);
  const endDate = addDaysToDateKey(startDate, 6);

  return { startDate, endDate };
}

function getMonthWindow(dateKey) {
  const parsed = parseDateKey(dateKey || getCentralDateKey());

  if (!parsed) {
    return getMonthWindow(getCentralDateKey());
  }

  const startDate = formatDateKeyFromParts(parsed.year, parsed.month, 1);
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  const endDate = formatDateKeyFromParts(parsed.year, parsed.month, lastDay);

  return { startDate, endDate };
}

function normalizeMonth(value) {
  const stringValue = String(value || '').trim();

  if (!/^\d{4}-\d{2}$/.test(stringValue)) {
    return '';
  }

  return stringValue;
}

function normalizeWeek(value) {
  const stringValue = String(value || '').trim();

  if (!/^\d{4}-W\d{2}$/.test(stringValue)) {
    return '';
  }

  return stringValue;
}

function normalizeManagementPeriod(value) {
  const safeValue = String(value || '').trim();
  const periodAliases = {
    to_date: 'month_to_date'
  };
  const normalizedValue = periodAliases[safeValue] || safeValue;
  const allowedPeriods = new Set(['today', 'day', 'work_week', 'month', 'month_to_date', 'custom_range']);

  return allowedPeriods.has(normalizedValue) ? normalizedValue : 'day';
}

function getIsoWeekdayWorkWindow(weekKey) {
  const normalizedWeek = normalizeWeek(weekKey);

  if (!normalizedWeek) {
    return getWeekdayWorkWindow(getCentralDateKey());
  }

  const [yearPart, weekPart] = normalizedWeek.split('-W');
  const year = Number(yearPart);
  const week = Number(weekPart);

  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return getWeekdayWorkWindow(getCentralDateKey());
  }

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const mondayOfWeekOne = new Date(Date.UTC(year, 0, 4 - januaryFourthDay + 1));
  const monday = new Date(mondayOfWeekOne.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const startDate = formatDateKeyFromParts(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate()
  );

  return {
    startDate,
    endDate: addDaysToDateKey(startDate, 6)
  };
}

function getDefaultProductivityWeight(categoryCode, categoryLabel) {
  const normalized = `${categoryCode || ''} ${categoryLabel || ''}`.toLowerCase();

  if (normalized.includes('configuration task') || normalized.includes('configuration_task')) {
    return 0.33;
  }

  if (normalized.includes('windows surface') || normalized.includes('surface')) {
    return 2.0;
  }

  if (normalized.includes('mac')) {
    return 3.0;
  }

  if (normalized.includes('desktop')) {
    return 0.5;
  }

  if (normalized.includes('els')) {
    return 0.33;
  }

  if (normalized.includes('laptop')) {
    return 1.0;
  }

  return 1.0;
}

function getProductivityWeightSqlExpression(categoryAlias = 'category') {
  return `
    CASE
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%configuration task%'
        OR LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%configuration_task%'
      THEN 0.33
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%windows surface%'
        OR LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%surface%'
      THEN 2.00
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%mac%'
      THEN 3.00
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%desktop%'
      THEN 0.50
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%els%'
      THEN 0.33
      WHEN LOWER(CONCAT(COALESCE(${categoryAlias}.code, ''), ' ', COALESCE(${categoryAlias}.label, ''))) LIKE '%laptop%'
      THEN 1.00
      ELSE 1.00
    END
  `;
}

function buildReportingWindow({ key, label, startDate = '', endDate = '' }) {
  const safeStartDate = normalizeDate(startDate);
  const safeEndDate = normalizeDate(endDate || startDate);
  const startUtcDate = safeStartDate ? zonedDateTimeToUtc(safeStartDate, 0, 0, 0) : null;
  const exclusiveEndDateKey = safeEndDate ? addDaysToDateKey(safeEndDate, 1) : '';
  const endUtcDate = exclusiveEndDateKey ? zonedDateTimeToUtc(exclusiveEndDateKey, 0, 0, 0) : null;

  return {
    key,
    label,
    startDate: safeStartDate,
    endDate: safeEndDate,
    startSql: formatSqlDateTime(startUtcDate),
    endSql: formatSqlDateTime(endUtcDate)
  };
}

function buildOutcomeWindowWhere(window, alias = 'uo') {
  const whereParts = [
    `${alias}.is_current = 1`,
    `${alias}.outcome_code IN ('pass', 'fail')`
  ];
  const params = [];

  if (window && window.startSql) {
    whereParts.push(`${alias}.selected_at >= ?`);
    params.push(window.startSql);
  }

  if (window && window.endSql) {
    whereParts.push(`${alias}.selected_at < ?`);
    params.push(window.endSql);
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    andSql: `AND ${whereParts.join(' AND ')}`,
    params
  };
}


function buildCompletedUnitWindowWhere(window, gradeAlias = 'uga') {
  const whereParts = [
    `${gradeAlias}.is_current = 1`
  ];
  const params = [];

  if (window && window.startSql) {
    whereParts.push(`${gradeAlias}.assessed_at >= ?`);
    params.push(window.startSql);
  }

  if (window && window.endSql) {
    whereParts.push(`${gradeAlias}.assessed_at < ?`);
    params.push(window.endSql);
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    andSql: `AND ${whereParts.join(' AND ')}`,
    params
  };
}

function buildWorkCompletionWindowWhere(window, alias = 'uwc') {
  const whereParts = [];
  const params = [];

  if (window && window.startSql) {
    whereParts.push(`${alias}.completed_at >= ?`);
    params.push(window.startSql);
  }

  if (window && window.endSql) {
    whereParts.push(`${alias}.completed_at < ?`);
    params.push(window.endSql);
  }

  return {
    whereSql: whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '',
    andSql: whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : '',
    params
  };
}

function buildDashboardReportingWindows(filters = {}) {
  const safeFilters = normalizeDashboardFilters(filters);
  const todayDate = getCentralDateKey();
  const selectedDate = safeFilters.managementDate || safeFilters.startDate || todayDate;
  const selectedWeek = safeFilters.managementWeek || '';
  const selectedMonth = safeFilters.managementMonth || selectedDate.slice(0, 7);
  const selectedMonthWindow = getMonthWindow(`${selectedMonth}-01`);
  const selectedWeekWindow = selectedWeek ? getIsoWeekdayWorkWindow(selectedWeek) : getWeekdayWorkWindow(selectedDate);
  const currentMonthWindow = getMonthWindow(todayDate);
  const customStartDate = safeFilters.managementStartDate || safeFilters.startDate || '';
  const customEndDate = safeFilters.managementEndDate || safeFilters.endDate || customStartDate;

  const windows = [
    buildReportingWindow({
      key: 'day',
      label: 'Day',
      startDate: selectedDate,
      endDate: selectedDate
    }),
    buildReportingWindow({
      key: 'work_week',
      label: 'Week (Mon-Sun)',
      startDate: selectedWeekWindow.startDate,
      endDate: selectedWeekWindow.endDate
    }),
    buildReportingWindow({
      key: 'month',
      label: 'Month',
      startDate: selectedMonthWindow.startDate,
      endDate: selectedMonthWindow.endDate
    }),
    buildReportingWindow({
      key: 'month_to_date',
      label: 'Month-to-Date',
      startDate: currentMonthWindow.startDate,
      endDate: todayDate
    })
  ];

  if (customStartDate || customEndDate) {
    windows.push(buildReportingWindow({
      key: 'custom_range',
      label: 'Range of Dates',
      startDate: customStartDate || customEndDate,
      endDate: customEndDate || customStartDate
    }));
  }

  const requestedWindowKey = safeFilters.managementPeriod === 'custom_range' && !windows.some((window) => window.key === 'custom_range')
    ? 'day'
    : safeFilters.managementPeriod;
  const activeWindow = windows.find((window) => window.key === requestedWindowKey) || windows[0];

  return {
    windows,
    activeWindow,
    selectedDate,
    selectedWeek,
    selectedMonth,
    customStartDate,
    customEndDate,
    selectedPeriod: activeWindow.key
  };
}

async function getCompletionSummaryForWindow(window) {
  if (await tableExists('unit_work_completions')) {
    const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
    const [rows] = await pool.query(
      `
        SELECT
          COUNT(*) AS completed_count,
          COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
        FROM unit_work_completions uwc
        ${completedFilter.whereSql}
      `,
      completedFilter.params
    );

    return {
      completed: Number(rows[0]?.completed_count || 0),
      weighted: Number(rows[0]?.weighted_count || 0)
    };
  }

  if (!await tableExists('unit_grade_assessments') || !await tableExists('units')) {
    return { completed: 0, weighted: 0 };
  }

  const weightExpression = getProductivityWeightSqlExpression('category');
  const completedFilter = buildCompletedUnitWindowWhere(window, 'uga');
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(DISTINCT u.unit_id) AS completed_count,
        COALESCE(ROUND(SUM(${weightExpression}), 2), 0) AS weighted_count
      FROM unit_grade_assessments uga
      INNER JOIN units u
        ON u.unit_id = uga.unit_id
      LEFT JOIN config_values category
        ON category.config_value_id = u.unit_category_config_value_id
      ${completedFilter.whereSql}
    `,
    completedFilter.params
  );

  return {
    completed: Number(rows[0]?.completed_count || 0),
    weighted: Number(rows[0]?.weighted_count || 0)
  };
}

async function getCompletionCategoryBreakdown(window) {
  if (await tableExists('unit_work_completions') && await tableExists('units')) {
    const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
    const [rows] = await pool.query(
      `
        SELECT
          category.config_value_id AS category_id,
          COALESCE(category.label, category.code, 'Uncategorized') AS category_label,
          COALESCE(category.code, '') AS category_code,
          COUNT(*) AS completed_count,
          COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
        FROM unit_work_completions uwc
        INNER JOIN units u
          ON u.unit_id = uwc.unit_id
        LEFT JOIN config_values category
          ON category.config_value_id = u.unit_category_config_value_id
        ${completedFilter.whereSql}
        GROUP BY category.config_value_id, category.label, category.code
        ORDER BY completed_count DESC, category_label
        LIMIT 12
      `,
      completedFilter.params
    );

    return rows.map((row) => ({
      id: row.category_id ? Number(row.category_id) : null,
      label: row.category_label || 'Uncategorized',
      code: row.category_code || '',
      completed: Number(row.completed_count || 0),
      weighted: Number(row.weighted_count || 0),
      defaultWeight: getDefaultProductivityWeight(row.category_code, row.category_label)
    }));
  }

  return [];
}

async function getCompletionLotBreakdown(window) {
  if (!await tableExists('unit_work_completions') || !await tableExists('lots')) {
    return [];
  }

  const lotColumns = await getColumnSet('lots');
  const lotNameExpression = selectExpression(
    'l', lotColumns, ['name', 'lot_name', 'title', 'lot_number'], 'lot_name', "CONCAT('Lot #', l.lot_id)"
  );
  const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
  const [rows] = await pool.query(
    `
      SELECT
        l.lot_id,
        ${lotNameExpression},
        COUNT(*) AS completed_count,
        COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
      FROM unit_work_completions uwc
      LEFT JOIN lots l
        ON l.lot_id = uwc.lot_id
      ${completedFilter.whereSql}
      GROUP BY l.lot_id, lot_name
      ORDER BY completed_count DESC, lot_name
      LIMIT 12
    `,
    completedFilter.params
  );

  return rows.map((row) => ({
    id: row.lot_id ? Number(row.lot_id) : null,
    label: row.lot_name || 'No Lot',
    completed: Number(row.completed_count || 0),
    weighted: Number(row.weighted_count || 0)
  }));
}

async function getCompletionLotTypeBreakdown(window) {
  return getCompletionLotBreakdown(window);
}

async function getManagementCompletionData(filters = {}) {
  const reporting = buildDashboardReportingWindows(filters);
  const summaries = await Promise.all(reporting.windows.map(async (window) => ({
    ...window,
    summary: await getCompletionSummaryForWindow(window)
  })));
  const activeWindow = summaries.find((window) => window.key === reporting.activeWindow.key) || summaries[0];
  const [categoryBreakdown, lotBreakdown] = await Promise.all([
    getCompletionCategoryBreakdown(activeWindow),
    getCompletionLotBreakdown(activeWindow)
  ]);

  return {
    timeZone: REPORTING_TIME_ZONE,
    selectedPeriod: activeWindow ? activeWindow.key : reporting.selectedPeriod,
    selectedDate: reporting.selectedDate,
    selectedWeek: reporting.selectedWeek,
    selectedMonth: reporting.selectedMonth,
    customStartDate: reporting.customStartDate,
    customEndDate: reporting.customEndDate,
    activeWindow,
    windows: summaries,
    categoryBreakdown,
    lotBreakdown,
    lotTypeBreakdown: lotBreakdown
  };
}
function isElevatedTechDashboardViewer(context = {}) {
  const roles = Array.isArray(context.currentRoles) ? context.currentRoles : [];

  return roles.includes('admin') || roles.includes('management') || roles.includes('tech_lead');
}

function getCurrentUserIdFromContext(context = {}) {
  const userId = Number(context.currentUser?.user_id || context.currentUser?.userId || 0);

  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function getTechDashboardUserOptions() {
  if (await tableExists('unit_work_completions')) {
    const [rows] = await pool.query(
      `
        SELECT
          users.user_id,
          users.first_name,
          users.last_name,
          users.email,
          COUNT(*) AS completed_count
        FROM unit_work_completions uwc
        INNER JOIN users
          ON users.user_id = uwc.completed_by_user_id
        WHERE users.is_active = 1
        GROUP BY users.user_id, users.first_name, users.last_name, users.email
        ORDER BY users.first_name, users.last_name, users.email
      `
    );

    return rows.map((row) => ({
      userId: Number(row.user_id),
      name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${row.user_id}`,
      completedCount: Number(row.completed_count || 0)
    }));
  }

  return [];
}

async function getProductivitySummaryForUser(window, userId = null) {
  if (!await tableExists('unit_work_completions')) {
    return { completed: 0, weighted: 0 };
  }

  const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
  const params = [...completedFilter.params];
  const userFilter = userId ? `${completedFilter.whereSql ? 'AND' : 'WHERE'} uwc.completed_by_user_id = ?` : '';

  if (userId) {
    params.push(userId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS completed_count,
        COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
      FROM unit_work_completions uwc
      ${completedFilter.whereSql}
      ${userFilter}
    `,
    params
  );

  return {
    completed: Number(rows[0]?.completed_count || 0),
    weighted: Number(rows[0]?.weighted_count || 0)
  };
}

async function getProductivityCategoryBreakdownForUser(window, userId = null) {
  if (!await tableExists('unit_work_completions') || !await tableExists('units')) {
    return [];
  }

  const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
  const params = [...completedFilter.params];
  const userFilter = userId ? `${completedFilter.whereSql ? 'AND' : 'WHERE'} uwc.completed_by_user_id = ?` : '';

  if (userId) {
    params.push(userId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        category.config_value_id AS category_id,
        COALESCE(category.label, category.code, 'Uncategorized') AS category_label,
        COALESCE(category.code, '') AS category_code,
        COUNT(*) AS completed_count,
        COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
      FROM unit_work_completions uwc
      INNER JOIN units u
        ON u.unit_id = uwc.unit_id
      LEFT JOIN config_values category
        ON category.config_value_id = u.unit_category_config_value_id
      ${completedFilter.whereSql}
      ${userFilter}
      GROUP BY category.config_value_id, category.label, category.code
      ORDER BY completed_count DESC, category_label
      LIMIT 12
    `,
    params
  );

  return rows.map((row) => ({
    id: row.category_id ? Number(row.category_id) : null,
    label: row.category_label || 'Uncategorized',
    completed: Number(row.completed_count || 0),
    weighted: Number(row.weighted_count || 0),
    defaultWeight: getDefaultProductivityWeight(row.category_code, row.category_label)
  }));
}

async function getProductivityLotBreakdownForUser(window, userId = null) {
  if (!await tableExists('unit_work_completions') || !await tableExists('lots')) {
    return [];
  }

  const lotColumns = await getColumnSet('lots');
  const lotNameExpression = selectExpression(
    'l', lotColumns, ['name', 'lot_name', 'title', 'lot_number'], 'lot_name', "CONCAT('Lot #', l.lot_id)"
  );
  const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
  const params = [...completedFilter.params];
  const userFilter = userId ? `${completedFilter.whereSql ? 'AND' : 'WHERE'} uwc.completed_by_user_id = ?` : '';

  if (userId) {
    params.push(userId);
  }

  const [rows] = await pool.query(
    `
      SELECT
        l.lot_id,
        ${lotNameExpression},
        COUNT(*) AS completed_count,
        COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
      FROM unit_work_completions uwc
      LEFT JOIN lots l
        ON l.lot_id = uwc.lot_id
      ${completedFilter.whereSql}
      ${userFilter}
      GROUP BY l.lot_id, lot_name
      ORDER BY completed_count DESC, lot_name
      LIMIT 12
    `,
    params
  );

  return rows.map((row) => ({
    id: row.lot_id ? Number(row.lot_id) : null,
    label: row.lot_name || 'No Lot',
    completed: Number(row.completed_count || 0),
    weighted: Number(row.weighted_count || 0)
  }));
}

async function getAllTechSummaryRows(window, techUsers) {
  if (!await tableExists('unit_work_completions') || techUsers.length === 0) {
    return techUsers.map((tech) => ({ ...tech, completed: 0, weighted: 0 }));
  }

  const completedFilter = buildWorkCompletionWindowWhere(window, 'uwc');
  const [rows] = await pool.query(
    `
      SELECT
        uwc.completed_by_user_id AS tech_user_id,
        COUNT(*) AS completed_count,
        COALESCE(ROUND(SUM(uwc.production_weight_value), 2), 0) AS weighted_count
      FROM unit_work_completions uwc
      ${completedFilter.whereSql}
      GROUP BY uwc.completed_by_user_id
    `,
    completedFilter.params
  );

  const metricMap = new Map(rows.map((row) => [
    Number(row.tech_user_id),
    { completed: Number(row.completed_count || 0), weighted: Number(row.weighted_count || 0) }
  ]));

  return techUsers.map((tech) => ({
    ...tech,
    completed: metricMap.get(tech.userId)?.completed || 0,
    weighted: metricMap.get(tech.userId)?.weighted || 0
  }));
}

function getTeamAverageFromRows(rows) {
  const count = rows.length;

  if (!count) {
    return {
      completed: 0,
      weighted: 0
    };
  }

  const totals = rows.reduce((summary, row) => ({
    completed: summary.completed + Number(row.completed || 0),
    weighted: summary.weighted + Number(row.weighted || 0)
  }), { completed: 0, weighted: 0 });

  return {
    completed: Number((totals.completed / count).toFixed(2)),
    weighted: Number((totals.weighted / count).toFixed(2))
  };
}

function buildCurrentUserTechOption(context = {}) {
  const currentUser = context.currentUser || null;
  const userId = getCurrentUserIdFromContext(context);

  if (!currentUser || !userId) {
    return null;
  }

  return {
    userId,
    name: [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ').trim() || currentUser.email || `User #${userId}`,
    completedCount: 0
  };
}


async function getTechDashboardData(filters = {}, context = {}) {
  const safeFilters = normalizeDashboardFilters(filters);
  const reporting = buildDashboardReportingWindows(safeFilters);
  const activeWindow = reporting.activeWindow;
  const canViewAllTechs = isElevatedTechDashboardViewer(context);
  const currentUserId = getCurrentUserIdFromContext(context);
  const activityTechUsers = await getTechDashboardUserOptions();
  const currentUserTechOption = buildCurrentUserTechOption(context);
  const techUsers = currentUserTechOption && !activityTechUsers.some((tech) => tech.userId === currentUserTechOption.userId)
    ? [currentUserTechOption, ...activityTechUsers]
    : activityTechUsers;
  const selectedTechId = canViewAllTechs
    ? (safeFilters.techDashboardUserId || techUsers[0]?.userId || currentUserId)
    : currentUserId;
  const selectedTech = techUsers.find((tech) => tech.userId === selectedTechId) || currentUserTechOption || null;

  const [summary, categoryBreakdown, lotBreakdown, allTechRows] = await Promise.all([
    getProductivitySummaryForUser(activeWindow, selectedTechId),
    getProductivityCategoryBreakdownForUser(activeWindow, selectedTechId),
    getProductivityLotBreakdownForUser(activeWindow, selectedTechId),
    getAllTechSummaryRows(activeWindow, techUsers)
  ]);

  return {
    timeZone: REPORTING_TIME_ZONE,
    selectedPeriod: reporting.selectedPeriod,
    selectedDate: reporting.selectedDate,
    selectedWeek: reporting.selectedWeek,
    selectedMonth: reporting.selectedMonth,
    customStartDate: reporting.customStartDate,
    customEndDate: reporting.customEndDate,
    activeWindow,
    canViewAllTechs,
    selectedTechId,
    selectedTech,
    techUsers,
    summary,
    categoryBreakdown,
    lotBreakdown,
    teamAverage: getTeamAverageFromRows(allTechRows),
    allTechRows: canViewAllTechs ? allTechRows : []
  };
}



async function tableExists(tableName) {
  const safeTableName = String(tableName || '').trim();

  if (!safeTableName) {
    return false;
  }

  if (schemaTableCache.has(safeTableName)) {
    return schemaTableCache.get(safeTableName);
  }

  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [safeTableName]
  );

  const exists = Number(rows[0]?.table_count || 0) > 0;
  schemaTableCache.set(safeTableName, exists);

  return exists;
}

async function getColumnSet(tableName) {
  const safeTableName = String(tableName || '').trim();

  if (!safeTableName) {
    return new Set();
  }

  if (schemaColumnCache.has(safeTableName)) {
    return schemaColumnCache.get(safeTableName);
  }

  if (!await tableExists(safeTableName)) {
    const emptyColumnSet = new Set();
    schemaColumnCache.set(safeTableName, emptyColumnSet);
    return emptyColumnSet;
  }

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [safeTableName]
  );

  const columnSet = new Set(rows.map((row) => row.column_name));
  schemaColumnCache.set(safeTableName, columnSet);

  return columnSet;
}

function hasColumn(columnSet, columnName) {
  return columnSet.has(columnName);
}

function pickColumn(columnSet, candidates) {
  return candidates.find((candidate) => hasColumn(columnSet, candidate)) || null;
}

function selectExpression(alias, columnSet, candidates, outputAlias, fallbackSql = 'NULL') {
  const columnName = pickColumn(columnSet, candidates);

  if (!columnName) {
    return `${fallbackSql} AS ${outputAlias}`;
  }

  return `${alias}.\`${columnName}\` AS ${outputAlias}`;
}

async function safeCount(sql, params = [], requiredTables = []) {
  for (const tableName of requiredTables) {
    if (!await tableExists(tableName)) {
      return 0;
    }
  }

  const [rows] = await pool.query(sql, params);

  return Number(rows[0]?.count_value || 0);
}

function toPositiveInteger(value) {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function normalizeDate(value) {
  const stringValue = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return '';
  }

  return stringValue;
}

function normalizeDashboardFilters(input = {}) {
  return {
    startDate: normalizeDate(input.startDate),
    endDate: normalizeDate(input.endDate),
    categoryId: toPositiveInteger(input.categoryId),
    lotId: toPositiveInteger(input.lotId),
    techUserId: toPositiveInteger(input.techUserId),
    managementPeriod: normalizeManagementPeriod(input.managementPeriod),
    managementDate: normalizeDate(input.managementDate),
    managementWeek: normalizeWeek(input.managementWeek),
    managementMonth: normalizeMonth(input.managementMonth),
    managementStartDate: normalizeDate(input.managementStartDate),
    managementEndDate: normalizeDate(input.managementEndDate),
    techDashboardUserId: toPositiveInteger(input.techDashboardUserId)
  };
}

function hasAnyDashboardFilter(filters = {}) {
  return Boolean(
    filters.startDate
    || filters.endDate
    || filters.categoryId
    || filters.lotId
    || filters.techUserId
    || filters.managementPeriod !== 'day'
    || filters.managementDate
    || filters.managementWeek
    || filters.managementMonth
    || filters.managementStartDate
    || filters.managementEndDate
    || filters.techDashboardUserId
  );
}

function hasDateDashboardFilter(filters = {}) {
  return Boolean(filters.startDate || filters.endDate);
}

function buildUnitFilterWhere(filters = {}, alias = 'u') {
  const safeFilters = normalizeDashboardFilters(filters);
  const whereParts = [];
  const params = [];

  if (safeFilters.startDate) {
    whereParts.push(`${alias}.created_at >= ?`);
    params.push(`${safeFilters.startDate} 00:00:00`);
  }

  if (safeFilters.endDate) {
    whereParts.push(`${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(`${safeFilters.endDate} 00:00:00`);
  }

  if (safeFilters.categoryId) {
    whereParts.push(`${alias}.unit_category_config_value_id = ?`);
    params.push(safeFilters.categoryId);
  }

  if (safeFilters.lotId) {
    whereParts.push(`${alias}.lot_id = ?`);
    params.push(safeFilters.lotId);
  }

  if (safeFilters.techUserId) {
    whereParts.push(`${alias}.created_by_user_id = ?`);
    params.push(safeFilters.techUserId);
  }

  return {
    whereSql: whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '',
    andSql: whereParts.length > 0 ? `AND ${whereParts.join(' AND ')}` : '',
    params,
    filters: safeFilters
  };
}

async function getUnitStats(filters = {}) {
  if (!await tableExists('units')) {
    return {
      totalUnits: 0,
      unitsAddedLast24Hours: 0,
      unitsWithCurrentGrade: 0,
      unitsWithoutCurrentGrade: 0
    };
  }

  const unitFilter = buildUnitFilterWhere(filters, 'u');
  const hasGradeAssessments = await tableExists('unit_grade_assessments');

  if (!hasGradeAssessments) {
    const [rows] = await pool.query(
      `
        SELECT
          COUNT(*) AS total_units,
          COALESCE(SUM(CASE WHEN u.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END), 0) AS units_added_last_24_hours
        FROM units u
        ${unitFilter.whereSql}
      `,
      unitFilter.params
    );

    const totalUnits = Number(rows[0]?.total_units || 0);

    return {
      totalUnits,
      unitsAddedLast24Hours: Number(rows[0]?.units_added_last_24_hours || 0),
      unitsWithCurrentGrade: 0,
      unitsWithoutCurrentGrade: totalUnits
    };
  }

  const [rows] = await pool.query(
    `
      SELECT
        COUNT(DISTINCT u.unit_id) AS total_units,
        COUNT(DISTINCT CASE WHEN u.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN u.unit_id END) AS units_added_last_24_hours,
        COUNT(DISTINCT CASE WHEN uga.is_current = 1 THEN uga.unit_id END) AS units_with_current_grade
      FROM units u
      LEFT JOIN unit_grade_assessments uga
        ON uga.unit_id = u.unit_id
      ${unitFilter.whereSql}
    `,
    unitFilter.params
  );

  const totalUnits = Number(rows[0]?.total_units || 0);
  const unitsWithCurrentGrade = Number(rows[0]?.units_with_current_grade || 0);

  return {
    totalUnits,
    unitsAddedLast24Hours: Number(rows[0]?.units_added_last_24_hours || 0),
    unitsWithCurrentGrade,
    unitsWithoutCurrentGrade: Math.max(totalUnits - unitsWithCurrentGrade, 0)
  };
}

async function getLotStats(filters = {}) {
  if (!await tableExists('lots')) {
    return {
      totalLots: 0,
      activeLots: 0
    };
  }

  const lotColumns = await getColumnSet('lots');
  const whereParts = [];
  const params = [];
  const safeFilters = normalizeDashboardFilters(filters);

  if (hasColumn(lotColumns, 'abandoned_at')) {
    whereParts.push('l.abandoned_at IS NULL');
  }

  if (hasColumn(lotColumns, 'closed_at')) {
    whereParts.push('l.closed_at IS NULL');
  }

  if (safeFilters.lotId) {
    whereParts.push('l.lot_id = ?');
    params.push(safeFilters.lotId);
  }

  const totalLots = await safeCount(
    `SELECT COUNT(*) AS count_value FROM lots`,
    [],
    ['lots']
  );

  const activeLots = await safeCount(
    `
      SELECT COUNT(*) AS count_value
      FROM lots l
      ${whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''}
    `,
    params,
    ['lots']
  );

  return {
    totalLots,
    activeLots
  };
}

async function getUserStats() {
  if (!await tableExists('users')) {
    return {
      activeUsers: 0,
      inactiveUsers: 0,
      pendingSetupUsers: 0
    };
  }

  const userColumns = await getColumnSet('users');
  const statusJoin = hasColumn(userColumns, 'account_status_config_value_id')
    ? `
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
    `
    : '';

  const activeUsers = hasColumn(userColumns, 'is_active')
    ? await safeCount(`SELECT COUNT(*) AS count_value FROM users WHERE is_active = 1`, [], ['users'])
    : await safeCount(`SELECT COUNT(*) AS count_value FROM users`, [], ['users']);

  const inactiveUsers = hasColumn(userColumns, 'is_active')
    ? await safeCount(`SELECT COUNT(*) AS count_value FROM users WHERE is_active = 0`, [], ['users'])
    : 0;

  const pendingSetupUsers = await safeCount(
    `
      SELECT COUNT(*) AS count_value
      FROM users u
      ${statusJoin}
      WHERE ${statusJoin ? "status.code = 'pending_setup'" : 'u.password_hash IS NULL'}
    `,
    [],
    ['users']
  );

  return {
    activeUsers,
    inactiveUsers,
    pendingSetupUsers
  };
}

async function getOverrideStats() {
  if (!await tableExists('unit_override_requests')) {
    return {
      pendingOverrides: 0
    };
  }

  const pendingOverrides = await safeCount(
    `
      SELECT COUNT(*) AS count_value
      FROM unit_override_requests
      WHERE request_status = 'pending'
    `,
    [],
    ['unit_override_requests']
  );

  return {
    pendingOverrides
  };
}

function normalizeGradeLabel(label, code) {
  const rawValue = String(label || code || '').trim();
  const normalizedValue = rawValue.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  if (['n_a', 'na', 'not_applicable', 'not_yet_graded'].includes(normalizedValue)) {
    return 'Not Yet Graded';
  }

  return rawValue || 'Unknown Grade';
}

async function getGradeBreakdown(filters = {}) {
  if (!await tableExists('unit_grade_assessments') || !await tableExists('units')) {
    return [];
  }

  const unitFilter = buildUnitFilterWhere(filters, 'u');

  const [rows] = await pool.query(
    `
      SELECT
        grade.config_value_id AS grade_id,
        grade.code AS grade_code,
        COALESCE(grade.label, grade.code, 'Unknown Grade') AS grade_label,
        COUNT(*) AS unit_count
      FROM unit_grade_assessments uga
      INNER JOIN units u
        ON u.unit_id = uga.unit_id
      LEFT JOIN config_values grade
        ON grade.config_value_id = uga.overall_grade_config_value_id
      WHERE uga.is_current = 1
        ${unitFilter.andSql}
      GROUP BY grade.config_value_id, grade.code, grade.label
      ORDER BY
        CASE grade.code
          WHEN 'a' THEN 10
          WHEN 'b' THEN 20
          WHEN 'c' THEN 30
          WHEN 'd' THEN 40
          WHEN 'n_a' THEN 90
          ELSE 999
        END,
        grade.label
    `,
    unitFilter.params
  );

  return rows.map((row) => ({
    id: row.grade_id ? Number(row.grade_id) : null,
    code: row.grade_code || '',
    label: normalizeGradeLabel(row.grade_label, row.grade_code),
    count: Number(row.unit_count || 0)
  }));
}

async function getCategoryBreakdown(filters = {}) {
  if (!await tableExists('units')) {
    return [];
  }

  const unitFilter = buildUnitFilterWhere(filters, 'u');

  const [rows] = await pool.query(
    `
      SELECT
        category.config_value_id AS category_id,
        category.code AS category_code,
        COALESCE(category.label, category.code, 'Uncategorized') AS category_label,
        COUNT(*) AS unit_count
      FROM units u
      LEFT JOIN config_values category
        ON category.config_value_id = u.unit_category_config_value_id
      ${unitFilter.whereSql}
      GROUP BY category.config_value_id, category.code, category.label
      ORDER BY unit_count DESC, category_label
      LIMIT 8
    `,
    unitFilter.params
  );

  return rows.map((row) => ({
    id: row.category_id ? Number(row.category_id) : null,
    code: row.category_code || '',
    label: row.category_label || 'Uncategorized',
    count: Number(row.unit_count || 0)
  }));
}

async function getLotBreakdown(filters = {}) {
  if (!await tableExists('units') || !await tableExists('lots')) {
    return [];
  }

  const lotColumns = await getColumnSet('lots');
  const lotNameExpression = selectExpression(
    'l',
    lotColumns,
    ['name', 'lot_name', 'title', 'lot_number'],
    'lot_name',
    "CONCAT('Lot #', l.lot_id)"
  );
  const unitFilter = buildUnitFilterWhere(filters, 'u');

  const [rows] = await pool.query(
    `
      SELECT
        l.lot_id,
        ${lotNameExpression},
        COUNT(u.unit_id) AS unit_count
      FROM lots l
      INNER JOIN units u
        ON u.lot_id = l.lot_id
      ${unitFilter.whereSql}
      GROUP BY l.lot_id, lot_name
      HAVING unit_count > 0
      ORDER BY unit_count DESC, lot_name
      LIMIT 8
    `,
    unitFilter.params
  );

  return rows.map((row) => ({
    id: row.lot_id ? Number(row.lot_id) : null,
    label: row.lot_name || `Lot #${row.lot_id}`,
    count: Number(row.unit_count || 0)
  }));
}

async function getTechActivitySummary(filters = {}) {
  if (!await tableExists('units') || !await tableExists('users')) {
    return [];
  }

  const unitColumns = await getColumnSet('units');

  if (!hasColumn(unitColumns, 'created_by_user_id') || !hasColumn(unitColumns, 'created_at')) {
    return [];
  }

  const safeFilters = normalizeDashboardFilters(filters);
  const unitFilter = buildUnitFilterWhere(safeFilters, 'u');
  const useSelectedDateRange = hasDateDashboardFilter(safeFilters);
  const dateCondition = useSelectedDateRange ? '' : 'AND u.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';

  const [rows] = await pool.query(
    `
      SELECT
        u.created_by_user_id AS user_id,
        users.first_name,
        users.last_name,
        users.email,
        COUNT(*) AS unit_count
      FROM units u
      LEFT JOIN users
        ON users.user_id = u.created_by_user_id
      WHERE u.created_by_user_id IS NOT NULL
        ${dateCondition}
        ${unitFilter.andSql}
      GROUP BY u.created_by_user_id, users.first_name, users.last_name, users.email
      ORDER BY unit_count DESC, users.first_name, users.last_name
      LIMIT 8
    `,
    unitFilter.params
  );

  return rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || 'Unknown Tech';

    return {
      id: row.user_id ? Number(row.user_id) : null,
      label: name,
      count: Number(row.unit_count || 0)
    };
  });
}

async function getCategoryFilterOptions() {
  if (!await tableExists('units')) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT
        category.config_value_id AS value,
        COALESCE(category.label, category.code, 'Uncategorized') AS label,
        COUNT(u.unit_id) AS unit_count
      FROM units u
      LEFT JOIN config_values category
        ON category.config_value_id = u.unit_category_config_value_id
      WHERE category.config_value_id IS NOT NULL
      GROUP BY category.config_value_id, category.label, category.code
      ORDER BY label
    `
  );

  return rows.map((row) => ({
    value: Number(row.value),
    label: row.label,
    count: Number(row.unit_count || 0)
  }));
}

async function getLotFilterOptions() {
  if (!await tableExists('units') || !await tableExists('lots')) {
    return [];
  }

  const lotColumns = await getColumnSet('lots');
  const lotNameExpression = selectExpression(
    'l',
    lotColumns,
    ['name', 'lot_name', 'title', 'lot_number'],
    'lot_name',
    "CONCAT('Lot #', l.lot_id)"
  );

  const [rows] = await pool.query(
    `
      SELECT
        l.lot_id AS value,
        ${lotNameExpression},
        COUNT(u.unit_id) AS unit_count
      FROM lots l
      INNER JOIN units u
        ON u.lot_id = l.lot_id
      GROUP BY l.lot_id, lot_name
      ORDER BY lot_name
    `
  );

  return rows.map((row) => ({
    value: Number(row.value),
    label: row.lot_name || `Lot #${row.value}`,
    count: Number(row.unit_count || 0)
  }));
}

async function getTechUserFilterOptions() {
  if (!await tableExists('units') || !await tableExists('users')) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT
        users.user_id AS value,
        users.first_name,
        users.last_name,
        users.email,
        COUNT(u.unit_id) AS unit_count
      FROM units u
      INNER JOIN users
        ON users.user_id = u.created_by_user_id
      WHERE u.created_by_user_id IS NOT NULL
      GROUP BY users.user_id, users.first_name, users.last_name, users.email
      ORDER BY users.first_name, users.last_name, users.email
    `
  );

  return rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${row.value}`;

    return {
      value: Number(row.value),
      label: name,
      count: Number(row.unit_count || 0)
    };
  });
}

async function getDashboardFilterOptions() {
  const [categories, lots, techUsers] = await Promise.all([
    getCategoryFilterOptions(),
    getLotFilterOptions(),
    getTechUserFilterOptions()
  ]);

  return {
    categories,
    lots,
    techUsers
  };
}

async function getDashboardData(filters = {}, context = {}) {
  const safeFilters = normalizeDashboardFilters(filters);

  const [
    unitStats,
    lotStats,
    userStats,
    overrideStats,
    gradeBreakdown,
    categoryBreakdown,
    lotBreakdown,
    techActivitySummary,
    managementCompletionData,
    techDashboardData
  ] = await Promise.all([
    getUnitStats(safeFilters),
    getLotStats(safeFilters),
    getUserStats(),
    getOverrideStats(),
    getGradeBreakdown(safeFilters),
    getCategoryBreakdown(safeFilters),
    getLotBreakdown(safeFilters),
    getTechActivitySummary(safeFilters),
    getManagementCompletionData(safeFilters),
    getTechDashboardData(safeFilters, context)
  ]);

  return {
    filters: safeFilters,
    hasFilters: hasAnyDashboardFilter(safeFilters),
    hasDateFilter: hasDateDashboardFilter(safeFilters),
    unitStats,
    lotStats,
    userStats,
    overrideStats,
    gradeBreakdown,
    categoryBreakdown,
    lotBreakdown,
    techActivitySummary,
    managementCompletionData,
    techDashboardData
  };
}

module.exports = {
  normalizeDashboardFilters,
  getDashboardFilterOptions,
  getDashboardData
};
