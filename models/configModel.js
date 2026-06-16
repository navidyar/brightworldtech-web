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

async function listConfigCategoriesWithValues(options = {}) {
  const includeInactiveValues = options.includeInactiveValues === true;
  const categoryColumns = await getColumnSet('config_categories');
  const valueColumns = await getColumnSet('config_values');

  const categoryLabelExpression = pickColumnExpression('cc', categoryColumns, ['label', 'name'], 'cc.`code`');
  const categoryDescriptionExpression = pickColumnExpression('cc', categoryColumns, ['description'], 'NULL');
  const categorySortExpression = pickColumnExpression('cc', categoryColumns, ['sort_order'], '0');
  const categoryActiveExpression = pickColumnExpression('cc', categoryColumns, ['is_active'], '1');

  const valueLabelExpression = pickColumnExpression('cv', valueColumns, ['label', 'name'], 'cv.`code`');
  const valueDescriptionExpression = pickColumnExpression('cv', valueColumns, ['description'], 'NULL');
  const valueValueExpression = pickColumnExpression('cv', valueColumns, ['value'], 'NULL');
  const valueSortExpression = pickColumnExpression('cv', valueColumns, ['sort_order'], '0');
  const valueActiveExpression = pickColumnExpression('cv', valueColumns, ['is_active'], '1');

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

  for (const value of valueRows) {
    if (!valuesByCategoryId.has(value.config_category_id)) {
      valuesByCategoryId.set(value.config_category_id, []);
    }

    valuesByCategoryId.get(value.config_category_id).push(value);
  }

  return categoryRows.map((category) => {
    const allValues = valuesByCategoryId.get(category.config_category_id) || [];
    const activeValues = allValues.filter((value) => isActiveRecord(value));
    const inactiveValues = allValues.filter((value) => !isActiveRecord(value));
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
  getConfigSummary,
  groupConfigCategories
};
