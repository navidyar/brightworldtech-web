const { pool } = require('./db');
const { getConfigValueBySystemId, listConfigValuesBySystemCategoryIds } = require('./configLookupModel');
const { SYSTEM_CONFIG_CATEGORY_IDS, SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

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

const UNIT_CATEGORY_TO_WEIGHT_SYSTEM_ID = new Map([
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_LAPTOP, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_LAPTOP],
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_DESKTOP, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_DESKTOP],
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_MACBOOK, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_MAC],
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_WINDOWS_SURFACE, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_WINDOWS_SURFACE],
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_ELS, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_ELS],
  [SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_CONFIGURATION_TASK, SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_CONFIGURATION_TASK]
]);

const WEIGHT_SYSTEM_ID_BY_DOMAIN_CODE = new Map([
  ['production_weight_laptop', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_LAPTOP],
  ['production_weight_desktop', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_DESKTOP],
  ['production_weight_mac', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_MAC],
  ['production_weight_windows_surface', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_WINDOWS_SURFACE],
  ['production_weight_els', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_ELS],
  ['production_weight_configuration_task', SYSTEM_CONFIG_VALUE_IDS.PRODUCTION_WEIGHT_CONFIGURATION_TASK]
]);

const PRODUCTION_WEIGHT_PRIORITY_PATH = 'Unit override > Lot default > Unit category default';

function getProductionWeightSourceDescription(sourceCode) {
  switch (sourceCode) {
    case 'unit_override':
      return 'Unit override is taking priority over the lot default and unit category default.';
    case 'lot_default':
      return 'Lot default is being used because this unit does not have a unit-level override.';
    case 'category_default':
      return 'Unit category default is being used because this unit has no override and the lot has no default.';
    default:
      return 'No unit override, lot default, or unit category default is configured yet.';
  }
}

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

function normalizeWeightOption(row) {
  if (!row) return null;
  return {
    configValueId: Number(row.configValueId || row.config_value_id),
    id: Number(row.configValueId || row.config_value_id),
    systemConfigValueId: row.systemConfigValueId == null ? null : Number(row.systemConfigValueId),
    label: row.label || `Value #${row.configValueId || row.config_value_id}`,
    value: row.value,
    weightValue: normalizeWeightValue(row.value),
    formattedWeightValue: formatWeightValue(row.value),
    description: row.description || '',
    sortOrder: Number(row.sortOrder || row.sort_order || 0),
    isActive: row.isActive === undefined ? Number(row.is_active) === 1 : Boolean(row.isActive)
  };
}

async function listProductionWeightOptions(connection = pool) {
  const rows = await listConfigValuesBySystemCategoryIds(
    SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES,
    {},
    connection
  );
  return rows.map(normalizeWeightOption);
}

async function getProductionWeightOptionById(configValueId) {
  const safeConfigValueId = Number(configValueId);
  if (!Number.isInteger(safeConfigValueId) || safeConfigValueId <= 0) return null;
  const options = await listConfigValuesBySystemCategoryIds(SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES);
  return normalizeWeightOption(options.find((option) => option.configValueId === safeConfigValueId) || null);
}

async function getProductionWeightOptionByCode(weightCode) {
  const normalizedWeightCode = normalizeProductionWeightCode(weightCode);
  const semanticCode = PRODUCTION_WEIGHT_CODE_ALIASES.get(normalizedWeightCode) || normalizedWeightCode;
  const systemId = WEIGHT_SYSTEM_ID_BY_DOMAIN_CODE.get(semanticCode);
  if (!systemId) return null;
  return normalizeWeightOption(await getConfigValueBySystemId(systemId));
}

async function getDefaultProductionWeightForUnitCategory(unitCategoryConfigValueId) {
  const safeConfigValueId = Number(unitCategoryConfigValueId);
  if (!Number.isInteger(safeConfigValueId) || safeConfigValueId <= 0) return null;

  const [rows] = await pool.query(
    `SELECT scv.system_config_value_id
     FROM system_config_values scv
     WHERE scv.config_value_id = ?
     LIMIT 1`,
    [safeConfigValueId]
  );
  const categorySystemId = Number(rows[0]?.system_config_value_id || 0);
  const weightSystemId = UNIT_CATEGORY_TO_WEIGHT_SYSTEM_ID.get(categorySystemId);
  return weightSystemId ? normalizeWeightOption(await getConfigValueBySystemId(weightSystemId)) : null;
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

function findProductionWeightOptionForCategory(unitCategory = {}, productionWeightOptions = []) {
  const categorySystemId = Number(unitCategory.systemConfigValueId || unitCategory.system_config_value_id || 0);
  const mappedSystemId = UNIT_CATEGORY_TO_WEIGHT_SYSTEM_ID.get(categorySystemId);
  if (mappedSystemId) {
    return productionWeightOptions.find((option) => Number(option.systemConfigValueId) === mappedSystemId) || null;
  }

  // Compatibility for pure service callers that provide a domain string rather than a database row.
  const categoryCode = unitCategory.code || unitCategory.value || unitCategory.label || '';
  const mappedWeightCode = mapUnitCategoryCodeToProductionWeightCode(categoryCode);
  const fallbackSystemId = WEIGHT_SYSTEM_ID_BY_DOMAIN_CODE.get(mappedWeightCode);
  return fallbackSystemId
    ? productionWeightOptions.find((option) => Number(option.systemConfigValueId) === fallbackSystemId) || null
    : null;
}

function buildProductionWeightDetails({
  unitProductionWeightOverride = null,
  unitProductionWeightNotes = '',
  lotDefaultProductionWeight = null,
  lotDefaultProductionWeightLabel = '',
  unitCategory = {},
  productionWeightOptions = []
} = {}) {
  const overrideWeight = normalizeWeightValue(unitProductionWeightOverride);

  if (overrideWeight !== null) {
    return {
      effectiveWeight: overrideWeight,
      formattedEffectiveWeight: formatWeightValue(overrideWeight),
      sourceCode: 'unit_override',
      sourceLabel: 'Unit override',
      sourceDescription: getProductionWeightSourceDescription('unit_override'),
      priorityPath: PRODUCTION_WEIGHT_PRIORITY_PATH,
      notes: unitProductionWeightNotes || '',
      hasOverride: true
    };
  }

  const lotDefaultWeight = normalizeWeightValue(lotDefaultProductionWeight);

  if (lotDefaultWeight !== null) {
    return {
      effectiveWeight: lotDefaultWeight,
      formattedEffectiveWeight: formatWeightValue(lotDefaultWeight),
      sourceCode: 'lot_default',
      sourceLabel: lotDefaultProductionWeightLabel ? `Lot default: ${lotDefaultProductionWeightLabel}` : 'Lot default',
      sourceDescription: getProductionWeightSourceDescription('lot_default'),
      priorityPath: PRODUCTION_WEIGHT_PRIORITY_PATH,
      notes: '',
      hasOverride: false
    };
  }

  const categoryWeightOption = findProductionWeightOptionForCategory(unitCategory, productionWeightOptions);

  if (categoryWeightOption && categoryWeightOption.weightValue !== null && categoryWeightOption.weightValue !== undefined) {
    return {
      effectiveWeight: categoryWeightOption.weightValue,
      formattedEffectiveWeight: categoryWeightOption.formattedWeightValue,
      sourceCode: 'category_default',
      sourceLabel: `Category default: ${categoryWeightOption.label}`,
      sourceDescription: getProductionWeightSourceDescription('category_default'),
      priorityPath: PRODUCTION_WEIGHT_PRIORITY_PATH,
      notes: '',
      hasOverride: false
    };
  }

  return {
    effectiveWeight: null,
    formattedEffectiveWeight: '—',
    sourceCode: 'not_configured',
    sourceLabel: 'No configured weight',
    sourceDescription: getProductionWeightSourceDescription('not_configured'),
    priorityPath: PRODUCTION_WEIGHT_PRIORITY_PATH,
    notes: '',
    hasOverride: false
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
  getProductionWeightPayloadFromConfigValueId,
  findProductionWeightOptionForCategory,
  buildProductionWeightDetails,
  getProductionWeightSourceDescription
};
