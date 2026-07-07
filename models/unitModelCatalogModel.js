const { pool } = require('./db');

const MAX_MODEL_NAME_LENGTH = 150;

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeModelName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeSearch(value) {
  return String(value || '').trim().slice(0, 120);
}

async function getColumnSet(tableName) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

function pickColumn(columns, candidates) {
  return candidates.find((candidate) => columns.has(candidate)) || null;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function listManufacturers() {
  const columns = await getColumnSet('manufacturers');
  const labelColumn = pickColumn(columns, ['name', 'manufacturer_name', 'label']);
  const activeColumn = pickColumn(columns, ['is_active']);

  if (!columns.has('manufacturer_id') || !labelColumn) {
    return [];
  }

  const activeFilter = activeColumn ? `WHERE ${quoteIdentifier(activeColumn)} = 1` : '';
  const [rows] = await pool.query(`
    SELECT manufacturer_id, ${quoteIdentifier(labelColumn)} AS name, ${activeColumn ? quoteIdentifier(activeColumn) : '1'} AS is_active
    FROM manufacturers
    ${activeFilter}
    ORDER BY name
  `);

  return rows.map((row) => ({
    id: Number(row.manufacturer_id),
    label: row.name,
    isActive: Number(row.is_active) === 1
  }));
}

async function listUnitCategories() {
  const valueColumns = await getColumnSet('config_values');
  const labelColumn = pickColumn(valueColumns, ['label', 'name']);
  const activeColumn = pickColumn(valueColumns, ['is_active']);
  const sortColumn = pickColumn(valueColumns, ['sort_order']);

  if (!valueColumns.has('config_value_id')) {
    return [];
  }

  const [rows] = await pool.query(`
    SELECT
      cv.config_value_id,
      cv.code,
      ${labelColumn ? `cv.${quoteIdentifier(labelColumn)}` : 'cv.code'} AS label
    FROM config_values cv
    INNER JOIN config_categories cc
      ON cc.config_category_id = cv.config_category_id
    WHERE cc.code IN ('unit_categories', 'unit_category', 'unit_types', 'unit_type')
      ${activeColumn ? `AND COALESCE(cv.${quoteIdentifier(activeColumn)}, 1) = 1` : ''}
    ORDER BY ${sortColumn ? `COALESCE(cv.${quoteIdentifier(sortColumn)}, 0),` : ''} label, cv.code
  `);

  return rows.map((row) => ({
    id: Number(row.config_value_id),
    code: row.code,
    label: row.label
  }));
}

function getCatalogFilters(filters = {}) {
  return {
    manufacturerId: normalizePositiveInteger(filters.manufacturerId),
    unitCategoryConfigValueId: normalizePositiveInteger(filters.unitCategoryConfigValueId),
    includeInactive: filters.includeInactive === true || String(filters.includeInactive || '') === '1',
    search: normalizeSearch(filters.search)
  };
}

async function listUnitModels(filters = {}) {
  const normalized = getCatalogFilters(filters);
  const where = [];
  const params = [];

  if (normalized.manufacturerId) {
    where.push('um.manufacturer_id = ?');
    params.push(normalized.manufacturerId);
  }

  if (normalized.unitCategoryConfigValueId) {
    where.push('um.unit_category_config_value_id = ?');
    params.push(normalized.unitCategoryConfigValueId);
  }

  if (!normalized.includeInactive) {
    where.push('um.is_active = 1');
  }

  if (normalized.search) {
    where.push('um.model_name LIKE ?');
    params.push(`%${normalized.search}%`);
  }

  const [rows] = await pool.query(`
    SELECT
      um.unit_model_id,
      um.manufacturer_id,
      m.name AS manufacturer_name,
      um.unit_category_config_value_id,
      COALESCE(cv.label, cv.code) AS unit_category_label,
      um.model_name,
      um.sort_order,
      um.is_active
    FROM unit_models um
    INNER JOIN manufacturers m
      ON m.manufacturer_id = um.manufacturer_id
    LEFT JOIN config_values cv
      ON cv.config_value_id = um.unit_category_config_value_id
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY m.name, unit_category_label, um.sort_order, um.model_name
  `, params);

  return rows.map((row) => ({
    id: Number(row.unit_model_id),
    manufacturerId: Number(row.manufacturer_id),
    manufacturerName: row.manufacturer_name,
    unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    unitCategoryLabel: row.unit_category_label || 'Uncategorized',
    modelName: row.model_name,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  }));
}

async function getUnitModelById(unitModelId) {
  const safeId = normalizePositiveInteger(unitModelId);

  if (!safeId) {
    return null;
  }

  const [rows] = await pool.query(`
    SELECT
      um.unit_model_id,
      um.manufacturer_id,
      m.name AS manufacturer_name,
      um.unit_category_config_value_id,
      COALESCE(cv.label, cv.code) AS unit_category_label,
      um.model_name,
      um.sort_order,
      um.is_active
    FROM unit_models um
    INNER JOIN manufacturers m
      ON m.manufacturer_id = um.manufacturer_id
    LEFT JOIN config_values cv
      ON cv.config_value_id = um.unit_category_config_value_id
    WHERE um.unit_model_id = ?
    LIMIT 1
  `, [safeId]);

  const row = rows[0];
  if (!row) return null;

  return {
    id: Number(row.unit_model_id),
    manufacturerId: Number(row.manufacturer_id),
    manufacturerName: row.manufacturer_name,
    unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    unitCategoryLabel: row.unit_category_label || 'Uncategorized',
    modelName: row.model_name,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  };
}

async function modelExists({ manufacturerId, unitCategoryConfigValueId, modelName, excludeUnitModelId = null }) {
  const safeManufacturerId = normalizePositiveInteger(manufacturerId);
  const safeCategoryId = normalizePositiveInteger(unitCategoryConfigValueId);
  const normalizedName = normalizeModelName(modelName);
  const safeExcludeId = normalizePositiveInteger(excludeUnitModelId);

  if (!safeManufacturerId || !safeCategoryId || !normalizedName) {
    return false;
  }

  const params = [safeManufacturerId, safeCategoryId, normalizedName];
  let sql = `
    SELECT 1
    FROM unit_models
    WHERE manufacturer_id = ?
      AND unit_category_config_value_id = ?
      AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
  `;

  if (safeExcludeId) {
    sql += ' AND unit_model_id <> ?';
    params.push(safeExcludeId);
  }

  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows.length > 0;
}

async function createUnitModel({ manufacturerId, unitCategoryConfigValueId, modelName, sortOrder = 0, isActive = true }) {
  const [result] = await pool.execute(`
    INSERT INTO unit_models (
      manufacturer_id,
      unit_category_config_value_id,
      model_name,
      sort_order,
      is_active
    ) VALUES (?, ?, ?, ?, ?)
  `, [
    normalizePositiveInteger(manufacturerId),
    normalizePositiveInteger(unitCategoryConfigValueId),
    normalizeModelName(modelName),
    Number.parseInt(String(sortOrder || 0), 10) || 0,
    isActive ? 1 : 0
  ]);

  return Number(result.insertId);
}

async function updateUnitModel(unitModelId, { manufacturerId, unitCategoryConfigValueId, modelName, sortOrder = 0, isActive = true }) {
  const safeId = normalizePositiveInteger(unitModelId);
  await pool.execute(`
    UPDATE unit_models
    SET
      manufacturer_id = ?,
      unit_category_config_value_id = ?,
      model_name = ?,
      sort_order = ?,
      is_active = ?
    WHERE unit_model_id = ?
  `, [
    normalizePositiveInteger(manufacturerId),
    normalizePositiveInteger(unitCategoryConfigValueId),
    normalizeModelName(modelName),
    Number.parseInt(String(sortOrder || 0), 10) || 0,
    isActive ? 1 : 0,
    safeId
  ]);
}

async function setUnitModelActive(unitModelId, isActive) {
  const safeId = normalizePositiveInteger(unitModelId);
  await pool.execute('UPDATE unit_models SET is_active = ? WHERE unit_model_id = ?', [isActive ? 1 : 0, safeId]);
}

module.exports = {
  MAX_MODEL_NAME_LENGTH,
  normalizePositiveInteger,
  normalizeModelName,
  getCatalogFilters,
  listManufacturers,
  listUnitCategories,
  listUnitModels,
  getUnitModelById,
  modelExists,
  createUnitModel,
  updateUnitModel,
  setUnitModelActive
};
