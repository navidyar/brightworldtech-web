const { pool } = require('./db');

const ALLOWED_TABLES = ['config_categories', 'config_values'];

async function getColumnSet(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Unsupported table for column inspection: ${tableName}`);
  }

  const [rows] = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name));
}

function pickColumnExpression(tableAlias, columns, candidates, fallbackExpression) {
  const foundColumn = candidates.find((columnName) => columns.has(columnName));

  if (foundColumn) {
    return `${tableAlias}.\`${foundColumn}\``;
  }

  return fallbackExpression;
}

async function listConfigCategoriesWithValues() {
  const categoryColumns = await getColumnSet('config_categories');
  const valueColumns = await getColumnSet('config_values');

  const categoryLabelExpression = pickColumnExpression('cc', categoryColumns, ['label', 'name'], 'cc.`code`');
  const categoryDescriptionExpression = pickColumnExpression('cc', categoryColumns, ['description'], 'NULL');
  const categorySortExpression = pickColumnExpression('cc', categoryColumns, ['sort_order'], '0');
  const categoryActiveExpression = pickColumnExpression('cc', categoryColumns, ['is_active'], '1');

  const valueLabelExpression = pickColumnExpression('cv', valueColumns, ['label', 'name'], 'cv.`code`');
  const valueDescriptionExpression = pickColumnExpression('cv', valueColumns, ['description'], 'NULL');
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

  return categoryRows.map((category) => ({
    ...category,
    values: valuesByCategoryId.get(category.config_category_id) || []
  }));
}

async function getConfigSummary() {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM config_categories) AS category_count,
      (SELECT COUNT(*) FROM config_values) AS value_count
  `);

  return {
    categoryCount: Number(rows[0].category_count || 0),
    valueCount: Number(rows[0].value_count || 0)
  };
}

module.exports = {
  listConfigCategoriesWithValues,
  getConfigSummary
};