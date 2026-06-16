const { pool } = require('./db');

const PRODUCTION_WEIGHT_CATEGORY_CODES = ['production_weight_types', 'production_weights'];

const PRODUCTION_WEIGHT_CODE_ALIASES = new Map([
  ['laptop', 'production_weight_laptop'],
  ['laptops', 'production_weight_laptop'],
  ['notebook', 'production_weight_laptop'],
  ['notebooks', 'production_weight_laptop'],
  ['desktop', 'production_weight_desktop'],
  ['desktops', 'production_weight_desktop'],
  ['pc', 'production_weight_desktop'],
  ['pcs', 'production_weight_desktop'],
  ['mac', 'production_weight_mac'],
  ['macs', 'production_weight_mac'],
  ['macbook', 'production_weight_mac'],
  ['macbooks', 'production_weight_mac'],
  ['apple', 'production_weight_mac'],
  ['windows_surface', 'production_weight_windows_surface'],
  ['surface', 'production_weight_windows_surface'],
  ['surface_windows', 'production_weight_windows_surface'],
  ['els', 'production_weight_els'],
  ['configuration_task', 'production_weight_configuration_task'],
  ['config_task', 'production_weight_configuration_task']
]);

function normalizeWeightValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return Number(numericValue.toFixed(2));
}

function formatWeightValue(value) {
  const normalizedWeight = normalizeWeightValue(value);

  return normalizedWeight === null ? '—' : normalizedWeight.toFixed(2);
}

function normalizeProductionWeightCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapUnitCategoryCodeToProductionWeightCode(unitCategoryCode) {
  const normalizedCode = normalizeProductionWeightCode(unitCategoryCode);

  return PRODUCTION_WEIGHT_CODE_ALIASES.get(normalizedCode) || normalizedCode;
}

async function listProductionWeightOptions() {
  const placeholders = PRODUCTION_WEIGHT_CATEGORY_CODES.map(() => '?').join(', ');
  const orderPlaceholders = PRODUCTION_WEIGHT_CATEGORY_CODES.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cc.code AS category_code,
        cv.code,
        cv.label,
        cv.value,
        NULL AS description,
        cv.sort_order,
        cv.is_active
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cc.is_active = 1
        AND cv.is_active = 1
      ORDER BY FIELD(cc.code, ${orderPlaceholders}), cv.sort_order, cv.label, cv.code
    `,
    [...PRODUCTION_WEIGHT_CATEGORY_CODES, ...PRODUCTION_WEIGHT_CATEGORY_CODES]
  );

  return rows.map((row) => ({
    configValueId: Number(row.config_value_id),
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label || row.code,
    value: row.value,
    weightValue: normalizeWeightValue(row.value),
    formattedWeightValue: formatWeightValue(row.value),
    description: row.description || '',
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  }));
}

async function getProductionWeightOptionById(configValueId) {
  const safeConfigValueId = Number(configValueId);

  if (!Number.isInteger(safeConfigValueId) || safeConfigValueId <= 0) {
    return null;
  }

  const placeholders = PRODUCTION_WEIGHT_CATEGORY_CODES.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cc.code AS category_code,
        cv.code,
        cv.label,
        cv.value,
        NULL AS description,
        cv.sort_order,
        cv.is_active
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cv.config_value_id = ?
      LIMIT 1
    `,
    [...PRODUCTION_WEIGHT_CATEGORY_CODES, safeConfigValueId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    configValueId: Number(row.config_value_id),
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label || row.code,
    value: row.value,
    weightValue: normalizeWeightValue(row.value),
    formattedWeightValue: formatWeightValue(row.value),
    description: row.description || '',
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  };
}

async function getProductionWeightOptionByCode(weightCode) {
  const normalizedWeightCode = normalizeProductionWeightCode(weightCode);
  const safeWeightCode = PRODUCTION_WEIGHT_CODE_ALIASES.get(normalizedWeightCode) || normalizedWeightCode;

  if (!safeWeightCode) {
    return null;
  }

  const placeholders = PRODUCTION_WEIGHT_CATEGORY_CODES.map(() => '?').join(', ');
  const orderPlaceholders = PRODUCTION_WEIGHT_CATEGORY_CODES.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cc.code AS category_code,
        cv.code,
        cv.label,
        cv.value,
        NULL AS description,
        cv.sort_order,
        cv.is_active
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cv.code = ?
        AND cc.is_active = 1
        AND cv.is_active = 1
      ORDER BY FIELD(cc.code, ${orderPlaceholders}), cv.sort_order, cv.config_value_id
      LIMIT 1
    `,
    [...PRODUCTION_WEIGHT_CATEGORY_CODES, safeWeightCode, ...PRODUCTION_WEIGHT_CATEGORY_CODES]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    configValueId: Number(row.config_value_id),
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label || row.code,
    value: row.value,
    weightValue: normalizeWeightValue(row.value),
    formattedWeightValue: formatWeightValue(row.value),
    description: row.description || '',
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  };
}

async function getDefaultProductionWeightForUnitCategory(unitCategoryConfigValueId) {
  const safeConfigValueId = Number(unitCategoryConfigValueId);

  if (!Number.isInteger(safeConfigValueId) || safeConfigValueId <= 0) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT
        cv.code,
        cv.label,
        cv.value
      FROM config_values cv
      WHERE cv.config_value_id = ?
      LIMIT 1
    `,
    [safeConfigValueId]
  );

  const unitCategory = rows[0];

  if (!unitCategory) {
    return null;
  }

  const mappedWeightCode = mapUnitCategoryCodeToProductionWeightCode(
    unitCategory.code || unitCategory.value || unitCategory.label
  );

  return getProductionWeightOptionByCode(mappedWeightCode);
}

async function getProductionWeightPayloadFromConfigValueId(configValueId) {
  const selectedWeightOption = await getProductionWeightOptionById(configValueId);

  if (!selectedWeightOption) {
    return {
      configValueId: null,
      weightValue: null
    };
  }

  return {
    configValueId: selectedWeightOption.configValueId,
    weightValue: selectedWeightOption.weightValue
  };
}

module.exports = {
  PRODUCTION_WEIGHT_CATEGORY_CODES,
  normalizeWeightValue,
  formatWeightValue,
  mapUnitCategoryCodeToProductionWeightCode,
  listProductionWeightOptions,
  getProductionWeightOptionById,
  getProductionWeightOptionByCode,
  getDefaultProductionWeightForUnitCategory,
  getProductionWeightPayloadFromConfigValueId
};
