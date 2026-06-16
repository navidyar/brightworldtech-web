const { pool } = require('./db');

const ALLOWED_TABLES = ['config_categories', 'config_values'];

async function getColumnSet(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Unsupported table for column inspection: ${tableName}`);
  }

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(
    rows
      .map((row) => row.column_name || row.COLUMN_NAME)
      .filter(Boolean)
  );
}

function pickColumnExpression(tableAlias, columns, candidates, fallbackExpression) {
  const foundColumn = candidates.find((columnName) => columns.has(columnName));

  if (foundColumn) {
    return `${tableAlias}.\`${foundColumn}\``;
  }

  return fallbackExpression;
}

function isActiveRecord(record) {
  return record.is_active === true || record.is_active === 1 || record.is_active === '1';
}

function getConfigSection(categoryCode) {
  const code = String(categoryCode || '').toLowerCase();

  if (code === 'production_weight_types') {
    return {
      key: 'production-weights',
      label: 'Production Weight Configuration',
      description: 'Default production values used for lot defaults and future production reporting.',
      sortOrder: 10
    };
  }

  if (code.includes('lot')) {
    return {
      key: 'lots',
      label: 'Lot Configuration',
      description: 'Selectable lot types, lot behavior, and lot-related management values.',
      sortOrder: 20
    };
  }

  if (
    code.includes('grade') ||
    code.includes('issue') ||
    code.includes('outcome') ||
    code.includes('status') ||
    code.includes('unit') ||
    code.includes('manufacturer') ||
    code.includes('memory') ||
    code.includes('ram') ||
    code.includes('storage') ||
    code.includes('os') ||
    code.includes('processor') ||
    code.includes('cpu')
  ) {
    return {
      key: 'unit-workflow',
      label: 'Unit Workflow Configuration',
      description: 'Selectable values used while creating, editing, processing, and grading units.',
      sortOrder: 30
    };
  }

  if (code.includes('role') || code.includes('permission') || code.includes('access') || code.includes('user')) {
    return {
      key: 'system-access',
      label: 'System and Access Configuration',
      description: 'System-level values that should stay separate from productivity reporting.',
      sortOrder: 40
    };
  }

  return {
    key: 'other',
    label: 'Other Configuration',
    description: 'Additional app configuration values that do not fit the primary groups above.',
    sortOrder: 90
  };
}

function groupConfigCategories(categories) {
  const sectionsByKey = new Map();

  for (const category of categories) {
    const section = getConfigSection(category.code);

    if (!sectionsByKey.has(section.key)) {
      sectionsByKey.set(section.key, {
        ...section,
        categories: [],
        categoryCount: 0,
        activeValueCount: 0,
        inactiveValueCount: 0,
        totalValueCount: 0,
        visibleValueCount: 0
      });
    }

    const currentSection = sectionsByKey.get(section.key);
    currentSection.categories.push(category);
    currentSection.categoryCount += 1;
    currentSection.activeValueCount += category.activeValueCount;
    currentSection.inactiveValueCount += category.inactiveValueCount;
    currentSection.totalValueCount += category.totalValueCount;
    currentSection.visibleValueCount += category.visibleValueCount;
  }

  return Array.from(sectionsByKey.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

async function getConfigCategorySelectExpressions() {
  const categoryColumns = await getColumnSet('config_categories');

  return {
    categoryColumns,
    categoryLabelExpression: pickColumnExpression('cc', categoryColumns, ['label', 'name'], 'cc.`code`'),
    categoryDescriptionExpression: pickColumnExpression('cc', categoryColumns, ['description'], 'NULL'),
    categorySortExpression: pickColumnExpression('cc', categoryColumns, ['sort_order'], '0'),
    categoryActiveExpression: pickColumnExpression('cc', categoryColumns, ['is_active'], '1')
  };
}

async function getConfigValueSelectExpressions() {
  const valueColumns = await getColumnSet('config_values');

  return {
    valueColumns,
    valueLabelExpression: pickColumnExpression('cv', valueColumns, ['label', 'name'], 'cv.`code`'),
    valueDescriptionExpression: pickColumnExpression('cv', valueColumns, ['description'], 'NULL'),
    valueValueExpression: pickColumnExpression('cv', valueColumns, ['value'], 'NULL'),
    valueSortExpression: pickColumnExpression('cv', valueColumns, ['sort_order'], '0'),
    valueActiveExpression: pickColumnExpression('cv', valueColumns, ['is_active'], '1')
  };
}

function normalizeConfigValueRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    isActive: isActiveRecord(row)
  };
}

async function listConfigCategoriesWithValues(options = {}) {
  const includeInactiveValues = options.includeInactiveValues === true;
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();
  const {
    valueLabelExpression,
    valueDescriptionExpression,
    valueValueExpression,
    valueSortExpression,
    valueActiveExpression
  } = await getConfigValueSelectExpressions();

  const [categoryRows] = await pool.query(`
    SELECT
      cc.config_category_id,
      cc.code,
      ${categoryLabelExpression} AS label,
      ${categoryDescriptionExpression} AS description,
      ${categorySortExpression} AS sort_order,
      ${categoryActiveExpression} AS is_active
    FROM config_categories cc
    ORDER BY sort_order, label, code
  `);

  const [valueRows] = await pool.query(`
    SELECT
      cv.config_value_id,
      cv.config_category_id,
      cv.code,
      ${valueLabelExpression} AS label,
      ${valueDescriptionExpression} AS description,
      ${valueValueExpression} AS value,
      ${valueSortExpression} AS sort_order,
      ${valueActiveExpression} AS is_active
    FROM config_values cv
    ORDER BY cv.config_category_id, sort_order, label, code
  `);

  const valuesByCategoryId = new Map();

  for (const rawValue of valueRows) {
    const value = normalizeConfigValueRow(rawValue);

    if (!valuesByCategoryId.has(value.config_category_id)) {
      valuesByCategoryId.set(value.config_category_id, []);
    }

    valuesByCategoryId.get(value.config_category_id).push(value);
  }

  return categoryRows.map((category) => {
    const allValues = valuesByCategoryId.get(category.config_category_id) || [];
    const activeValues = allValues.filter((value) => value.isActive);
    const inactiveValues = allValues.filter((value) => !value.isActive);
    const visibleValues = includeInactiveValues ? allValues : activeValues;
    const section = getConfigSection(category.code);

    return {
      ...category,
      sectionKey: section.key,
      sectionLabel: section.label,
      sectionDescription: section.description,
      isActive: isActiveRecord(category),
      values: visibleValues,
      activeValueCount: activeValues.length,
      inactiveValueCount: inactiveValues.length,
      totalValueCount: allValues.length,
      visibleValueCount: visibleValues.length,
      hiddenInactiveValueCount: includeInactiveValues ? 0 : inactiveValues.length
    };
  });
}

async function listConfigCategoriesForForm() {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();

  const [rows] = await pool.query(`
    SELECT
      cc.config_category_id,
      cc.code,
      ${categoryLabelExpression} AS label,
      ${categoryDescriptionExpression} AS description,
      ${categorySortExpression} AS sort_order,
      ${categoryActiveExpression} AS is_active
    FROM config_categories cc
    ORDER BY sort_order, label, code
  `);

  return rows.map((row) => ({
    ...row,
    isActive: isActiveRecord(row)
  }));
}

async function getConfigCategoryById(configCategoryId) {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();

  const [rows] = await pool.query(
    `
      SELECT
        cc.config_category_id,
        cc.code,
        ${categoryLabelExpression} AS label,
        ${categoryDescriptionExpression} AS description,
        ${categorySortExpression} AS sort_order,
        ${categoryActiveExpression} AS is_active
      FROM config_categories cc
      WHERE cc.config_category_id = ?
      LIMIT 1
    `,
    [configCategoryId]
  );

  return rows[0]
    ? {
        ...rows[0],
        isActive: isActiveRecord(rows[0])
      }
    : null;
}

async function getConfigValueById(configValueId) {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();
  const {
    valueLabelExpression,
    valueDescriptionExpression,
    valueValueExpression,
    valueSortExpression,
    valueActiveExpression
  } = await getConfigValueSelectExpressions();

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cv.config_category_id,
        cv.code,
        ${valueLabelExpression} AS label,
        ${valueDescriptionExpression} AS description,
        ${valueValueExpression} AS value,
        ${valueSortExpression} AS sort_order,
        ${valueActiveExpression} AS is_active,
        cc.code AS category_code,
        ${categoryLabelExpression} AS category_label,
        ${categoryDescriptionExpression} AS category_description,
        ${categorySortExpression} AS category_sort_order,
        ${categoryActiveExpression} AS category_is_active
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cv.config_value_id = ?
      LIMIT 1
    `,
    [configValueId]
  );

  return normalizeConfigValueRow(rows[0]);
}

async function configValueCodeExists(code, exceptConfigValueId = null) {
  const params = [code];
  let sql = `
    SELECT config_value_id
    FROM config_values
    WHERE code = ?
  `;

  if (exceptConfigValueId) {
    sql += ' AND config_value_id <> ?';
    params.push(exceptConfigValueId);
  }

  sql += ' LIMIT 1';

  const [rows] = await pool.query(sql, params);
  return rows.length > 0;
}

async function createConfigValue({ configCategoryId, code, label, value, description, sortOrder, isActive }) {
  const valueColumns = await getColumnSet('config_values');
  const fields = ['config_category_id', 'code'];
  const values = [configCategoryId, code];

  if (valueColumns.has('label')) {
    fields.push('label');
    values.push(label);
  }

  if (valueColumns.has('name')) {
    fields.push('name');
    values.push(label);
  }

  if (valueColumns.has('value')) {
    fields.push('value');
    values.push(value || null);
  }

  if (valueColumns.has('description')) {
    fields.push('description');
    values.push(description || null);
  }

  if (valueColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(sortOrder);
  }

  if (valueColumns.has('is_active')) {
    fields.push('is_active');
    values.push(isActive ? 1 : 0);
  }

  const placeholders = fields.map(() => '?').join(', ');
  const quotedFields = fields.map((field) => `\`${field}\``).join(', ');

  const [result] = await pool.query(
    `
      INSERT INTO config_values (${quotedFields})
      VALUES (${placeholders})
    `,
    values
  );

  return result.insertId;
}

async function updateConfigValue({ configValueId, configCategoryId, code, label, value, description, sortOrder, isActive }) {
  const valueColumns = await getColumnSet('config_values');
  const assignments = ['config_category_id = ?', 'code = ?'];
  const values = [configCategoryId, code];

  if (valueColumns.has('label')) {
    assignments.push('label = ?');
    values.push(label);
  }

  if (valueColumns.has('name')) {
    assignments.push('name = ?');
    values.push(label);
  }

  if (valueColumns.has('value')) {
    assignments.push('value = ?');
    values.push(value || null);
  }

  if (valueColumns.has('description')) {
    assignments.push('description = ?');
    values.push(description || null);
  }

  if (valueColumns.has('sort_order')) {
    assignments.push('sort_order = ?');
    values.push(sortOrder);
  }

  if (valueColumns.has('is_active')) {
    assignments.push('is_active = ?');
    values.push(isActive ? 1 : 0);
  }

  values.push(configValueId);

  await pool.query(
    `
      UPDATE config_values
      SET ${assignments.join(', ')}
      WHERE config_value_id = ?
      LIMIT 1
    `,
    values
  );
}

async function setConfigValueActive(configValueId, isActive) {
  const valueColumns = await getColumnSet('config_values');

  if (!valueColumns.has('is_active')) {
    return;
  }

  await pool.query(
    `
      UPDATE config_values
      SET is_active = ?
      WHERE config_value_id = ?
      LIMIT 1
    `,
    [isActive ? 1 : 0, configValueId]
  );
}

async function getConfigSummary() {
  const valueColumns = await getColumnSet('config_values');
  const valueActiveExpression = pickColumnExpression('cv', valueColumns, ['is_active'], '1');

  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM config_categories) AS category_count,
      COUNT(*) AS value_count,
      SUM(CASE WHEN ${valueActiveExpression} = 1 THEN 1 ELSE 0 END) AS active_value_count,
      SUM(CASE WHEN ${valueActiveExpression} = 1 THEN 0 ELSE 1 END) AS inactive_value_count
    FROM config_values cv
  `);

  return {
    categoryCount: Number(rows[0].category_count || 0),
    valueCount: Number(rows[0].value_count || 0),
    activeValueCount: Number(rows[0].active_value_count || 0),
    inactiveValueCount: Number(rows[0].inactive_value_count || 0)
  };
}

module.exports = {
  listConfigCategoriesWithValues,
  listConfigCategoriesForForm,
  getConfigCategoryById,
  getConfigValueById,
  configValueCodeExists,
  createConfigValue,
  updateConfigValue,
  setConfigValueActive,
  getConfigSummary,
  groupConfigCategories
};
