const { pool } = require('./db');

const schemaTableCache = new Map();
const schemaColumnCache = new Map();

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
    techUserId: toPositiveInteger(input.techUserId)
  };
}

function hasAnyDashboardFilter(filters = {}) {
  return Boolean(
    filters.startDate
    || filters.endDate
    || filters.categoryId
    || filters.lotId
    || filters.techUserId
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

async function getDashboardData(filters = {}) {
  const safeFilters = normalizeDashboardFilters(filters);

  const [
    unitStats,
    lotStats,
    userStats,
    overrideStats,
    gradeBreakdown,
    categoryBreakdown,
    lotBreakdown,
    techActivitySummary
  ] = await Promise.all([
    getUnitStats(safeFilters),
    getLotStats(safeFilters),
    getUserStats(),
    getOverrideStats(),
    getGradeBreakdown(safeFilters),
    getCategoryBreakdown(safeFilters),
    getLotBreakdown(safeFilters),
    getTechActivitySummary(safeFilters)
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
    techActivitySummary
  };
}

module.exports = {
  normalizeDashboardFilters,
  getDashboardFilterOptions,
  getDashboardData
};
