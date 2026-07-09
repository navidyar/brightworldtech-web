const { pool } = require('./db');
const lotModel = require('./lotModel');
const productionWeightModel = require('./productionWeightModel');

const DEFAULT_UNIT_PAGE_SIZE = 50;
const UNIT_PAGE_SIZE_OPTIONS = [50, 100, 250, 500];
const UNIT_PAGE_SIZE_ALL = 'all';
const DEFAULT_UNIT_SORT = 'date_desc';
const UNIT_SORT_OPTIONS = new Set([
  'date_desc',
  'date_asc',
  'tech_az',
  'tech_za',
  'grade_asc',
  'grade_desc',
  'outcome_pass_first',
  'outcome_fail_first'
]);
const MAX_SEARCH_TERMS = 100;
const ASSET_NUMBER_START = 2300000;

const MEMORY_INSTALL_TYPE_OPTIONS = [
  { code: 'removable_module', label: 'Removable Module' },
  { code: 'integrated_soldered', label: 'Integrated / Soldered' },
  { code: 'unknown', label: 'Unknown' }
];

const DEFAULT_MEMORY_INSTALL_TYPE_CODE = 'removable_module';

const COSMETIC_GRADE_CATEGORY_CODES = [
  'cosmetic_grades',
  'overall_unit_grades',
  'unit_grades',
  'unit_grade'
];

const VALID_MEMORY_INSTALL_TYPE_CODES = new Set(MEMORY_INSTALL_TYPE_OPTIONS.map((option) => option.code));

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function getAssetTagPrefix() {
  const prefix = String(process.env.ASSET_TAG_PREFIX || 'BWT').trim();

  return prefix ? prefix.toUpperCase() : 'BWT';
}

function compactAssetTagValue(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

function normalizeAssetTagInput(value) {
  const compactValue = compactAssetTagValue(value);

  if (!compactValue) {
    return null;
  }

  const compactPrefix = compactAssetTagValue(getAssetTagPrefix());
  const withoutPrefix = compactValue.startsWith(compactPrefix)
    ? compactValue.slice(compactPrefix.length)
    : compactValue;

  if (!/^\d+$/.test(withoutPrefix)) {
    return null;
  }

  const parsed = Number(withoutPrefix);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getSearchTerms(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return [];
  }

  const terms = rawValue
    .split(/[\r\n\t,;]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  const dedupedTerms = [];
  const seenTerms = new Set();

  terms.forEach((term) => {
    const key = compactAssetTagValue(term) || term.toUpperCase();

    if (!seenTerms.has(key)) {
      seenTerms.add(key);
      dedupedTerms.push(term);
    }
  });

  return dedupedTerms.slice(0, MAX_SEARCH_TERMS);
}

function getDisplayAssetTag(assetNumber) {
  if (!assetNumber) {
    return '';
  }

  return `${getAssetTagPrefix()}${String(assetNumber)}`;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0].table_count) > 0;
}

async function getTableColumns(tableName) {
  const allowedTables = [
    'units',
    'config_categories',
    'config_values',
    'manufacturers',
    'unit_models',
    'processor_brands',
    'processor_models',
    'unit_model_processor_options',
    'unit_identifiers',
    'unit_memory_modules',
    'unit_storage_devices',
    'lots',
    'users',
    'roles',
    'user_roles',
    'unit_work_completions',
    'unit_assignment_history',
    'unit_park_history'
  ];

  if (!allowedTables.includes(tableName)) {
    throw new Error(`Unsupported table inspection requested: ${tableName}`);
  }

  const exists = await tableExists(tableName);

  if (!exists) {
    return new Map();
  }

  const [rows] = await pool.query(
    `
      SELECT
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType,
        IS_NULLABLE AS isNullable,
        COLUMN_DEFAULT AS columnDefault,
        EXTRA AS extra
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  const columns = new Map();

  rows.forEach((row) => {
    columns.set(row.columnName, row);
  });

  return columns;
}

function hasColumn(columns, columnName) {
  return columns.has(columnName);
}

function pickColumn(columns, candidates) {
  return candidates.find((columnName) => hasColumn(columns, columnName)) || null;
}

async function listConfigValuesByCategoryCodes(categoryCodes) {
  const categoryColumns = await getTableColumns('config_categories');
  const valueColumns = await getTableColumns('config_values');

  if (
    !hasColumn(categoryColumns, 'config_category_id') ||
    !hasColumn(categoryColumns, 'code') ||
    !hasColumn(valueColumns, 'config_value_id') ||
    !hasColumn(valueColumns, 'config_category_id') ||
    !hasColumn(valueColumns, 'code') ||
    !hasColumn(valueColumns, 'label')
  ) {
    return [];
  }

  const safeCategoryCodes = categoryCodes.map((code) => String(code).trim()).filter(Boolean);

  if (safeCategoryCodes.length === 0) {
    return [];
  }

  const placeholders = safeCategoryCodes.map(() => '?').join(', ');
  const fieldPlaceholders = safeCategoryCodes.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        cc.code AS category_code,
        cv.config_value_id,
        cv.code,
        cv.label,
        cv.value,
        cv.sort_order
      FROM config_categories cc
      INNER JOIN config_values cv
        ON cv.config_category_id = cc.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cc.is_active = 1
        AND cv.is_active = 1
      ORDER BY FIELD(cc.code, ${fieldPlaceholders}), cv.sort_order, cv.label, cv.code
    `,
    [...safeCategoryCodes, ...safeCategoryCodes]
  );

  return rows.map((row) => ({
    id: Number(row.config_value_id),
    categoryCode: row.category_code,
    code: row.code,
    label: row.label,
    value: row.value || row.code
  }));
}

async function listManufacturers() {
  const columns = await getTableColumns('manufacturers');

  if (!hasColumn(columns, 'manufacturer_id')) {
    return [];
  }

  const labelColumn = pickColumn(columns, ['name', 'manufacturer_name', 'label']);
  const codeColumn = pickColumn(columns, ['code', 'slug', 'name', 'manufacturer_name', 'label']);

  if (!labelColumn) {
    return [];
  }

  const activeFilter = hasColumn(columns, 'is_active') ? 'WHERE is_active = 1' : '';

  const [rows] = await pool.query(
    `
      SELECT
        manufacturer_id,
        ${escapeIdentifier(codeColumn || labelColumn)} AS code,
        ${escapeIdentifier(labelColumn)} AS label
      FROM manufacturers
      ${activeFilter}
      ORDER BY label
    `
  );

  return rows.map((row) => ({
    id: Number(row.manufacturer_id),
    code: row.code,
    label: row.label
  }));
}

async function listUnitModels(options = {}) {
  const includeUnitModelId = normalizeOptionalInteger(options.includeUnitModelId);
  const columns = await getTableColumns('unit_models');

  if (!hasColumn(columns, 'unit_model_id')) {
    return [];
  }

  const modelColumn = pickColumn(columns, ['model_name', 'name', 'label', 'model']);
  const modelNumberColumn = pickColumn(columns, ['model_number', 'number']);
  const modelIdentifierColumn = pickColumn(columns, ['model_identifier', 'identifier']);
  const hasManufacturerId = hasColumn(columns, 'manufacturer_id');
  const hasUnitCategoryId = hasColumn(columns, 'unit_category_config_value_id');

  if (!modelColumn) {
    return [];
  }

  const activeFilter = hasColumn(columns, 'is_active')
    ? includeUnitModelId
      ? 'WHERE (um.is_active = 1 OR um.unit_model_id = ?)'
      : 'WHERE um.is_active = 1'
    : '';
  const activeParams = hasColumn(columns, 'is_active') && includeUnitModelId ? [includeUnitModelId] : [];
  const manufacturerJoin = hasManufacturerId
    ? `
      LEFT JOIN manufacturers m
        ON m.manufacturer_id = um.manufacturer_id
    `
    : '';

  const manufacturerSelect = hasManufacturerId
    ? 'm.name AS manufacturer_name, um.manufacturer_id,'
    : 'NULL AS manufacturer_name, NULL AS manufacturer_id,';

  const categorySelect = hasUnitCategoryId
    ? 'um.unit_category_config_value_id,'
    : 'NULL AS unit_category_config_value_id,';

  const modelNumberSelect = modelNumberColumn
    ? `um.${escapeIdentifier(modelNumberColumn)} AS model_number,`
    : 'NULL AS model_number,';

  const modelIdentifierSelect = modelIdentifierColumn
    ? `um.${escapeIdentifier(modelIdentifierColumn)} AS model_identifier`
    : 'NULL AS model_identifier';

  const [rows] = await pool.query(
    `
      SELECT
        um.unit_model_id,
        ${manufacturerSelect}
        ${categorySelect}
        um.${escapeIdentifier(modelColumn)} AS model_name,
        ${modelNumberSelect}
        ${modelIdentifierSelect},
        ${hasColumn(columns, 'is_active') ? 'um.is_active' : '1'} AS is_active
      FROM unit_models um
      ${manufacturerJoin}
      ${activeFilter}
      ORDER BY manufacturer_name, model_name, model_number
    `,
    activeParams
  );

  return rows.map((row) => {
    const details = [
      row.model_number,
      row.model_identifier
    ].filter(Boolean);

    return {
      id: Number(row.unit_model_id),
      manufacturerId: row.manufacturer_id ? Number(row.manufacturer_id) : null,
      unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
      label: details.length > 0 ? `${row.model_name} (${details.join(' · ')})` : row.model_name,
      shortLabel: row.model_name,
      isActive: Number(row.is_active) === 1
    };
  });
}

async function listProcessorBrands() {
  const columns = await getTableColumns('processor_brands');

  if (!hasColumn(columns, 'processor_brand_id')) {
    return [];
  }

  const labelColumn = pickColumn(columns, ['name', 'brand_name', 'label']);

  if (!labelColumn) {
    return [];
  }

  const activeFilter = hasColumn(columns, 'is_active') ? 'WHERE is_active = 1' : '';
  const [rows] = await pool.query(
    `
      SELECT
        processor_brand_id,
        ${escapeIdentifier(labelColumn)} AS label
      FROM processor_brands
      ${activeFilter}
      ORDER BY label
    `
  );

  return rows.map((row) => ({
    id: Number(row.processor_brand_id),
    label: row.label
  }));
}

async function listProcessorModels(options = {}) {
  const includeProcessorModelId = normalizeOptionalInteger(options.includeProcessorModelId);
  const columns = await getTableColumns('processor_models');
  const compatibilityColumns = await getTableColumns('unit_model_processor_options');

  if (!hasColumn(columns, 'processor_model_id')) {
    return [];
  }

  const modelColumn = pickColumn(columns, ['model_code', 'name', 'label', 'processor_model']);
  const familyColumn = pickColumn(columns, ['processor_family', 'family']);
  const speedColumn = pickColumn(columns, ['base_speed_ghz', 'speed_ghz']);
  const generationColumn = pickColumn(columns, ['generation']);
  const brandIdColumn = pickColumn(columns, ['processor_brand_id', 'brand_id']);

  if (!modelColumn) {
    return [];
  }

  const hasCompatibilityMap = hasColumn(compatibilityColumns, 'unit_model_id')
    && hasColumn(compatibilityColumns, 'processor_model_id');
  const compatibilityActiveCondition = hasCompatibilityMap && hasColumn(compatibilityColumns, 'is_active')
    ? 'AND umpo.is_active = 1'
    : '';
  const activeFilter = hasColumn(columns, 'is_active')
    ? includeProcessorModelId
      ? 'WHERE (pm.is_active = 1 OR pm.processor_model_id = ?)'
      : 'WHERE pm.is_active = 1'
    : '';
  const activeParams = hasColumn(columns, 'is_active') && includeProcessorModelId ? [includeProcessorModelId] : [];
  const compatibilityJoin = hasCompatibilityMap
    ? `LEFT JOIN unit_model_processor_options umpo ON umpo.processor_model_id = pm.processor_model_id ${compatibilityActiveCondition}`
    : '';
  const compatibilitySelect = hasCompatibilityMap
    ? "GROUP_CONCAT(DISTINCT umpo.unit_model_id ORDER BY umpo.unit_model_id SEPARATOR ',') AS compatible_unit_model_ids"
    : 'NULL AS compatible_unit_model_ids';
  const groupBy = hasCompatibilityMap
    ? `GROUP BY pm.processor_model_id, ${brandIdColumn ? `pm.${escapeIdentifier(brandIdColumn)},` : ''} ${familyColumn ? `pm.${escapeIdentifier(familyColumn)},` : ''} pm.${escapeIdentifier(modelColumn)}, ${speedColumn ? `pm.${escapeIdentifier(speedColumn)},` : ''} ${generationColumn ? `pm.${escapeIdentifier(generationColumn)}` : 'pm.processor_model_id'}`
    : '';

  const [rows] = await pool.query(
    `
      SELECT
        pm.processor_model_id,
        ${brandIdColumn ? `pm.${escapeIdentifier(brandIdColumn)}` : 'NULL'} AS processor_brand_id,
        ${familyColumn ? `pm.${escapeIdentifier(familyColumn)}` : 'NULL'} AS processor_family,
        pm.${escapeIdentifier(modelColumn)} AS model_code,
        ${speedColumn ? `pm.${escapeIdentifier(speedColumn)}` : 'NULL'} AS base_speed_ghz,
        ${generationColumn ? `pm.${escapeIdentifier(generationColumn)}` : 'NULL'} AS generation,
        ${compatibilitySelect}
      FROM processor_models pm
      ${compatibilityJoin}
      ${activeFilter}
      ${groupBy}
      ORDER BY processor_family, model_code, generation
    `,
    activeParams
  );

  return rows.map((row) => {
    const details = [
      row.processor_family,
      row.generation,
      row.base_speed_ghz ? `${row.base_speed_ghz}GHz` : ''
    ].filter(Boolean);

    return {
      id: Number(row.processor_model_id),
      processorBrandId: row.processor_brand_id ? Number(row.processor_brand_id) : null,
      label: details.length > 0 ? `${row.model_code} (${details.join(' · ')})` : row.model_code,
      shortLabel: row.model_code,
      baseSpeedGhz: row.base_speed_ghz,
      compatibleUnitModelIds: String(row.compatible_unit_model_ids || '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    };
  });
}

async function getProcessorCompatibilityStatus({ unitModelId, processorModelId }) {
  const normalizedUnitModelId = normalizeOptionalInteger(unitModelId);
  const normalizedProcessorModelId = normalizeOptionalInteger(processorModelId);
  const compatibilityColumns = await getTableColumns('unit_model_processor_options');

  if (!normalizedUnitModelId || !normalizedProcessorModelId) {
    return { isSupported: true, hasCatalog: false };
  }

  if (!hasColumn(compatibilityColumns, 'unit_model_id') || !hasColumn(compatibilityColumns, 'processor_model_id')) {
    return { isSupported: true, hasCatalog: false };
  }

  const activeFilter = hasColumn(compatibilityColumns, 'is_active') ? 'AND is_active = 1' : '';
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM unit_model_processor_options
      WHERE unit_model_id = ?
        AND processor_model_id = ?
        ${activeFilter}
      LIMIT 1
    `,
    [normalizedUnitModelId, normalizedProcessorModelId]
  );

  return { isSupported: rows.length > 0, hasCatalog: true };
}

async function getUnitTableState() {
  const columns = await getTableColumns('units');

  return {
    exists: columns.size > 0,
    columns,
    primaryKeyColumn: pickColumn(columns, ['unit_id', 'id']),
    hasAssetNumber: hasColumn(columns, 'asset_number'),
    hasLotId: hasColumn(columns, 'lot_id'),
    hasUnitCategory: hasColumn(columns, 'unit_category_config_value_id'),
    hasUnitStatus: hasColumn(columns, 'current_unit_status_config_value_id'),
    productionWeightCapabilities: {
      hasProductionWeightOverride: hasColumn(columns, 'production_weight_override'),
      hasProductionWeightNotes: hasColumn(columns, 'production_weight_notes'),
      hasProductionWeightOverrideUpdatedByUserId: hasColumn(columns, 'production_weight_override_updated_by_user_id'),
      hasProductionWeightOverrideUpdatedAt: hasColumn(columns, 'production_weight_override_updated_at')
    },
    parkingCapabilities: {
      hasIsParked: hasColumn(columns, 'is_parked'),
      hasParkedAt: hasColumn(columns, 'parked_at'),
      hasParkedByUserId: hasColumn(columns, 'parked_by_user_id')
    },
    legacyArchiveCapabilities: {
      hasIsArchived: hasColumn(columns, 'is_archived'),
      hasArchivedAt: hasColumn(columns, 'archived_at'),
      hasArchivedByUserId: hasColumn(columns, 'archived_by_user_id')
    },
    assignmentCapabilities: {
      hasAssignedToUserId: hasColumn(columns, 'assigned_to_user_id'),
      hasAssignedAt: hasColumn(columns, 'assigned_at'),
      hasAssignmentUpdatedByUserId: hasColumn(columns, 'assignment_updated_by_user_id')
    }
  };
}

function getUnitParkedSql(state, tableAlias = 'u') {
  const hasParkedState = Boolean(
    state && state.parkingCapabilities && state.parkingCapabilities.hasIsParked
  );
  const hasLegacyArchiveState = Boolean(
    state && state.legacyArchiveCapabilities && state.legacyArchiveCapabilities.hasIsArchived
  );

  if (hasParkedState && hasLegacyArchiveState) {
    return `GREATEST(COALESCE(${tableAlias}.is_parked, 0), COALESCE(${tableAlias}.is_archived, 0))`;
  }

  if (hasParkedState) {
    return `COALESCE(${tableAlias}.is_parked, 0)`;
  }

  if (hasLegacyArchiveState) {
    return `COALESCE(${tableAlias}.is_archived, 0)`;
  }

  return '0';
}

function isUnitParked(unit) {
  if (!unit) {
    return false;
  }

  return Number(unit.is_parked || 0) === 1
    || Number(unit.is_archived || 0) === 1;
}

function createUnitLifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getParentLotIdsWithChildren(lots) {
  const parentLotIds = new Set();

  lots.forEach((lot) => {
    if (lot.parent_lot_id) {
      parentLotIds.add(String(lot.parent_lot_id));
    }
  });

  return parentLotIds;
}

function isOperationalLot(lot) {
  return Boolean(lot)
    && Number(lot.is_active) === 1
    && Number(lot.is_closed || 0) !== 1;
}

function isBrowsableLot(lot, parentLotIdsWithChildren) {
  if (!lot || Number(lot.is_active) !== 1) {
    return false;
  }

  return !parentLotIdsWithChildren.has(String(lot.lot_id));
}

function isAssignableLot(lot, parentLotIdsWithChildren) {
  return isOperationalLot(lot)
    && !parentLotIdsWithChildren.has(String(lot.lot_id));
}

function getBrowsableLots(lots) {
  const visibleLots = lots.filter((lot) => Number(lot.is_active) === 1);
  const parentLotIdsWithChildren = getParentLotIdsWithChildren(visibleLots);

  return visibleLots.filter((lot) => isBrowsableLot(lot, parentLotIdsWithChildren));
}

function getAssignableLots(lots) {
  const visibleLots = lots.filter((lot) => Number(lot.is_active) === 1);
  const parentLotIdsWithChildren = getParentLotIdsWithChildren(visibleLots);

  return visibleLots.filter((lot) => isAssignableLot(lot, parentLotIdsWithChildren));
}

function sortLotsByName(lots) {
  return lots.slice().sort((a, b) => String(a.lot_name || '').localeCompare(String(b.lot_name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  }));
}

async function getLotMap() {
  const lots = await lotModel.listLots({ includeHidden: true });
  const assignableLots = getAssignableLots(lots);
  const filterLots = getBrowsableLots(lots);
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot);
  });

  return {
    lots,
    assignableLots,
    filterLots,
    lotMap
  };
}

async function generateNextAssetNumber(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COALESCE(MAX(asset_number), ?) + 1 AS next_asset_number
      FROM units
    `,
    [ASSET_NUMBER_START - 1]
  );

  return Number(rows[0].next_asset_number);
}

function normalizeOptionalInteger(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRequiredInteger(value) {
  const parsed = Number(String(value || '').trim());

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalDecimal(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeText(value) {
  const trimmed = String(value || '').trim();

  return trimmed || null;
}

function normalizeOptionalString(value, maxLength = 255) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function normalizeMemoryInstallTypeCode(value) {
  const normalized = String(value || '').trim();

  return VALID_MEMORY_INSTALL_TYPE_CODES.has(normalized)
    ? normalized
    : DEFAULT_MEMORY_INSTALL_TYPE_CODE;
}

function normalizeModuleRows(rows) {
  if (!rows) {
    return [];
  }

  if (Array.isArray(rows)) {
    return rows.filter((row) => row && typeof row === 'object');
  }

  if (typeof rows === 'object') {
    return Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => rows[key])
      .filter((row) => row && typeof row === 'object');
  }

  return [];
}

function normalizeMemoryModuleRow(row, index = 0) {
  const normalized = {
    slotLabel: normalizeOptionalString(row.slotLabel, 80),
    sizeGb: normalizeOptionalInteger(row.sizeGb),
    ramTypeConfigValueId: normalizeOptionalInteger(row.ramTypeConfigValueId),
    memoryInstallTypeCode: normalizeMemoryInstallTypeCode(row.memoryInstallTypeCode),
    speedMhz: normalizeOptionalInteger(row.speedMhz),
    manufacturerName: normalizeOptionalString(row.manufacturerName, 120),
    partNumber: normalizeOptionalString(row.partNumber, 120),
    serialNumber: normalizeOptionalString(row.serialNumber, 120),
    changeNotes: normalizeOptionalString(row.changeNotes, 500)
  };

  const hasAnyValue = Boolean(
    normalized.sizeGb ||
      normalized.ramTypeConfigValueId ||
      normalized.speedMhz ||
      normalized.manufacturerName ||
      normalized.partNumber ||
      normalized.serialNumber ||
      normalized.changeNotes
  );

  if (!hasAnyValue) {
    return null;
  }

  return {
    ...normalized,
    slotLabel: normalized.slotLabel || `Memory Slot ${index + 1}`
  };
}

function normalizeStorageDeviceRow(row, index = 0) {
  const normalized = {
    slotLabel: normalizeOptionalString(row.slotLabel, 80),
    sizeGb: normalizeOptionalInteger(row.sizeGb),
    storageTypeConfigValueId: normalizeOptionalInteger(row.storageTypeConfigValueId),
    manufacturerName: normalizeOptionalString(row.manufacturerName, 120),
    modelNumber: normalizeOptionalString(row.modelNumber, 120),
    serialNumber: normalizeOptionalString(row.serialNumber, 120),
    firmwareVersion: normalizeOptionalString(row.firmwareVersion, 120),
    wipeStatusConfigValueId: normalizeOptionalInteger(row.wipeStatusConfigValueId),
    changeNotes: normalizeOptionalString(row.changeNotes, 500)
  };

  const hasAnyValue = Boolean(
    normalized.sizeGb ||
      normalized.storageTypeConfigValueId ||
      normalized.manufacturerName ||
      normalized.modelNumber ||
      normalized.serialNumber ||
      normalized.firmwareVersion ||
      normalized.wipeStatusConfigValueId ||
      normalized.changeNotes
  );

  if (!hasAnyValue) {
    return null;
  }

  return {
    ...normalized,
    slotLabel: normalized.slotLabel || `Drive ${index + 1}`
  };
}

function getNormalizedMemoryModules(formData) {
  return normalizeModuleRows(formData.memoryModules)
    .map((row, index) => normalizeMemoryModuleRow(row, index))
    .filter(Boolean);
}

function getNormalizedStorageDevices(formData) {
  return normalizeModuleRows(formData.storageDevices)
    .map((row, index) => normalizeStorageDeviceRow(row, index))
    .filter(Boolean);
}

function sumModuleSizeGb(rows) {
  return rows.reduce((sum, row) => sum + Number(row.sizeGb || 0), 0);
}

function getBlankMemoryModuleRows() {
  return [
    {
      slotLabel: 'Slot 1',
      sizeGb: '',
      ramTypeConfigValueId: '',
      memoryInstallTypeCode: DEFAULT_MEMORY_INSTALL_TYPE_CODE,
      speedMhz: '',
      manufacturerName: '',
      partNumber: '',
      serialNumber: '',
      changeNotes: ''
    }
  ];
}

function getBlankStorageDeviceRows() {
  return [
    {
      slotLabel: 'Drive 1',
      sizeGb: '',
      storageTypeConfigValueId: '',
      manufacturerName: '',
      modelNumber: '',
      serialNumber: '',
      firmwareVersion: '',
      wipeStatusConfigValueId: '',
      changeNotes: ''
    }
  ];
}

function normalizeIdentifierText(value) {
  const trimmed = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

  return trimmed || null;
}

function normalizeIdentifierComparableValue(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

  return normalized || null;
}

function buildIdentifierEntries(formData, assetNumber = null) {
  const entries = [];

  if (assetNumber) {
    entries.push({
      typeCode: 'asset_tag',
      value: String(assetNumber),
      normalizedValue: String(assetNumber),
      isPrimary: true
    });
  }

  const unitSerialNumber = normalizeIdentifierText(formData.unitSerialNumber);
  const normalizedUnitSerialNumber = normalizeIdentifierComparableValue(unitSerialNumber);

  if (unitSerialNumber && normalizedUnitSerialNumber) {
    entries.push({
      typeCode: 'unit_serial_number',
      value: unitSerialNumber,
      normalizedValue: normalizedUnitSerialNumber,
      isPrimary: false
    });
  }

  const biosSerialNumber = normalizeIdentifierText(formData.biosSerialNumber);
  const normalizedBiosSerialNumber = normalizeIdentifierComparableValue(biosSerialNumber);

  if (biosSerialNumber && normalizedBiosSerialNumber) {
    entries.push({
      typeCode: 'bios_serial_number',
      value: biosSerialNumber,
      normalizedValue: normalizedBiosSerialNumber,
      isPrimary: false
    });
  }

  return entries;
}

function mapById(items) {
  const map = new Map();

  items.forEach((item) => {
    map.set(Number(item.id), item);
  });

  return map;
}

function normalizeGradeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(cosmetic_)?grade_/, '')
    .replace(/_grade$/, '');
}

function isNotYetGradedToken(value) {
  return ['n_a', 'na', 'not_applicable', 'not_yet_graded', 'not_graded', 'ungraded'].includes(normalizeGradeToken(value));
}

function normalizeCosmeticGradeOptions(options) {
  const safeOptions = Array.isArray(options) ? options : [];
  const groups = new Map();

  safeOptions.forEach((option) => {
    const isNotYetGraded = [option.code, option.value, option.label].some(isNotYetGradedToken);
    const displayLabel = isNotYetGraded ? 'Not Yet Graded' : (option.label || option.code || option.value || '');
    const tokenCandidates = [displayLabel, option.code, option.value, option.label]
      .map(normalizeGradeToken)
      .filter(Boolean);
    const gradeToken = isNotYetGraded ? 'not_yet_graded' : tokenCandidates[0];

    if (!gradeToken) {
      return;
    }

    if (!groups.has(gradeToken)) {
      groups.set(gradeToken, {
        ...option,
        label: displayLabel,
        filterIds: []
      });
    }

    const group = groups.get(gradeToken);
    const id = Number(option.id);

    if (Number.isInteger(id) && id > 0 && !group.filterIds.includes(id)) {
      group.filterIds.push(id);
    }
  });

  return Array.from(groups.values());
}

function getCosmeticGradeFilterIds(gradeOptions, selectedGradeId) {
  const safeGradeId = normalizePositiveFilterId(selectedGradeId);

  if (!safeGradeId) {
    return [];
  }

  const selectedOption = (Array.isArray(gradeOptions) ? gradeOptions : [])
    .find((option) => Number(option.id) === safeGradeId || (Array.isArray(option.filterIds) && option.filterIds.includes(safeGradeId)));

  if (!selectedOption || !Array.isArray(selectedOption.filterIds) || selectedOption.filterIds.length === 0) {
    return [safeGradeId];
  }

  return selectedOption.filterIds;
}

function getCosmeticGradeSortRank(option = {}) {
  const token = normalizeGradeToken(option.label || option.code || option.value);
  const baseGrade = token.match(/^[a-z]/)?.[0] || '';

  if (baseGrade && baseGrade.length === 1) {
    const letterRank = baseGrade.charCodeAt(0) - 'a'.charCodeAt(0);
    const suffixRank = token.includes('plus') ? 0 : token.includes('minus') ? 2 : 1;

    return (letterRank * 10) + suffixRank;
  }

  return 999;
}

function buildCosmeticGradeFilterOptions(overallGradeOptions) {
  const gradeOptions = (Array.isArray(overallGradeOptions) ? overallGradeOptions : [])
    .filter((option) => !isNotYetGradedToken(option.code) && !isNotYetGradedToken(option.value) && !isNotYetGradedToken(option.label))
    .map((option) => ({
      ...option,
      filterValue: `grade:${option.id}`
    }))
    .sort((left, right) => {
      const rankDifference = getCosmeticGradeSortRank(left) - getCosmeticGradeSortRank(right);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return String(left.label || left.code || '').localeCompare(String(right.label || right.code || ''));
    });

  return [
    ...gradeOptions,
    {
      id: 'needs',
      label: 'Not Yet Graded',
      filterValue: 'needs',
      filterIds: []
    }
  ];
}

function getUnitOwnerUserSql(state, tableAlias = 'u') {
  return state && state.assignmentCapabilities && state.assignmentCapabilities.hasAssignedToUserId
    ? `${tableAlias}.assigned_to_user_id`
    : `${tableAlias}.created_by_user_id`;
}

async function getTechUnitFormOptions(options = {}) {
  const state = await getUnitTableState();
  const includeCurrentLotId = normalizeOptionalInteger(options.includeCurrentLotId);
  const includeCurrentUnitModelId = normalizeOptionalInteger(options.includeCurrentUnitModelId);
  const includeCurrentProcessorModelId = normalizeOptionalInteger(options.includeCurrentProcessorModelId);
  const { assignableLots, lotMap } = await getLotMap();
  const currentLot = includeCurrentLotId ? lotMap.get(includeCurrentLotId) || null : null;
  const currentLotIsSelectable = currentLot
    ? assignableLots.some((lot) => Number(lot.lot_id) === includeCurrentLotId)
    : false;
  const lots = currentLot && !currentLotIsSelectable
    ? sortLotsByName([
      ...assignableLots,
      {
        ...currentLot,
        isCurrentLot: true,
        isCurrentLotClosed: Number(currentLot.is_closed || 0) === 1
      }
    ])
    : assignableLots;

  const [
    unitCategories,
    unitStatuses,
    ramTypes,
    storageTypes,
    storageWipeStatuses,
    operatingSystems,
    manufacturers,
    unitModels,
    processorBrands,
    processorModels,
    productionWeightOptions
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    listConfigValuesByCategoryCodes(['unit_statuses', 'unit_status', 'current_unit_statuses', 'current_unit_status']),
    listConfigValuesByCategoryCodes(['ram_types', 'ram_type']),
    listConfigValuesByCategoryCodes(['storage_types', 'storage_type', 'ssd_types', 'ssd_type']),
    listConfigValuesByCategoryCodes(['storage_wipe_statuses', 'storage_wipe_status', 'wipe_statuses', 'wipe_status']),
    listConfigValuesByCategoryCodes(['operating_systems', 'operating_system']),
    listManufacturers(),
    listUnitModels({ includeUnitModelId: includeCurrentUnitModelId }),
    listProcessorBrands(),
    listProcessorModels({ includeProcessorModelId: includeCurrentProcessorModelId }),
    productionWeightModel.listProductionWeightOptions()
  ]);

  const receivedStatus = unitStatuses.find((status) => status.code === 'received') || unitStatuses[0] || null;
  const unitCategoriesWithProductionWeights = unitCategories.map((category) => {
    const defaultProductionWeight = productionWeightModel.findProductionWeightOptionForCategory(category, productionWeightOptions);

    return {
      ...category,
      defaultProductionWeightValue: defaultProductionWeight && defaultProductionWeight.weightValue !== null && defaultProductionWeight.weightValue !== undefined
        ? productionWeightModel.formatWeightValue(defaultProductionWeight.weightValue)
        : '',
      defaultProductionWeightLabel: defaultProductionWeight ? defaultProductionWeight.label : ''
    };
  });

  return {
    supported: state.exists && Boolean(state.primaryKeyColumn),
    message: state.exists
      ? 'Unit form is connected to the current units table schema.'
      : 'The units table does not exist yet.',
    assetTagPrefix: getAssetTagPrefix(),
    state,
    lots,
    currentLotIsClosed: Boolean(currentLot && Number(currentLot.is_closed || 0) === 1),
    unitCategories: unitCategoriesWithProductionWeights,
    unitStatuses,
    defaultUnitStatusId: receivedStatus ? String(receivedStatus.id) : '',
    memoryInstallTypes: MEMORY_INSTALL_TYPE_OPTIONS,
    ramTypes,
    storageTypes,
    storageWipeStatuses,
    operatingSystems,
    manufacturers,
    unitModels,
    processorBrands,
    processorModels,
    productionWeightOptions,
    productionWeightCapabilities: state.productionWeightCapabilities
  };
}

function getBlankUnitFormData(formOptions = null) {
  return {
    assetTag: '',
    unitSerialNumber: '',
    biosSerialNumber: '',
    lotId: '',
    unitCategoryConfigValueId: '',
    currentUnitStatusConfigValueId: formOptions ? formOptions.defaultUnitStatusId : '',
    manufacturerId: '',
    unitModelId: '',
    processorModelId: '',
    processorSpeedGhz: '',
    ramGb: '',
    ramTypeConfigValueId: '',
    storageGb: '',
    storageTypeConfigValueId: '',
    operatingSystemConfigValueId: '',
    productionWeightOverride: '',
    productionWeightNotes: '',
    productionWeightDetails: {
      effectiveWeight: null,
      formattedEffectiveWeight: '—',
      sourceCode: 'not_configured',
      sourceLabel: 'Calculated after save',
      notes: '',
      hasOverride: false
    },
    memoryModules: getBlankMemoryModuleRows(),
    storageDevices: getBlankStorageDeviceRows(),
    hardwareNotes: '',
    cosmeticNotes: ''
  };
}

async function getUnitById(unitId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT *
      FROM units
      WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
      LIMIT 1
    `,
    [unitId]
  );

  return rows[0] || null;
}

async function listCurrentMemoryModulesForUnit(unitId) {
  const columns = await getTableColumns('unit_memory_modules');

  if (columns.size === 0) {
    return getBlankMemoryModuleRows();
  }

  const memoryInstallTypeSelect = hasColumn(columns, 'memory_install_type_code')
    ? 'memory_install_type_code'
    : `'${DEFAULT_MEMORY_INSTALL_TYPE_CODE}' AS memory_install_type_code`;

  const [rows] = await pool.query(
    `
      SELECT
        unit_memory_module_id,
        slot_label,
        size_gb,
        ram_type_config_value_id,
        ${memoryInstallTypeSelect},
        speed_mhz,
        manufacturer_name,
        part_number,
        serial_number,
        change_notes
      FROM unit_memory_modules
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY slot_label, unit_memory_module_id
    `,
    [unitId]
  );

  if (rows.length === 0) {
    return getBlankMemoryModuleRows();
  }

  return rows.map((row) => ({
    slotLabel: row.slot_label || '',
    sizeGb: row.size_gb !== null && row.size_gb !== undefined ? String(row.size_gb) : '',
    ramTypeConfigValueId: row.ram_type_config_value_id ? String(row.ram_type_config_value_id) : '',
    memoryInstallTypeCode: normalizeMemoryInstallTypeCode(row.memory_install_type_code),
    speedMhz: row.speed_mhz !== null && row.speed_mhz !== undefined ? String(row.speed_mhz) : '',
    manufacturerName: row.manufacturer_name || '',
    partNumber: row.part_number || '',
    serialNumber: row.serial_number || '',
    changeNotes: row.change_notes || ''
  }));
}

async function listCurrentStorageDevicesForUnit(unitId) {
  const exists = await tableExists('unit_storage_devices');

  if (!exists) {
    return getBlankStorageDeviceRows();
  }

  const [rows] = await pool.query(
    `
      SELECT
        unit_storage_device_id,
        slot_label,
        storage_type_config_value_id,
        size_gb,
        manufacturer_name,
        model_number,
        serial_number,
        firmware_version,
        wipe_status_config_value_id,
        change_notes
      FROM unit_storage_devices
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY slot_label, unit_storage_device_id
    `,
    [unitId]
  );

  if (rows.length === 0) {
    return getBlankStorageDeviceRows();
  }

  return rows.map((row) => ({
    slotLabel: row.slot_label || '',
    sizeGb: row.size_gb !== null && row.size_gb !== undefined ? String(row.size_gb) : '',
    storageTypeConfigValueId: row.storage_type_config_value_id ? String(row.storage_type_config_value_id) : '',
    manufacturerName: row.manufacturer_name || '',
    modelNumber: row.model_number || '',
    serialNumber: row.serial_number || '',
    firmwareVersion: row.firmware_version || '',
    wipeStatusConfigValueId: row.wipe_status_config_value_id ? String(row.wipe_status_config_value_id) : '',
    changeNotes: row.change_notes || ''
  }));
}

async function getUnitIdentifierValue(unitId, typeCode) {
  const exists = await tableExists('unit_identifiers');

  if (!exists) {
    return '';
  }

  const [rows] = await pool.query(
    `
      SELECT ui.identifier_value
      FROM unit_identifiers ui
      JOIN config_values cv
        ON cv.config_value_id = ui.identifier_type_config_value_id
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE ui.unit_id = ?
        AND cc.code = 'unit_identifier_types'
        AND cv.code = ?
      ORDER BY ui.is_primary DESC, ui.unit_identifier_id DESC
      LIMIT 1
    `,
    [unitId, typeCode]
  );

  return rows[0]?.identifier_value || '';
}

async function getUnitFormDataById(unitId, formOptions = null) {
  const unit = await getUnitById(unitId);

  if (!unit) {
    return null;
  }

  const [
    unitSerialNumber,
    biosSerialNumber,
    memoryModules,
    storageDevices
  ] = await Promise.all([
    getUnitIdentifierValue(unitId, 'unit_serial_number'),
    getUnitIdentifierValue(unitId, 'bios_serial_number'),
    listCurrentMemoryModulesForUnit(unitId),
    listCurrentStorageDevicesForUnit(unitId)
  ]);

  const { lotMap } = await getLotMap();
  const lot = lotMap.get(Number(unit.lot_id)) || null;
  const unitCategory = (formOptions && Array.isArray(formOptions.unitCategories))
    ? formOptions.unitCategories.find((category) => Number(category.id) === Number(unit.unit_category_config_value_id)) || null
    : null;
  const productionWeightOptions = formOptions && Array.isArray(formOptions.productionWeightOptions)
    ? formOptions.productionWeightOptions
    : await productionWeightModel.listProductionWeightOptions();
  const productionWeightDetails = getProductionWeightDetailsForUnit({
    row: unit,
    lot,
    unitCategory,
    productionWeightOptions
  });

  return {
    assetTag: unit.asset_number ? getDisplayAssetTag(unit.asset_number) : '',
    unitSerialNumber: normalizeIdentifierText(unitSerialNumber) || '',
    biosSerialNumber: normalizeIdentifierText(biosSerialNumber) || '',
    lotId: unit.lot_id ? String(unit.lot_id) : '',
    unitCategoryConfigValueId: unit.unit_category_config_value_id ? String(unit.unit_category_config_value_id) : '',
    currentUnitStatusConfigValueId: unit.current_unit_status_config_value_id
      ? String(unit.current_unit_status_config_value_id)
      : formOptions
        ? formOptions.defaultUnitStatusId
        : '',
    manufacturerId: unit.manufacturer_id ? String(unit.manufacturer_id) : '',
    unitModelId: unit.unit_model_id ? String(unit.unit_model_id) : '',
    processorModelId: unit.processor_model_id ? String(unit.processor_model_id) : '',
    processorSpeedGhz: unit.processor_speed_ghz !== null && unit.processor_speed_ghz !== undefined ? String(unit.processor_speed_ghz) : '',
    ramGb: unit.ram_gb !== null && unit.ram_gb !== undefined ? String(unit.ram_gb) : '',
    ramTypeConfigValueId: unit.ram_type_config_value_id ? String(unit.ram_type_config_value_id) : '',
    storageGb: unit.storage_gb !== null && unit.storage_gb !== undefined ? String(unit.storage_gb) : '',
    storageTypeConfigValueId: unit.storage_type_config_value_id ? String(unit.storage_type_config_value_id) : '',
    operatingSystemConfigValueId: unit.operating_system_config_value_id ? String(unit.operating_system_config_value_id) : '',
    productionWeightOverride: unit.production_weight_override !== null && unit.production_weight_override !== undefined ? productionWeightModel.formatWeightValue(unit.production_weight_override) : '',
    productionWeightNotes: unit.production_weight_notes || '',
    productionWeightDetails,
    memoryModules,
    storageDevices,
    hardwareNotes: unit.hardware_notes || '',
    cosmeticNotes: unit.cosmetic_notes || ''
  };
}

function optionLabelById(map, id, fallback = '') {
  const item = map.get(Number(id));

  if (!item) {
    return fallback;
  }

  return item.shortLabel || item.label || fallback;
}

function configLabelById(map, id, fallback = '') {
  const item = map.get(Number(id));

  return item ? item.label : fallback;
}

function getProductionWeightDetailsForUnit({ row = {}, lot = null, unitCategory = null, productionWeightOptions = [] } = {}) {
  return productionWeightModel.buildProductionWeightDetails({
    unitProductionWeightOverride: row.production_weight_override,
    unitProductionWeightNotes: row.production_weight_notes,
    lotDefaultProductionWeight: lot ? lot.resolved_default_production_weight : null,
    lotDefaultProductionWeightLabel: lot && lot.default_production_weight !== null && lot.default_production_weight !== undefined
      ? 'Custom lot default'
      : (lot ? lot.default_production_weight_label : ''),
    unitCategory: unitCategory || {},
    productionWeightOptions
  });
}


async function listTechUsersWithUnits() {
  const usersReady = await tableExists('users');
  const unitState = await getUnitTableState();

  if (!usersReady || !unitState.exists) {
    return [];
  }

  const parkedFilter = `AND ${getUnitParkedSql(unitState, 'u')} = 0`;
  const assignmentUserExpression = getUnitOwnerUserSql(unitState, 'u');

  const [rows] = await pool.query(
    `
      SELECT
        users.user_id,
        users.first_name,
        users.last_name,
        users.email,
        COUNT(u.unit_id) AS unit_count
      FROM users
      INNER JOIN units u
        ON ${assignmentUserExpression} = users.user_id
      WHERE ${assignmentUserExpression} IS NOT NULL
        ${parkedFilter}
      GROUP BY users.user_id, users.first_name, users.last_name, users.email
      ORDER BY users.first_name, users.last_name, users.email
    `
  );

  return rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${row.user_id}`;

    return {
      id: Number(row.user_id),
      label: name,
      count: Number(row.unit_count || 0)
    };
  });
}

async function listActiveAssignableTechnicians() {
  const [userColumns, roleColumns, userRoleColumns] = await Promise.all([
    getTableColumns('users'),
    getTableColumns('roles'),
    getTableColumns('user_roles')
  ]);

  if (userColumns.size === 0 || roleColumns.size === 0 || userRoleColumns.size === 0) {
    return [];
  }

  const activeUserFilter = hasColumn(userColumns, 'is_active') ? 'AND COALESCE(u.is_active, 1) = 1' : '';

  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',') AS role_codes
      FROM users u
      INNER JOIN user_roles ur
        ON ur.user_id = u.user_id
      INNER JOIN roles r
        ON r.role_id = ur.role_id
      WHERE r.code IN ('tech', 'tech_lead')
        ${activeUserFilter}
      GROUP BY u.user_id, u.first_name, u.last_name, u.email
      ORDER BY u.first_name, u.last_name, u.email
    `
  );

  return rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${row.user_id}`;

    return {
      id: Number(row.user_id),
      label: name,
      roleCodes: String(row.role_codes || '').split(',').filter(Boolean)
    };
  });
}

function normalizeDashboardDrilldownDate(value) {
  const stringValue = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return '';
  }

  return stringValue;
}

function normalizePositiveFilterId(value) {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}


function normalizeUnitPageSize(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (normalizedValue === UNIT_PAGE_SIZE_ALL) {
    return {
      isAll: true,
      perPage: null,
      perPageParam: UNIT_PAGE_SIZE_ALL,
      perPageLabel: 'All'
    };
  }

  const numericValue = Number(normalizedValue);
  const perPage = UNIT_PAGE_SIZE_OPTIONS.includes(numericValue)
    ? numericValue
    : DEFAULT_UNIT_PAGE_SIZE;

  return {
    isAll: false,
    perPage,
    perPageParam: String(perPage),
    perPageLabel: String(perPage)
  };
}


function normalizeUnitSort(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();

  return UNIT_SORT_OPTIONS.has(normalizedValue) ? normalizedValue : DEFAULT_UNIT_SORT;
}

function getCurrentGradeJoinSql(gradeAssessmentsTableIsReady) {
  if (!gradeAssessmentsTableIsReady) {
    return '';
  }

  return `
      LEFT JOIN (
        SELECT unit_id, overall_grade_config_value_id
        FROM (
          SELECT
            uga.unit_id,
            uga.overall_grade_config_value_id,
            ROW_NUMBER() OVER (
              PARTITION BY uga.unit_id
              ORDER BY uga.assessed_at DESC, uga.unit_grade_assessment_id DESC
            ) AS row_rank
          FROM unit_grade_assessments uga
          WHERE uga.is_current = 1
        ) ranked_current_grades
        WHERE row_rank = 1
      ) current_grade
        ON current_grade.unit_id = u.unit_id
      LEFT JOIN config_values current_grade_value
        ON current_grade_value.config_value_id = current_grade.overall_grade_config_value_id`;
}

function getCurrentOutcomeJoinSql(outcomesTableIsReady) {
  if (!outcomesTableIsReady) {
    return '';
  }

  return `
      LEFT JOIN (
        SELECT unit_id, outcome_code
        FROM (
          SELECT
            uo.unit_id,
            uo.outcome_code,
            ROW_NUMBER() OVER (
              PARTITION BY uo.unit_id
              ORDER BY uo.selected_at DESC, uo.unit_outcome_id DESC
            ) AS row_rank
          FROM unit_outcomes uo
          WHERE uo.is_current = 1
        ) ranked_current_outcomes
        WHERE row_rank = 1
      ) current_outcome
        ON current_outcome.unit_id = u.unit_id`;
}

function getGradeSortRankSql() {
  const gradeValueSql = "LOWER(COALESCE(current_grade_value.label, current_grade_value.code, current_grade_value.value, ''))";

  return `
        CASE
          WHEN current_grade_value.config_value_id IS NULL THEN 100
          WHEN ${gradeValueSql} REGEXP 'not[^a-z0-9]*yet[^a-z0-9]*graded|not[^a-z0-9]*graded|ungraded|n/?a' THEN 100
          WHEN ${gradeValueSql} LIKE 'a%' THEN 10
          WHEN ${gradeValueSql} LIKE 'b%' THEN 20
          WHEN ${gradeValueSql} LIKE 'c%' THEN 30
          WHEN ${gradeValueSql} LIKE 'd%' THEN 40
          WHEN ${gradeValueSql} LIKE 'e%' THEN 50
          ELSE 70
        END`;
}

function getUnitOrderBySql(sort, { gradeAssessmentsTableIsReady = false, outcomesTableIsReady = false } = {}) {
  const normalizedSort = normalizeUnitSort(sort);

  if (normalizedSort === 'date_asc') {
    return `
      ORDER BY u.created_at ASC, u.unit_id ASC`;
  }

  if (normalizedSort === 'tech_az' || normalizedSort === 'tech_za') {
    const techDirection = normalizedSort === 'tech_za' ? 'DESC' : 'ASC';

    return `
      ORDER BY
        CASE
          WHEN assigned_user.first_name IS NULL
            AND assigned_user.last_name IS NULL
            AND assigned_user.email IS NULL THEN 1
          ELSE 0
        END ASC,
        LOWER(COALESCE(assigned_user.first_name, '')) ${techDirection},
        LOWER(COALESCE(assigned_user.last_name, '')) ${techDirection},
        LOWER(COALESCE(assigned_user.email, '')) ${techDirection},
        u.created_at DESC,
        u.unit_id DESC`;
  }

  if ((normalizedSort === 'grade_asc' || normalizedSort === 'grade_desc') && gradeAssessmentsTableIsReady) {
    const gradeDirection = normalizedSort === 'grade_desc' ? 'DESC' : 'ASC';
    const labelDirection = normalizedSort === 'grade_desc' ? 'DESC' : 'ASC';

    return `
      ORDER BY
        ${getGradeSortRankSql()} ${gradeDirection},
        LOWER(COALESCE(current_grade_value.label, current_grade_value.code, current_grade_value.value, '')) ${labelDirection},
        u.created_at DESC,
        u.unit_id DESC`;
  }

  if ((normalizedSort === 'outcome_pass_first' || normalizedSort === 'outcome_fail_first') && outcomesTableIsReady) {
    const passRank = normalizedSort === 'outcome_fail_first' ? 20 : 10;
    const failRank = normalizedSort === 'outcome_fail_first' ? 10 : 20;

    return `
      ORDER BY
        CASE current_outcome.outcome_code
          WHEN 'pass' THEN ${passRank}
          WHEN 'fail' THEN ${failRank}
          ELSE 90
        END ASC,
        u.created_at DESC,
        u.unit_id DESC`;
  }

  return `
      ORDER BY u.created_at DESC, u.unit_id DESC`;
}

function buildUnitPagination(filters = {}, totalRows = 0) {
  const normalizedTotalRows = Math.max(0, Number(totalRows) || 0);
  const pageSize = normalizeUnitPageSize(filters.perPage);
  const totalPages = pageSize.isAll
    ? 1
    : Math.max(1, Math.ceil(normalizedTotalRows / pageSize.perPage));
  const requestedPage = Number(filters.page);
  const safeRequestedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = pageSize.isAll ? 1 : Math.min(safeRequestedPage, totalPages);
  const offset = pageSize.isAll ? 0 : (page - 1) * pageSize.perPage;
  const startRow = normalizedTotalRows === 0 ? 0 : offset + 1;
  const endRow = pageSize.isAll
    ? normalizedTotalRows
    : Math.min(offset + pageSize.perPage, normalizedTotalRows);

  return {
    page,
    perPage: pageSize.perPage,
    perPageParam: pageSize.perPageParam,
    perPageLabel: pageSize.perPageLabel,
    pageSizeOptions: UNIT_PAGE_SIZE_OPTIONS.map((option) => ({
      value: String(option),
      label: String(option)
    })).concat([{ value: UNIT_PAGE_SIZE_ALL, label: 'All' }]),
    isAll: pageSize.isAll,
    totalRows: normalizedTotalRows,
    totalPages,
    offset,
    startRow,
    endRow,
    hasPreviousPage: !pageSize.isAll && page > 1,
    hasNextPage: !pageSize.isAll && page < totalPages
  };
}

async function listTechUnits(filters = {}) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    return {
      supported: false,
      message: 'The units table or primary key column was not found yet.',
      units: [],
      filters,
      lots: [],
      pagination: buildUnitPagination(filters, 0)
    };
  }

  const { filterLots, lotMap } = await getLotMap();
  const filterLotIds = new Set(filterLots.map((lot) => String(lot.lot_id)));

  const [
    unitCategories,
    unitStatuses,
    ramTypes,
    storageTypes,
    operatingSystems,
    manufacturers,
    unitModels,
    processorBrands,
    processorModels,
    rawOverallGradeOptions,
    techUserOptions,
    productionWeightOptions
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    listConfigValuesByCategoryCodes(['unit_statuses', 'unit_status', 'current_unit_statuses', 'current_unit_status']),
    listConfigValuesByCategoryCodes(['ram_types', 'ram_type']),
    listConfigValuesByCategoryCodes(['storage_types', 'storage_type', 'ssd_types', 'ssd_type']),
    listConfigValuesByCategoryCodes(['operating_systems', 'operating_system']),
    listManufacturers(),
    listUnitModels(),
    listProcessorBrands(),
    listProcessorModels(),
    listConfigValuesByCategoryCodes(COSMETIC_GRADE_CATEGORY_CODES),
    listTechUsersWithUnits(),
    productionWeightModel.listProductionWeightOptions()
  ]);

  const unitIdentifiersTableIsReady = await tableExists('unit_identifiers');

  const unitCategoryMap = mapById(unitCategories);
  const unitStatusMap = mapById(unitStatuses);
  const ramTypeMap = mapById(ramTypes);
  const storageTypeMap = mapById(storageTypes);
  const operatingSystemMap = mapById(operatingSystems);
  const manufacturerMap = mapById(manufacturers);
  const unitModelMap = mapById(unitModels);
  const processorModelMap = mapById(processorModels);
  const overallGradeOptions = normalizeCosmeticGradeOptions(rawOverallGradeOptions);
  const gradeFilterOptions = buildCosmeticGradeFilterOptions(overallGradeOptions);

  const where = [];
  const params = [];
  const gradeAssessmentsTableIsReady = await tableExists('unit_grade_assessments');
  const outcomesTableIsReady = await tableExists('unit_outcomes');
  const searchTerms = getSearchTerms(filters.search);
  const canViewParkedUnits = filters.canViewParkedUnits === true;
  const requestedUnitState = String(filters.unitState || 'active').trim().toLowerCase();
  const unitState = canViewParkedUnits && requestedUnitState === 'parked' ? 'parked' : 'active';
  const categoryFilterId = normalizePositiveFilterId(filters.categoryId);
  const techUserFilterId = normalizePositiveFilterId(filters.techUserId);
  const createdStartDate = normalizeDashboardDrilldownDate(filters.createdStartDate);
  const createdEndDate = normalizeDashboardDrilldownDate(filters.createdEndDate);
  const createdWindow = String(filters.createdWindow || '').trim();
  const gradeFilter = String(filters.gradeFilter || '').trim();
  const sort = normalizeUnitSort(filters.sort);
  const currentUserId = normalizePositiveFilterId(filters.currentUserId);
  const restrictToCurrentAssignment = filters.restrictToCurrentAssignment === true && Boolean(currentUserId) && searchTerms.length === 0;
  const isParkedUnitState = unitState === 'parked';
  const ownershipUserSql = getUnitOwnerUserSql(state, 'u');

  where.push(`${getUnitParkedSql(state, 'u')} = ${isParkedUnitState ? '1' : '0'}`);

  if (!isParkedUnitState && filters.lotId) {
    const lotId = Number(filters.lotId);

    if (Number.isInteger(lotId) && lotId > 0 && filterLotIds.has(String(lotId))) {
      where.push('u.lot_id = ?');
      params.push(lotId);
    }
  }

  if (!isParkedUnitState && categoryFilterId) {
    where.push('u.unit_category_config_value_id = ?');
    params.push(categoryFilterId);
  }

  if (!isParkedUnitState && techUserFilterId) {
    where.push(`${ownershipUserSql} = ?`);
    params.push(techUserFilterId);
  }

  if (!isParkedUnitState && restrictToCurrentAssignment) {
    where.push(`${ownershipUserSql} = ?`);
    params.push(currentUserId);
  }

  if (!isParkedUnitState && createdStartDate) {
    where.push('u.created_at >= ?');
    params.push(`${createdStartDate} 00:00:00`);
  }

  if (!isParkedUnitState && createdEndDate) {
    where.push('u.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(`${createdEndDate} 00:00:00`);
  }

  if (!isParkedUnitState && createdWindow === '24h') {
    where.push('u.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  }

  if (!isParkedUnitState && gradeAssessmentsTableIsReady && gradeFilter === 'needs') {
    where.push(`
      NOT EXISTS (
        SELECT 1
        FROM unit_grade_assessments uga_filter
        WHERE uga_filter.unit_id = u.unit_id
          AND uga_filter.is_current = 1
      )
    `);
  } else if (!isParkedUnitState && gradeAssessmentsTableIsReady && gradeFilter === 'current') {
    where.push(`
      EXISTS (
        SELECT 1
        FROM unit_grade_assessments uga_filter
        WHERE uga_filter.unit_id = u.unit_id
          AND uga_filter.is_current = 1
      )
    `);
  } else if (!isParkedUnitState && gradeAssessmentsTableIsReady && gradeFilter.startsWith('grade:')) {
    const gradeFilterIds = getCosmeticGradeFilterIds(overallGradeOptions, gradeFilter.replace('grade:', ''));

    if (gradeFilterIds.length > 0) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM unit_grade_assessments uga_filter
          WHERE uga_filter.unit_id = u.unit_id
            AND uga_filter.is_current = 1
            AND uga_filter.overall_grade_config_value_id IN (${gradeFilterIds.map(() => '?').join(', ')})
        )
      `);
      params.push(...gradeFilterIds);
    }
  }

  if (!isParkedUnitState && searchTerms.length > 0) {
    const isMultiSearch = searchTerms.length > 1;
    const searchGroups = [];

    searchTerms.forEach((searchTerm) => {
      const normalizedSearchAssetNumber = normalizeAssetTagInput(searchTerm);
      const normalizedIdentifierSearch = compactAssetTagValue(searchTerm);
      const searchParts = [];
      const searchParams = [];

      if (normalizedSearchAssetNumber) {
        searchParts.push('u.asset_number = ?');
        searchParams.push(normalizedSearchAssetNumber);
      }

      searchParts.push('CAST(u.asset_number AS CHAR) LIKE ?');
      searchParams.push(`%${normalizedSearchAssetNumber || searchTerm}%`);

      if (unitIdentifiersTableIsReady) {
        searchParts.push(`
          EXISTS (
            SELECT 1
            FROM unit_identifiers ui_search
            WHERE ui_search.unit_id = u.unit_id
              AND (
                ui_search.identifier_value LIKE ?
                OR ui_search.normalized_value LIKE ?
              )
          )
        `);
        searchParams.push(`%${searchTerm}%`, `%${normalizedIdentifierSearch}%`);
      }

      if (!isMultiSearch) {
        searchParts.push(
          'u.hardware_notes LIKE ?',
          'u.cosmetic_notes LIKE ?',
          'm.name LIKE ?',
          'um.model_name LIKE ?',
          'pm.model_code LIKE ?',
          'cv_category.label LIKE ?',
          'cv_ram_type.label LIKE ?',
          'cv_storage_type.label LIKE ?',
          'cv_os.label LIKE ?'
        );

        searchParams.push(
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`
        );
      }

      searchGroups.push(`(${searchParts.join(' OR ')})`);
      params.push(...searchParams);
    });

    if (searchGroups.length > 0) {
      where.push(`(${searchGroups.join(' OR ')})`);
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const unitFromSql = `
      FROM units u
      LEFT JOIN manufacturers m
        ON m.manufacturer_id = u.manufacturer_id
      LEFT JOIN unit_models um
        ON um.unit_model_id = u.unit_model_id
      LEFT JOIN processor_models pm
        ON pm.processor_model_id = u.processor_model_id
      LEFT JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN config_values cv_category
        ON cv_category.config_value_id = u.unit_category_config_value_id
      LEFT JOIN config_values cv_status
        ON cv_status.config_value_id = u.current_unit_status_config_value_id
      LEFT JOIN config_values cv_ram_type
        ON cv_ram_type.config_value_id = u.ram_type_config_value_id
      LEFT JOIN config_values cv_storage_type
        ON cv_storage_type.config_value_id = u.storage_type_config_value_id
      LEFT JOIN config_values cv_os
        ON cv_os.config_value_id = u.operating_system_config_value_id
      LEFT JOIN users assigned_user
        ON assigned_user.user_id = ${ownershipUserSql}
      ${getCurrentGradeJoinSql(gradeAssessmentsTableIsReady)}
      ${getCurrentOutcomeJoinSql(outcomesTableIsReady)}
      ${whereSql}
  `;

  const [countRows] = await pool.query(
    `
      SELECT COUNT(*) AS total_rows
      ${unitFromSql}
    `,
    params
  );
  const pagination = buildUnitPagination(filters, countRows && countRows[0] ? countRows[0].total_rows : 0);
  const rowLimitSql = pagination.isAll ? '' : 'LIMIT ? OFFSET ?';
  const rowParams = pagination.isAll ? params : [...params, pagination.perPage, pagination.offset];

  const [rows] = await pool.query(
    `
      SELECT
        u.*,
        assigned_user.first_name AS assigned_first_name,
        assigned_user.last_name AS assigned_last_name,
        assigned_user.email AS assigned_email
      ${unitFromSql}
      ${getUnitOrderBySql(sort, { gradeAssessmentsTableIsReady, outcomesTableIsReady })}
      ${rowLimitSql}
    `,
    rowParams
  );

  const units = rows.map((row) => {
    const lot = lotMap.get(Number(row.lot_id));
    const assetTag = getDisplayAssetTag(row.asset_number);

    const manufacturerLabel = optionLabelById(manufacturerMap, row.manufacturer_id, '');
    const modelLabel = optionLabelById(unitModelMap, row.unit_model_id, '');
    const processorLabel = optionLabelById(processorModelMap, row.processor_model_id, '');
    const ramTypeLabel = configLabelById(ramTypeMap, row.ram_type_config_value_id, '');
    const storageTypeLabel = configLabelById(storageTypeMap, row.storage_type_config_value_id, '');
    const operatingSystemLabel = configLabelById(operatingSystemMap, row.operating_system_config_value_id, '');
    const unitCategory = unitCategoryMap.get(Number(row.unit_category_config_value_id)) || null;
    const productionWeightDetails = getProductionWeightDetailsForUnit({
      row,
      lot,
      unitCategory,
      productionWeightOptions
    });
    const currentLotWeight = lot && lot.resolved_default_production_weight !== null && lot.resolved_default_production_weight !== undefined
      ? productionWeightModel.normalizeWeightValue(lot.resolved_default_production_weight)
      : null;
    const unitProductionWeightOverride = row.production_weight_override !== null && row.production_weight_override !== undefined
      ? productionWeightModel.normalizeWeightValue(row.production_weight_override)
      : null;

    const currentAssignmentUserId = state.assignmentCapabilities.hasAssignedToUserId && row.assigned_to_user_id
      ? Number(row.assigned_to_user_id)
      : (row.created_by_user_id ? Number(row.created_by_user_id) : null);
    const isReadOnlyForCurrentUser = Boolean(
      filters.restrictToCurrentAssignment === true &&
      searchTerms.length > 0 &&
      currentUserId &&
      currentAssignmentUserId !== currentUserId
    );

    const specParts = [
      manufacturerLabel,
      modelLabel,
      processorLabel,
      row.ram_gb ? `${row.ram_gb}GB Memory` : '',
      ramTypeLabel,
      row.storage_gb ? `${row.storage_gb}GB Storage` : '',
      storageTypeLabel
    ].filter(Boolean);

    return {
      unitId: row.unit_id,
      assetNumber: row.asset_number,
      assetTag,
      label: assetTag || 'No asset tag',
      lotId: row.lot_id,
      lotName: lot ? lot.lot_name : (isUnitParked(row) ? 'No active lot' : 'Lot name not available'),
      statusLabel: configLabelById(unitStatusMap, row.current_unit_status_config_value_id, 'Unknown'),
      categoryLabel: configLabelById(unitCategoryMap, row.unit_category_config_value_id, 'Unknown'),
      productionWeight: productionWeightDetails.effectiveWeight,
      formattedProductionWeight: productionWeightDetails.formattedEffectiveWeight,
      productionWeightSourceCode: productionWeightDetails.sourceCode,
      productionWeightSourceLabel: productionWeightDetails.sourceLabel,
      productionWeightSourceDescription: productionWeightDetails.sourceDescription,
      productionWeightPriorityPath: productionWeightDetails.priorityPath,
      productionWeightHasOverride: productionWeightDetails.hasOverride,
      productionWeightNotes: productionWeightDetails.notes,
      isLotClosed: Boolean(lot && Number(lot.is_closed || 0) === 1),
      currentLotWeight,
      formattedCurrentLotWeight: productionWeightModel.formatWeightValue(currentLotWeight),
      unitProductionWeightOverride,
      formattedUnitProductionWeightOverride: productionWeightModel.formatWeightValue(unitProductionWeightOverride),
      hasUnitProductionWeightOverride: unitProductionWeightOverride !== null,
      manufacturerLabel: manufacturerLabel || '—',
      modelLabel: modelLabel || '—',
      processorLabel: processorLabel || '—',
      processorSpeedGhz: row.processor_speed_ghz !== null && row.processor_speed_ghz !== undefined ? row.processor_speed_ghz : '',
      ramGb: row.ram_gb || '',
      ramTypeLabel: ramTypeLabel || '—',
      storageGb: row.storage_gb || '',
      storageTypeLabel: storageTypeLabel || '—',
      operatingSystemLabel: operatingSystemLabel || '—',
      specSummary: specParts.length > 0 ? specParts.join(' · ') : 'No specs entered yet',
      hardwareNotes: row.hardware_notes || '',
      cosmeticNotes: row.cosmetic_notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      assignedToUserId: currentAssignmentUserId,
      assignedToName: [row.assigned_first_name, row.assigned_last_name].filter(Boolean).join(' ').trim() || row.assigned_email || '',
      isUnassigned: state.assignmentCapabilities.hasAssignedToUserId ? !row.assigned_to_user_id : false,
      isReadOnlyForCurrentUser,
      isParked: isUnitParked(row),
      parkedAt: state.parkingCapabilities.hasParkedAt
        ? row.parked_at
        : (state.legacyArchiveCapabilities.hasArchivedAt ? row.archived_at : null)
    };
  });

  return {
    supported: true,
    message: 'Tech units loaded.',
    assetTagPrefix: getAssetTagPrefix(),
    units,
    filters: {
      ...filters,
      search: isParkedUnitState ? '' : filters.search,
      lotId: isParkedUnitState ? '' : filters.lotId,
      categoryId: isParkedUnitState ? '' : filters.categoryId,
      gradeFilter: isParkedUnitState ? '' : filters.gradeFilter,
      techUserId: isParkedUnitState ? '' : filters.techUserId,
      createdStartDate: isParkedUnitState ? '' : filters.createdStartDate,
      createdEndDate: isParkedUnitState ? '' : filters.createdEndDate,
      createdWindow: isParkedUnitState ? '' : filters.createdWindow,
      unitState,
      sort,
      page: String(pagination.page),
      perPage: pagination.perPageParam
    },
    unitState,
    canViewParkedUnits,
    lots: filterLots,
    unitCategories,
    overallGradeOptions,
    gradeFilterOptions,
    rawOverallGradeOptions,
    techUserOptions,
    pagination
  };
}

async function getIdentifierTypeId(typeCode, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT cv.config_value_id
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = 'unit_identifier_types'
        AND cv.code = ?
      LIMIT 1
    `,
    [typeCode]
  );

  return rows[0]?.config_value_id || null;
}

async function getIdentifierTypeMap(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        cv.code,
        cv.config_value_id
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = 'unit_identifier_types'
        AND cv.code IN ('asset_tag', 'unit_serial_number', 'bios_serial_number')
    `
  );

  const typeMap = new Map();

  rows.forEach((row) => {
    typeMap.set(row.code, Number(row.config_value_id));
  });

  return typeMap;
}

function getDuplicateUnitMessage(matches, assetTagPrefix = getAssetTagPrefix()) {
  const matchList = Array.isArray(matches) ? matches : [];

  if (matchList.length === 0) {
    return 'A matching unit already exists. Search for the existing unit before creating a new one.';
  }

  const firstMatch = matchList[0];
  const identifierLabel = firstMatch.identifierTypeLabel || 'Identifier';
  const identifierValue = firstMatch.identifierValue || firstMatch.normalizedValue || 'matching value';
  const unitLabel = firstMatch.assetNumber
    ? getDisplayAssetTag(firstMatch.assetNumber)
    : 'the existing unit';

  if (firstMatch.identifierTypeCode === 'asset_tag') {
    return `That ${assetTagPrefix} asset tag already belongs to ${unitLabel}. Search for and update the existing unit instead of creating a duplicate.`;
  }

  return `${identifierLabel} ${identifierValue} already belongs to ${unitLabel}. Search for and update the existing unit instead of creating a duplicate.`;
}

function createDuplicateIdentifierError(matches) {
  const error = new Error(getDuplicateUnitMessage(matches));
  error.code = 'BWT_DUPLICATE_IDENTIFIER';
  error.duplicateMatches = matches;

  return error;
}

async function findDuplicateUnitsFromIdentifiers(identifierEntries, excludeUnitId = null, connection = pool) {
  const exists = await tableExists('unit_identifiers');

  if (!exists || identifierEntries.length === 0) {
    return [];
  }

  const typeMap = await getIdentifierTypeMap(connection);
  const serialTypeIds = ['unit_serial_number', 'bios_serial_number']
    .map((typeCode) => typeMap.get(typeCode))
    .filter(Boolean);
  const serialTypeCodes = new Set(['unit_serial_number', 'bios_serial_number']);
  const clauses = [];
  const params = [];

  identifierEntries.forEach((entry) => {
    const typeId = typeMap.get(entry.typeCode);

    if (!typeId || !entry.normalizedValue) {
      return;
    }

    if (serialTypeCodes.has(entry.typeCode) && serialTypeIds.length > 0) {
      clauses.push(`(ui.identifier_type_config_value_id IN (${serialTypeIds.map(() => '?').join(', ')}) AND ui.normalized_value = ?)`);
      params.push(...serialTypeIds, entry.normalizedValue);
      return;
    }

    clauses.push('(ui.identifier_type_config_value_id = ? AND ui.normalized_value = ?)');
    params.push(typeId, entry.normalizedValue);
  });

  if (clauses.length === 0) {
    return [];
  }

  let excludeSql = '';

  if (excludeUnitId) {
    excludeSql = 'AND ui.unit_id <> ?';
    params.push(Number(excludeUnitId));
  }

  const [rows] = await connection.query(
    `
      SELECT
        ui.unit_identifier_id,
        ui.unit_id,
        ui.identifier_value,
        ui.normalized_value,
        cv.code AS identifier_type_code,
        cv.label AS identifier_type_label,
        u.asset_number,
        u.lot_id,
        NULL AS lot_name,
        (
          SELECT ui_unit_serial.identifier_value
          FROM unit_identifiers ui_unit_serial
          JOIN config_values cv_unit_serial
            ON cv_unit_serial.config_value_id = ui_unit_serial.identifier_type_config_value_id
          JOIN config_categories cc_unit_serial
            ON cc_unit_serial.config_category_id = cv_unit_serial.config_category_id
          WHERE ui_unit_serial.unit_id = u.unit_id
            AND cc_unit_serial.code = 'unit_identifier_types'
            AND cv_unit_serial.code = 'unit_serial_number'
          ORDER BY ui_unit_serial.unit_identifier_id DESC
          LIMIT 1
        ) AS unit_serial_number,
        (
          SELECT ui_bios_serial.identifier_value
          FROM unit_identifiers ui_bios_serial
          JOIN config_values cv_bios_serial
            ON cv_bios_serial.config_value_id = ui_bios_serial.identifier_type_config_value_id
          JOIN config_categories cc_bios_serial
            ON cc_bios_serial.config_category_id = cv_bios_serial.config_category_id
          WHERE ui_bios_serial.unit_id = u.unit_id
            AND cc_bios_serial.code = 'unit_identifier_types'
            AND cv_bios_serial.code = 'bios_serial_number'
          ORDER BY ui_bios_serial.unit_identifier_id DESC
          LIMIT 1
        ) AS bios_serial_number,
        m.name AS manufacturer_label,
        um.model_name AS model_label,
        pb.name AS processor_brand_label,
        pm.model_code AS processor_label,
        u.processor_speed_ghz
      FROM unit_identifiers ui
      JOIN config_values cv
        ON cv.config_value_id = ui.identifier_type_config_value_id
      JOIN units u
        ON u.unit_id = ui.unit_id
      LEFT JOIN lots l
        ON l.lot_id = u.lot_id
      LEFT JOIN manufacturers m
        ON m.manufacturer_id = u.manufacturer_id
      LEFT JOIN unit_models um
        ON um.unit_model_id = u.unit_model_id
      LEFT JOIN processor_models pm
        ON pm.processor_model_id = u.processor_model_id
      LEFT JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      WHERE (${clauses.join(' OR ')})
        ${excludeSql}
      ORDER BY
        CASE cv.code
          WHEN 'asset_tag' THEN 10
          WHEN 'bios_serial_number' THEN 20
          WHEN 'unit_serial_number' THEN 30
          ELSE 999
        END,
        ui.unit_identifier_id DESC
      LIMIT 10
    `,
    params
  );

  return rows.map((row) => {
    const cpuNameParts = [
      row.processor_brand_label,
      row.processor_label
    ].filter(Boolean);

    const cpuSummary = [
      cpuNameParts.join(' ').trim(),
      row.processor_speed_ghz ? `@ ${row.processor_speed_ghz}GHz` : ''
    ].filter(Boolean).join(' ');

    const modelParts = [
      row.manufacturer_label,
      row.model_label
    ].filter(Boolean);

    return {
      unitIdentifierId: Number(row.unit_identifier_id),
      unitId: Number(row.unit_id),
      identifierValue: row.identifier_value,
      normalizedValue: row.normalized_value,
      identifierTypeCode: row.identifier_type_code,
      identifierTypeLabel: row.identifier_type_label,
      assetNumber: row.asset_number ? Number(row.asset_number) : null,
      assetTag: row.asset_number ? getDisplayAssetTag(row.asset_number) : '',
      lotId: row.lot_id ? Number(row.lot_id) : null,
      lotName: row.lot_name || '',
      unitSerialNumber: row.unit_serial_number || '',
      biosSerialNumber: row.bios_serial_number || '',
      manufacturerLabel: row.manufacturer_label || '',
      modelLabel: row.model_label || '',
      processorBrandLabel: row.processor_brand_label || '',
      processorLabel: row.processor_label || '',
      processorSpeedGhz: row.processor_speed_ghz || '',
      modelSummary: modelParts.length > 0 ? modelParts.join(' · ') : '',
      cpuSummary
    };
  });
}

async function findDuplicateUnitsForForm(formData, options = {}) {
  const suppliedAssetNumber = normalizeAssetTagInput(formData.assetTag);
  const identifierEntries = buildIdentifierEntries(formData, suppliedAssetNumber);

  return findDuplicateUnitsFromIdentifiers(identifierEntries, options.excludeUnitId || null);
}

function buildDuplicateCandidateSummary(row) {
  const cpuNameParts = [
    row.processor_brand_label,
    row.processor_label
  ].filter(Boolean);

  const cpuSummary = [
    cpuNameParts.join(' ').trim(),
    row.processor_speed_ghz ? `@ ${row.processor_speed_ghz}GHz` : ''
  ].filter(Boolean).join(' ');

  const modelParts = [
    row.manufacturer_label,
    row.model_label
  ].filter(Boolean);

  return {
    unitId: Number(row.unit_id),
    assetNumber: row.asset_number ? Number(row.asset_number) : null,
    assetTag: row.asset_number ? getDisplayAssetTag(row.asset_number) : '',
    lotId: row.lot_id ? Number(row.lot_id) : null,
    lotName: row.lot_name || '',
    isParked: Number(row.is_parked || 0) === 1 || Number(row.is_archived || 0) === 1,
    isClosedLot: Number(row.lot_is_closed || 0) === 1,
    unitSerialNumber: normalizeIdentifierText(row.unit_serial_number) || '',
    biosSerialNumber: normalizeIdentifierText(row.bios_serial_number) || '',
    modelSummary: modelParts.length > 0 ? modelParts.join(' · ') : '',
    cpuSummary,
    assignedToUserId: row.assigned_to_user_id ? Number(row.assigned_to_user_id) : null,
    assignedToName: [row.assigned_first_name, row.assigned_last_name].filter(Boolean).join(' ').trim() || row.assigned_email || '',
    matchedIdentifiers: []
  };
}

async function findSerialDuplicateCandidates({ unitSerialNumber = '', biosSerialNumber = '' } = {}, connection = pool) {
  const inputValues = [
    { field: 'unitSerialNumber', label: 'Unit Serial', normalizedValue: normalizeIdentifierComparableValue(unitSerialNumber) },
    { field: 'biosSerialNumber', label: 'BIOS Serial', normalizedValue: normalizeIdentifierComparableValue(biosSerialNumber) }
  ].filter((entry) => entry.normalizedValue);

  const normalizedValues = [...new Set(inputValues.map((entry) => entry.normalizedValue))];

  if (!await tableExists('unit_identifiers') || normalizedValues.length === 0) {
    return [];
  }

  const typeMap = await getIdentifierTypeMap(connection);
  const serialTypeIds = ['unit_serial_number', 'bios_serial_number']
    .map((typeCode) => typeMap.get(typeCode))
    .filter(Boolean);

  if (serialTypeIds.length === 0) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        ui.unit_identifier_id,
        ui.unit_id,
        ui.identifier_value,
        ui.normalized_value,
        cv.code AS identifier_type_code,
        cv.label AS identifier_type_label,
        u.asset_number,
        u.lot_id,
        u.assigned_to_user_id,
        COALESCE(u.is_parked, 0) AS is_parked,
        COALESCE(u.is_archived, 0) AS is_archived,
        l.name AS lot_name,
        COALESCE(l.is_closed, 0) AS lot_is_closed,
        (
          SELECT ui_unit_serial.identifier_value
          FROM unit_identifiers ui_unit_serial
          JOIN config_values cv_unit_serial
            ON cv_unit_serial.config_value_id = ui_unit_serial.identifier_type_config_value_id
          JOIN config_categories cc_unit_serial
            ON cc_unit_serial.config_category_id = cv_unit_serial.config_category_id
          WHERE ui_unit_serial.unit_id = u.unit_id
            AND cc_unit_serial.code = 'unit_identifier_types'
            AND cv_unit_serial.code = 'unit_serial_number'
          ORDER BY ui_unit_serial.unit_identifier_id DESC
          LIMIT 1
        ) AS unit_serial_number,
        (
          SELECT ui_bios_serial.identifier_value
          FROM unit_identifiers ui_bios_serial
          JOIN config_values cv_bios_serial
            ON cv_bios_serial.config_value_id = ui_bios_serial.identifier_type_config_value_id
          JOIN config_categories cc_bios_serial
            ON cc_bios_serial.config_category_id = cv_bios_serial.config_category_id
          WHERE ui_bios_serial.unit_id = u.unit_id
            AND cc_bios_serial.code = 'unit_identifier_types'
            AND cv_bios_serial.code = 'bios_serial_number'
          ORDER BY ui_bios_serial.unit_identifier_id DESC
          LIMIT 1
        ) AS bios_serial_number,
        m.name AS manufacturer_label,
        um.model_name AS model_label,
        pb.name AS processor_brand_label,
        pm.model_code AS processor_label,
        u.processor_speed_ghz,
        assigned_user.first_name AS assigned_first_name,
        assigned_user.last_name AS assigned_last_name,
        assigned_user.email AS assigned_email
      FROM unit_identifiers ui
      JOIN config_values cv
        ON cv.config_value_id = ui.identifier_type_config_value_id
      JOIN units u
        ON u.unit_id = ui.unit_id
      LEFT JOIN lots l
        ON l.lot_id = u.lot_id
      LEFT JOIN manufacturers m
        ON m.manufacturer_id = u.manufacturer_id
      LEFT JOIN unit_models um
        ON um.unit_model_id = u.unit_model_id
      LEFT JOIN processor_models pm
        ON pm.processor_model_id = u.processor_model_id
      LEFT JOIN processor_brands pb
        ON pb.processor_brand_id = pm.processor_brand_id
      LEFT JOIN users assigned_user
        ON assigned_user.user_id = u.assigned_to_user_id
      WHERE ui.identifier_type_config_value_id IN (${serialTypeIds.map(() => '?').join(', ')})
        AND ui.normalized_value IN (${normalizedValues.map(() => '?').join(', ')})
      ORDER BY u.unit_id ASC, ui.unit_identifier_id ASC
      LIMIT 40
    `,
    [...serialTypeIds, ...normalizedValues]
  );

  const candidates = new Map();

  rows.forEach((row) => {
    const unitId = Number(row.unit_id);

    if (!candidates.has(unitId)) {
      candidates.set(unitId, buildDuplicateCandidateSummary(row));
    }

    const matchingInputs = inputValues
      .filter((entry) => entry.normalizedValue === row.normalized_value)
      .map((entry) => entry.label);

    candidates.get(unitId).matchedIdentifiers.push({
      identifierTypeCode: row.identifier_type_code || '',
      identifierTypeLabel: row.identifier_type_label || 'Serial identifier',
      identifierValue: normalizeIdentifierText(row.identifier_value) || '',
      matchingInputs
    });
  });

  return [...candidates.values()];
}

function isRegularTechDuplicateAssumptionActor(actorRoleCodes) {
  const safeRoleCodes = Array.isArray(actorRoleCodes)
    ? actorRoleCodes.map((roleCode) => String(roleCode || '').trim())
    : [];

  const hasElevatedRole = safeRoleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));

  return safeRoleCodes.includes('tech') && !hasElevatedRole;
}

function createDuplicateAssumptionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getDuplicateAssumptionEligibility({
  candidate,
  destinationLot = null,
  destinationIsAssignable = false,
  lotAssumptionPolicyAvailable = false,
  actorRoleCodes = []
} = {}) {
  if (!isRegularTechDuplicateAssumptionActor(actorRoleCodes)) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_ROLE_REQUIRED',
      message: 'Existing-unit assumption is available only to regular Tech users during Create Unit intake. Tech Leads, Management, and Admin should use the Unit Browser workflow.'
    };
  }

  if (!lotAssumptionPolicyAvailable) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_MIGRATION_REQUIRED',
      message: 'Duplicate unit assumption is not ready yet. Run the Step 7e.2 database migration first.'
    };
  }

  if (!destinationLot) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_DESTINATION_REQUIRED',
      message: 'Select an open work lot before assessing whether this existing unit can be assumed.'
    };
  }

  if (!destinationIsAssignable) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_DESTINATION_INVALID',
      message: 'The selected work lot is no longer open, visible, and assignable.'
    };
  }

  if (Number(destinationLot.allow_duplicate_unit_assumption || 0) !== 1) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_DESTINATION_DISABLED',
      message: 'The selected work lot does not allow duplicate-match unit assumption. Choose an enabled work lot or use the override workflow.'
    };
  }

  if (!candidate || !candidate.unitId) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_CANDIDATE_INVALID',
      message: 'The selected duplicate candidate could not be verified.'
    };
  }

  if (candidate.isParked) {
    return {
      allowed: true,
      requiresOverride: false,
      code: '',
      message: 'This Parked unit can be returned directly into the selected work lot and assigned to you.'
    };
  }

  if (!candidate.lotId) {
    return {
      allowed: false,
      requiresOverride: false,
      code: 'BWT_DUPLICATE_ASSUMPTION_SOURCE_INVALID',
      message: 'This Active unit has no current lot. Use the Unit Browser so an elevated user can correct its operational state.'
    };
  }

  if (Number(candidate.lotId) === Number(destinationLot.lot_id)) {
    return {
      allowed: false,
      requiresOverride: true,
      code: 'BWT_DUPLICATE_ASSUMPTION_SAME_LOT',
      message: 'This unit is already Active in the selected work lot. It cannot be assumed again in the same lot because that could lead to duplicate processing or credit. Request an override when intentional rework is needed.'
    };
  }

  if (candidate.isClosedLot) {
    return {
      allowed: false,
      requiresOverride: true,
      code: 'BWT_DUPLICATE_ASSUMPTION_CLOSED_SOURCE',
      message: 'This unit is currently in a closed lot. A regular Tech must request an override instead of assuming it directly.'
    };
  }

  return {
    allowed: true,
    requiresOverride: false,
    code: '',
    message: 'This existing unit can be assumed into the selected work lot and assigned to you.'
  };
}

async function getDuplicateAssumptionCandidates({
  unitSerialNumber = '',
  biosSerialNumber = '',
  destinationLotId = null,
  actorRoleCodes = []
} = {}) {
  const [candidates, lotColumns, lotState] = await Promise.all([
    findSerialDuplicateCandidates({ unitSerialNumber, biosSerialNumber }),
    getTableColumns('lots'),
    getLotMap()
  ]);

  const safeDestinationLotId = normalizeOptionalInteger(destinationLotId);
  const destinationLot = safeDestinationLotId ? lotState.lotMap.get(safeDestinationLotId) || null : null;
  const destinationIsAssignable = safeDestinationLotId
    ? lotState.assignableLots.some((lot) => Number(lot.lot_id) === safeDestinationLotId)
    : false;
  const lotAssumptionPolicyAvailable = hasColumn(lotColumns, 'allow_duplicate_unit_assumption');

  return candidates.map((candidate) => ({
    ...candidate,
    duplicateAssumption: getDuplicateAssumptionEligibility({
      candidate,
      destinationLot,
      destinationIsAssignable,
      lotAssumptionPolicyAvailable,
      actorRoleCodes
    })
  }));
}

function getDuplicateMatchNote(candidate) {
  const matched = Array.isArray(candidate && candidate.matchedIdentifiers)
    ? candidate.matchedIdentifiers
    : [];
  const summary = matched
    .map((identifier) => {
      const inputs = Array.isArray(identifier.matchingInputs) && identifier.matchingInputs.length > 0
        ? identifier.matchingInputs.join(' / ')
        : 'Serial';
      const label = identifier.identifierTypeLabel || 'serial identifier';
      const value = identifier.identifierValue || '—';

      return `${inputs} matched ${label}: ${value}`;
    })
    .join('; ');

  return summary || 'A matching Unit Serial or BIOS Serial was confirmed.';
}

async function assumeExistingTechUnitFromDuplicateMatch({
  unitId,
  unitSerialNumber = '',
  biosSerialNumber = '',
  destinationLotId,
  assumedByUserId,
  actorRoleCodes = []
}) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeDestinationLotId = normalizeRequiredInteger(destinationLotId);
  const safeAssumedByUserId = normalizeRequiredInteger(assumedByUserId);
  const state = await getUnitTableState();
  const lotColumns = await getTableColumns('lots');

  if (!safeUnitId || !safeDestinationLotId || !safeAssumedByUserId) {
    throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_INPUT_INVALID', 'Select an existing unit and an eligible work lot before assuming the unit.');
  }

  if (!isRegularTechDuplicateAssumptionActor(actorRoleCodes)) {
    throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_ROLE_REQUIRED', 'Existing-unit assumption is available only to regular Tech users during Create Unit intake.');
  }

  if (!hasColumn(lotColumns, 'allow_duplicate_unit_assumption')) {
    throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_MIGRATION_REQUIRED', 'Duplicate unit assumption is not ready yet. Run the Step 7e.2 database migration first.');
  }

  if (!state.exists || !state.primaryKeyColumn || !state.assignmentCapabilities.hasAssignedToUserId || !state.parkingCapabilities.hasIsParked) {
    throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_SCHEMA_REQUIRED', 'The required unit assignment and Parked lifecycle fields are not ready.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const candidates = await findSerialDuplicateCandidates({ unitSerialNumber, biosSerialNumber }, connection);
    const originalCandidate = candidates.find((candidate) => Number(candidate.unitId) === safeUnitId) || null;

    if (!originalCandidate) {
      throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_MATCH_REQUIRED', 'The selected unit no longer matches the serial values entered in this Create Unit form. Refresh the serial check and choose a matching candidate.');
    }

    const [lockedRows] = await connection.query(
      `
        SELECT
          u.*,
          COALESCE(l.is_closed, 0) AS current_lot_is_closed
        FROM units u
        LEFT JOIN lots l
          ON l.lot_id = u.lot_id
        WHERE u.${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeUnitId]
    );

    const lockedUnit = lockedRows[0] || null;

    if (!lockedUnit) {
      throw createDuplicateAssumptionError('BWT_DUPLICATE_ASSUMPTION_NOT_FOUND', 'The selected existing unit could not be found.');
    }

    const refreshedCandidate = {
      ...originalCandidate,
      lotId: normalizeOptionalInteger(lockedUnit.lot_id),
      isParked: isUnitParked(lockedUnit),
      isClosedLot: Number(lockedUnit.current_lot_is_closed || 0) === 1,
      assignedToUserId: normalizeOptionalInteger(lockedUnit.assigned_to_user_id)
    };

    const lotState = await getLotMap();
    const destinationLot = lotState.lotMap.get(safeDestinationLotId) || null;
    const destinationIsAssignable = lotState.assignableLots.some((lot) => Number(lot.lot_id) === safeDestinationLotId);
    const eligibility = getDuplicateAssumptionEligibility({
      candidate: refreshedCandidate,
      destinationLot,
      destinationIsAssignable,
      lotAssumptionPolicyAvailable: true,
      actorRoleCodes
    });

    if (!eligibility.allowed) {
      throw createDuplicateAssumptionError(eligibility.code || 'BWT_DUPLICATE_ASSUMPTION_BLOCKED', eligibility.message);
    }

    const wasParked = refreshedCandidate.isParked;
    const previousLotId = normalizeOptionalInteger(lockedUnit.lot_id);
    const previousAssignedToUserId = normalizeOptionalInteger(lockedUnit.assigned_to_user_id);
    const matchNote = getDuplicateMatchNote(originalCandidate);
    const assumptionNote = `Assumed through duplicate serial intake. ${matchNote}`;
    const updates = ['lot_id = ?', 'assigned_to_user_id = ?'];
    const values = [safeDestinationLotId, safeAssumedByUserId];

    if (state.assignmentCapabilities.hasAssignedAt) {
      updates.push('assigned_at = ?');
      values.push(new Date());
    }

    if (state.assignmentCapabilities.hasAssignmentUpdatedByUserId) {
      updates.push('assignment_updated_by_user_id = ?');
      values.push(safeAssumedByUserId);
    }

    if (wasParked) {
      updates.push('is_parked = 0', 'parked_at = NULL', 'parked_by_user_id = NULL');

      if (state.legacyArchiveCapabilities.hasIsArchived) {
        updates.push('is_archived = 0');
      }

      if (state.legacyArchiveCapabilities.hasArchivedAt) {
        updates.push('archived_at = NULL');
      }

      if (state.legacyArchiveCapabilities.hasArchivedByUserId) {
        updates.push('archived_by_user_id = NULL');
      }
    }

    await connection.query(
      `
        UPDATE units
        SET ${updates.join(', ')}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
      `,
      [...values, safeUnitId]
    );

    await recordUnitLotHistory(connection, {
      unitId: safeUnitId,
      fromLotId: wasParked ? null : previousLotId,
      toLotId: safeDestinationLotId,
      movedByUserId: safeAssumedByUserId,
      notes: assumptionNote
    });

    if (wasParked || previousAssignedToUserId !== safeAssumedByUserId) {
      await recordUnitAssignmentHistory(connection, {
        unitId: safeUnitId,
        fromUserId: wasParked ? null : previousAssignedToUserId,
        toUserId: safeAssumedByUserId,
        changedByUserId: safeAssumedByUserId,
        changeSource: 'duplicate_assumption',
        notes: assumptionNote
      });
    }

    if (wasParked) {
      await recordUnitParkHistory(connection, {
        unitId: safeUnitId,
        eventType: 'returned_to_active',
        toLotId: safeDestinationLotId,
        toAssignedToUserId: safeAssumedByUserId,
        changedByUserId: safeAssumedByUserId,
        notes: `Unit returned to Active through duplicate serial assumption. ${matchNote} Historical work and credit records were retained without changes.`
      });
    }

    await connection.commit();

    return {
      unitId: safeUnitId,
      assetTag: originalCandidate.assetTag || getDisplayAssetTag(lockedUnit.asset_number),
      destinationLotName: destinationLot.lot_name || '',
      wasParked
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveUnitIdentifier(connection, unitId, typeMap, entry) {
  const identifierTypeId = typeMap.get(entry.typeCode);

  if (!identifierTypeId || !entry.value || !entry.normalizedValue) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_identifiers (
        unit_id,
        identifier_type_config_value_id,
        identifier_value,
        normalized_value,
        is_primary
      )
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        identifier_value = IF(unit_id = VALUES(unit_id), VALUES(identifier_value), identifier_value),
        is_primary = IF(unit_id = VALUES(unit_id), VALUES(is_primary), is_primary)
    `,
    [unitId, identifierTypeId, entry.value, entry.normalizedValue, entry.isPrimary ? 1 : 0]
  );
}

async function saveUnitIdentifiers(connection, unitId, formData, assetNumber) {
  const exists = await tableExists('unit_identifiers');

  if (!exists) {
    return;
  }

  const typeMap = await getIdentifierTypeMap(connection);
  const serialTypeIds = ['unit_serial_number', 'bios_serial_number']
    .map((typeCode) => typeMap.get(typeCode))
    .filter(Boolean);

  if (serialTypeIds.length > 0) {
    await connection.query(
      `
        DELETE FROM unit_identifiers
        WHERE unit_id = ?
          AND identifier_type_config_value_id IN (${serialTypeIds.map(() => '?').join(', ')})
      `,
      [unitId, ...serialTypeIds]
    );
  }

  const identifierEntries = buildIdentifierEntries(formData, assetNumber);

  for (const entry of identifierEntries) {
    await saveUnitIdentifier(connection, unitId, typeMap, entry);
  }
}

function addColumnValueIfPresent(columns, values, tableColumns, columnName, value) {
  if (!hasColumn(tableColumns, columnName)) {
    return;
  }

  columns.push(columnName);
  values.push(value);
}

async function deactivateCurrentRows(connection, tableName, unitId) {
  const tableColumns = await getTableColumns(tableName);

  if (tableColumns.size === 0 || !hasColumn(tableColumns, 'unit_id')) {
    return tableColumns;
  }

  if (hasColumn(tableColumns, 'is_current')) {
    const removedAtSql = hasColumn(tableColumns, 'removed_at')
      ? ', removed_at = COALESCE(removed_at, NOW())'
      : '';

    await connection.query(
      `
        UPDATE ${escapeIdentifier(tableName)}
        SET is_current = 0${removedAtSql}
        WHERE unit_id = ?
          AND is_current = 1
      `,
      [unitId]
    );
  } else {
    await connection.query(
      `
        DELETE FROM ${escapeIdentifier(tableName)}
        WHERE unit_id = ?
      `,
      [unitId]
    );
  }

  return tableColumns;
}

async function insertCurrentMemoryModule(connection, tableColumns, unitId, moduleRow, currentUserId) {
  const columns = [];
  const values = [];

  addColumnValueIfPresent(columns, values, tableColumns, 'unit_id', unitId);
  addColumnValueIfPresent(columns, values, tableColumns, 'slot_label', moduleRow.slotLabel);
  addColumnValueIfPresent(columns, values, tableColumns, 'size_gb', moduleRow.sizeGb);
  addColumnValueIfPresent(columns, values, tableColumns, 'ram_type_config_value_id', moduleRow.ramTypeConfigValueId);
  addColumnValueIfPresent(columns, values, tableColumns, 'memory_install_type_code', moduleRow.memoryInstallTypeCode || DEFAULT_MEMORY_INSTALL_TYPE_CODE);
  addColumnValueIfPresent(columns, values, tableColumns, 'speed_mhz', moduleRow.speedMhz);
  addColumnValueIfPresent(columns, values, tableColumns, 'manufacturer_name', moduleRow.manufacturerName || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'part_number', moduleRow.partNumber || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'serial_number', moduleRow.serialNumber || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'is_current', 1);
  addColumnValueIfPresent(columns, values, tableColumns, 'installed_at', new Date());
  addColumnValueIfPresent(columns, values, tableColumns, 'change_notes', moduleRow.changeNotes || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'source_code', 'tech_edit');
  addColumnValueIfPresent(columns, values, tableColumns, 'changed_by_user_id', currentUserId || null);

  if (columns.length === 0) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_memory_modules (${columns.map(escapeIdentifier).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `,
    values
  );
}

async function insertCurrentStorageDevice(connection, tableColumns, unitId, deviceRow, currentUserId) {
  const columns = [];
  const values = [];

  addColumnValueIfPresent(columns, values, tableColumns, 'unit_id', unitId);
  addColumnValueIfPresent(columns, values, tableColumns, 'slot_label', deviceRow.slotLabel);
  addColumnValueIfPresent(columns, values, tableColumns, 'storage_type_config_value_id', deviceRow.storageTypeConfigValueId);
  addColumnValueIfPresent(columns, values, tableColumns, 'size_gb', deviceRow.sizeGb);
  addColumnValueIfPresent(columns, values, tableColumns, 'manufacturer_name', deviceRow.manufacturerName || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'model_number', deviceRow.modelNumber || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'serial_number', deviceRow.serialNumber || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'firmware_version', deviceRow.firmwareVersion || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'wipe_status_config_value_id', deviceRow.wipeStatusConfigValueId);
  addColumnValueIfPresent(columns, values, tableColumns, 'is_current', 1);
  addColumnValueIfPresent(columns, values, tableColumns, 'installed_at', new Date());
  addColumnValueIfPresent(columns, values, tableColumns, 'change_notes', deviceRow.changeNotes || null);
  addColumnValueIfPresent(columns, values, tableColumns, 'source_code', 'tech_edit');
  addColumnValueIfPresent(columns, values, tableColumns, 'changed_by_user_id', currentUserId || null);

  if (columns.length === 0) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_storage_devices (${columns.map(escapeIdentifier).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `,
    values
  );
}

async function saveUnitMemoryModules(connection, unitId, formData, currentUserId) {
  const exists = await tableExists('unit_memory_modules');

  if (!exists) {
    return;
  }

  const memoryModules = getNormalizedMemoryModules(formData);
  const tableColumns = await deactivateCurrentRows(connection, 'unit_memory_modules', unitId);

  for (const moduleRow of memoryModules) {
    await insertCurrentMemoryModule(connection, tableColumns, unitId, moduleRow, currentUserId);
  }
}

async function saveUnitStorageDevices(connection, unitId, formData, currentUserId) {
  const exists = await tableExists('unit_storage_devices');

  if (!exists) {
    return;
  }

  const storageDevices = getNormalizedStorageDevices(formData);
  const tableColumns = await deactivateCurrentRows(connection, 'unit_storage_devices', unitId);

  for (const deviceRow of storageDevices) {
    await insertCurrentStorageDevice(connection, tableColumns, unitId, deviceRow, currentUserId);
  }
}

async function saveUnitModuleRows(connection, unitId, formData, currentUserId) {
  await saveUnitMemoryModules(connection, unitId, formData, currentUserId);
  await saveUnitStorageDevices(connection, unitId, formData, currentUserId);
}

function buildWritePayload(formData, currentUserId, mode, assetNumber, unitColumns = null) {
  const columns = [];
  const values = [];
  const usedColumns = new Set();

  function addColumn(columnName, value) {
    if (usedColumns.has(columnName)) {
      return;
    }

    usedColumns.add(columnName);
    columns.push(columnName);
    values.push(value);
  }

  if (mode === 'create') {
    addColumn('asset_number', assetNumber);
    addColumn('created_by_user_id', currentUserId || null);

    if (unitColumns && hasColumn(unitColumns, 'assigned_to_user_id')) {
      addColumn('assigned_to_user_id', currentUserId || null);
    }

    if (unitColumns && hasColumn(unitColumns, 'assigned_at')) {
      addColumn('assigned_at', currentUserId ? new Date() : null);
    }

    if (unitColumns && hasColumn(unitColumns, 'assignment_updated_by_user_id')) {
      addColumn('assignment_updated_by_user_id', currentUserId || null);
    }
  }

  addColumn('lot_id', normalizeRequiredInteger(formData.lotId));
  addColumn('unit_category_config_value_id', normalizeRequiredInteger(formData.unitCategoryConfigValueId));
  addColumn('current_unit_status_config_value_id', normalizeRequiredInteger(formData.currentUnitStatusConfigValueId));
  addColumn('manufacturer_id', normalizeOptionalInteger(formData.manufacturerId));
  addColumn('unit_model_id', normalizeOptionalInteger(formData.unitModelId));
  addColumn('processor_model_id', normalizeOptionalInteger(formData.processorModelId));
  addColumn('processor_speed_ghz', normalizeOptionalDecimal(formData.processorSpeedGhz));
  const normalizedMemoryModules = getNormalizedMemoryModules(formData);
  const normalizedStorageDevices = getNormalizedStorageDevices(formData);
  const memoryTotalGb = normalizedMemoryModules.length > 0 ? sumModuleSizeGb(normalizedMemoryModules) : normalizeOptionalInteger(formData.ramGb);
  const storageTotalGb = normalizedStorageDevices.length > 0 ? sumModuleSizeGb(normalizedStorageDevices) : normalizeOptionalInteger(formData.storageGb);

  addColumn('ram_gb', memoryTotalGb || null);
  addColumn('ram_type_config_value_id', normalizeOptionalInteger(formData.ramTypeConfigValueId));
  addColumn('storage_gb', storageTotalGb || null);
  addColumn('storage_type_config_value_id', normalizeOptionalInteger(formData.storageTypeConfigValueId));
  addColumn('operating_system_config_value_id', normalizeOptionalInteger(formData.operatingSystemConfigValueId));
  addColumn('hardware_notes', normalizeText(formData.hardwareNotes));
  addColumn('cosmetic_notes', normalizeText(formData.cosmeticNotes));

  if (formData.canOverrideProductionWeight === true) {
    if (!unitColumns || hasColumn(unitColumns, 'production_weight_override')) {
      addColumn('production_weight_override', productionWeightModel.normalizeWeightValue(formData.productionWeightOverride));
    }

    if (!unitColumns || hasColumn(unitColumns, 'production_weight_notes')) {
      addColumn('production_weight_notes', normalizeOptionalString(formData.productionWeightNotes, 500) || null);
    }

    if (unitColumns && hasColumn(unitColumns, 'production_weight_override_updated_by_user_id')) {
      addColumn('production_weight_override_updated_by_user_id', currentUserId || null);
    }

    if (unitColumns && hasColumn(unitColumns, 'production_weight_override_updated_at')) {
      addColumn('production_weight_override_updated_at', new Date());
    }
  }

  return {
    columns,
    values
  };
}

async function createIntentionalDuplicateTechUnitWithConnection(connection, formData, currentUserId) {
  const state = await getUnitTableState();

  if (!connection || !state.exists || !state.primaryKeyColumn) {
    throw new Error('The units table or primary key column was not found.');
  }

  const { assignableLots } = await getLotMap();
  const requestedLotId = normalizeRequiredInteger(formData && formData.lotId);

  if (!assignableLots.some((lot) => Number(lot.lot_id) === requestedLotId)) {
    throw createLotMovePolicyError(
      'BWT_LOT_DESTINATION_NOT_OPEN',
      'Closed, hidden, and parent/container lots cannot receive new units. Choose an open child or standalone lot.'
    );
  }

  const assetNumber = await generateNextAssetNumber(connection);
  const payload = buildWritePayload(formData, currentUserId, 'create', assetNumber, state.columns);
  const placeholders = payload.columns.map(() => '?').join(', ');
  const columnSql = payload.columns.map(escapeIdentifier).join(', ');

  const [result] = await connection.query(
    `
      INSERT INTO units (${columnSql})
      VALUES (${placeholders})
    `,
    payload.values
  );

  const unitId = Number(result.insertId);

  await saveUnitIdentifiers(connection, unitId, formData, assetNumber);
  await saveUnitModuleRows(connection, unitId, formData, currentUserId);

  return {
    unitId,
    assetNumber
  };
}

async function createTechUnit(formData, currentUserId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    throw new Error('The units table or primary key column was not found.');
  }

  const assetNumber = await generateNextAssetNumber();
  const duplicateMatches = await findDuplicateUnitsFromIdentifiers(buildIdentifierEntries(formData, assetNumber));

  if (duplicateMatches.length > 0) {
    throw createDuplicateIdentifierError(duplicateMatches);
  }

  const { assignableLots } = await getLotMap();
  const requestedLotId = normalizeRequiredInteger(formData.lotId);

  if (!assignableLots.some((lot) => Number(lot.lot_id) === requestedLotId)) {
    throw createLotMovePolicyError(
      'BWT_LOT_DESTINATION_NOT_OPEN',
      'Closed, hidden, and parent/container lots cannot receive new units. Choose an open child or standalone lot.'
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const payload = buildWritePayload(formData, currentUserId, 'create', assetNumber, state.columns);
    const placeholders = payload.columns.map(() => '?').join(', ');
    const columnSql = payload.columns.map(escapeIdentifier).join(', ');

    const [result] = await connection.query(
      `
        INSERT INTO units (${columnSql})
        VALUES (${placeholders})
      `,
      payload.values
    );

    const unitId = result.insertId;

    await saveUnitIdentifiers(connection, unitId, formData, assetNumber);
    await saveUnitModuleRows(connection, unitId, formData, currentUserId);

    await connection.commit();

    return unitId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordUnitLotHistory(connection, { unitId, fromLotId, toLotId, movedByUserId, notes = null }) {
  const exists = await tableExists('unit_lot_history');

  if (!exists) {
    return;
  }

  const normalizedUnitId = normalizeRequiredInteger(unitId);
  const normalizedToLotId = normalizeRequiredInteger(toLotId);
  const normalizedUserId = normalizeRequiredInteger(movedByUserId);

  if (!normalizedUnitId || !normalizedToLotId || !normalizedUserId) {
    return;
  }

  const normalizedFromLotId = normalizeOptionalInteger(fromLotId);
  const normalizedNotes = normalizeText(notes);

  await connection.query(
    `
      INSERT INTO unit_lot_history (
        unit_id,
        from_lot_id,
        to_lot_id,
        moved_by_user_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      normalizedUnitId,
      normalizedFromLotId,
      normalizedToLotId,
      normalizedUserId,
      normalizedNotes
    ]
  );
}

async function updateExistingTechUnit(unitId, formData, currentUserId, options = {}) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    throw new Error('The units table or primary key column was not found.');
  }

  const unit = await getUnitById(unitId);

  if (!unit) {
    throw new Error('The selected unit could not be found.');
  }

  assertUnitEditPermission({
    unit,
    currentUserId,
    actorRoleCodes: options.actorRoleCodes
  });

  const duplicateMatches = await findDuplicateUnitsFromIdentifiers(
    buildIdentifierEntries(formData, unit.asset_number),
    unitId
  );

  if (duplicateMatches.length > 0) {
    throw createDuplicateIdentifierError(duplicateMatches);
  }

  const connection = await pool.getConnection();
  const nextLotId = normalizeRequiredInteger(formData.lotId);
  const previousLotId = normalizeOptionalInteger(unit.lot_id);
  const lotChanged = Boolean(nextLotId && previousLotId && Number(nextLotId) !== Number(previousLotId));

  await assertLotDestinationIsOpenOrCurrent({
    unit,
    nextLotId
  });

  if (lotChanged) {
    await assertLotMovePermission({
      unit,
      nextLotId,
      currentUserId,
      actorRoleCodes: options.actorRoleCodes
    });
  }

  try {
    await connection.beginTransaction();

    const payload = buildWritePayload(formData, currentUserId, 'update', null, state.columns);
    const setSql = payload.columns.map((columnName) => `${escapeIdentifier(columnName)} = ?`).join(', ');

    await connection.query(
      `
        UPDATE units
        SET ${setSql}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
      `,
      [...payload.values, unitId]
    );

    await saveUnitIdentifiers(connection, unitId, formData, unit.asset_number);
    await saveUnitModuleRows(connection, unitId, formData, currentUserId);

    if (lotChanged && options.recordLotHistory !== false) {
      await recordUnitLotHistory(connection, {
        unitId,
        fromLotId: previousLotId,
        toLotId: nextLotId,
        movedByUserId: currentUserId,
        notes: options.lotMoveNotes || 'Unit moved while updating an existing unit record.'
      });
    }

    await connection.commit();

    return {
      unitId: Number(unitId),
      previousLotId,
      nextLotId,
      lotChanged
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateTechUnit(unitId, formData, currentUserId, options = {}) {
  return updateExistingTechUnit(unitId, formData, currentUserId, {
    recordLotHistory: true,
    lotMoveNotes: 'Unit lot changed from the Tech Unit edit form.',
    actorRoleCodes: options.actorRoleCodes
  });
}

async function useExistingTechUnit(unitId, formData, currentUserId, options = {}) {
  return updateExistingTechUnit(unitId, formData, currentUserId, {
    recordLotHistory: true,
    lotMoveNotes: 'Duplicate detection confirmed this was an existing unit; unit record was updated instead of creating a duplicate.',
    actorRoleCodes: options.actorRoleCodes
  });
}



const UNIT_RELATED_TABLE_LABELS = {
  unit_identifiers: 'Identifiers',
  unit_specifications: 'Specifications',
  unit_field_sources: 'Field-source records',
  unit_grade_assessments: 'Grade records',
  unit_outcomes: 'Pass/Fail records',
  unit_memory_modules: 'Memory-module records',
  unit_storage_devices: 'Storage-device records',
  unit_cellular_modules: 'Cellular-module records',
  unit_graphics_adapters: 'Graphics-adapter records',
  unit_issue_entries: 'Issue records',
  unit_issue_flags: 'Issue flags',
  unit_comments: 'Comments',
  unit_lot_history: 'Lot-move history',
  unit_assignment_history: 'Assignment history',
  unit_park_history: 'Parked lifecycle history',
  unit_work_completions: 'Earned-weight records',
  unit_override_requests: 'Override requests',
  unit_lot_validation_overrides: 'Lot-validation overrides',
  unit_qc_checks: 'QC records',
  unit_status_history: 'Status history',
  unit_support_tasks: 'Support-task records',
  unit_takeover_requests: 'Takeover requests',
  unit_work_sessions: 'Work sessions',
  unit_completion_credits: 'Completion-credit records',
  productivity_events: 'Productivity events',
  scan_batch_items: 'Scan-batch entries'
};

function getUnitRelatedTableLabel(tableName) {
  return UNIT_RELATED_TABLE_LABELS[tableName] || 'Related unit records';
}

async function listUnitRelatedTableReferences(executor = pool) {
  const [rows] = await executor.query(
    `
      SELECT DISTINCT reference_rows.table_name, reference_rows.column_name
      FROM (
        SELECT
          c.TABLE_NAME AS table_name,
          c.COLUMN_NAME AS column_name
        FROM information_schema.COLUMNS c
        INNER JOIN information_schema.TABLES t
          ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
         AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA = DATABASE()
          AND t.TABLE_TYPE = 'BASE TABLE'
          AND c.TABLE_NAME <> 'units'
          AND c.COLUMN_NAME = 'unit_id'

        UNION

        SELECT
          kcu.TABLE_NAME AS table_name,
          kcu.COLUMN_NAME AS column_name
        FROM information_schema.KEY_COLUMN_USAGE kcu
        INNER JOIN information_schema.TABLES t
          ON t.TABLE_SCHEMA = kcu.TABLE_SCHEMA
         AND t.TABLE_NAME = kcu.TABLE_NAME
        WHERE kcu.TABLE_SCHEMA = DATABASE()
          AND t.TABLE_TYPE = 'BASE TABLE'
          AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
          AND kcu.REFERENCED_TABLE_NAME = 'units'
          AND kcu.TABLE_NAME <> 'units'
      ) AS reference_rows
      ORDER BY reference_rows.table_name, reference_rows.column_name
    `
  );

  const grouped = new Map();

  rows.forEach((row) => {
    const tableName = String(row.table_name || '').trim();
    const columnName = String(row.column_name || '').trim();

    if (!tableName || !columnName) {
      return;
    }

    if (!grouped.has(tableName)) {
      grouped.set(tableName, []);
    }

    const columns = grouped.get(tableName);

    if (!columns.includes(columnName)) {
      columns.push(columnName);
    }
  });

  return Array.from(grouped.entries()).map(([tableName, columnNames]) => ({
    tableName,
    columnNames,
    label: getUnitRelatedTableLabel(tableName)
  }));
}

function buildUnitReferenceWhereSql(columnNames = []) {
  const safeColumns = Array.isArray(columnNames)
    ? columnNames.filter(Boolean)
    : [];

  if (safeColumns.length === 0) {
    return {
      sql: '1 = 0',
      valuesForUnitId: []
    };
  }

  return {
    sql: safeColumns
      .map((columnName) => `${escapeIdentifier(columnName)} = ?`)
      .join(' OR '),
    valuesForUnitId: safeColumns.map(() => null)
  };
}

async function getUnitRelatedRecordCounts(unitId, executor = pool) {
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId) {
    return [];
  }

  const relatedTables = await listUnitRelatedTableReferences(executor);
  const counts = [];

  for (const relatedTable of relatedTables) {
    const where = buildUnitReferenceWhereSql(relatedTable.columnNames);
    const [rows] = await executor.query(
      `
        SELECT COUNT(*) AS record_count
        FROM ${escapeIdentifier(relatedTable.tableName)}
        WHERE ${where.sql}
      `,
      where.valuesForUnitId.map(() => safeUnitId)
    );

    const recordCount = Number(rows[0] && rows[0].record_count) || 0;

    if (recordCount > 0) {
      counts.push({
        ...relatedTable,
        recordCount
      });
    }
  }

  return counts;
}

async function getUnitRelatedTableDeletionOrder(relatedTables, executor = pool) {
  const tableNames = relatedTables
    .map((relatedTable) => relatedTable.tableName)
    .filter(Boolean);

  if (tableNames.length <= 1) {
    return relatedTables;
  }

  const placeholders = tableNames.map(() => '?').join(', ');
  const [foreignKeys] = await executor.query(
    `
      SELECT DISTINCT
        TABLE_NAME AS child_table_name,
        REFERENCED_TABLE_NAME AS parent_table_name
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
        AND REFERENCED_TABLE_NAME IN (${placeholders})
    `,
    [...tableNames, ...tableNames]
  );

  const remaining = new Map(relatedTables.map((relatedTable) => [relatedTable.tableName, relatedTable]));
  const childTablesByParent = new Map();

  foreignKeys.forEach((foreignKey) => {
    const childTableName = String(foreignKey.child_table_name || '').trim();
    const parentTableName = String(foreignKey.parent_table_name || '').trim();

    if (!remaining.has(childTableName) || !remaining.has(parentTableName) || childTableName === parentTableName) {
      return;
    }

    if (!childTablesByParent.has(parentTableName)) {
      childTablesByParent.set(parentTableName, new Set());
    }

    childTablesByParent.get(parentTableName).add(childTableName);
  });

  const ordered = [];

  while (remaining.size > 0) {
    const ready = Array.from(remaining.keys())
      .filter((tableName) => {
        const childTables = childTablesByParent.get(tableName) || new Set();
        return Array.from(childTables).every((childTableName) => !remaining.has(childTableName));
      })
      .sort();

    const nextTables = ready.length > 0
      ? ready
      : [Array.from(remaining.keys()).sort()[0]];

    nextTables.forEach((tableName) => {
      ordered.push(remaining.get(tableName));
      remaining.delete(tableName);
    });
  }

  return ordered;
}

async function permanentlyDeleteTechUnit(unitId) {
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId) {
    return {
      deleted: false,
      reason: 'invalid_unit'
    };
  }

  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    return {
      deleted: false,
      reason: 'unit_table_unavailable'
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [unitRows] = await connection.query(
      `
        SELECT ${escapeIdentifier(state.primaryKeyColumn)} AS unit_id
        FROM units
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        FOR UPDATE
      `,
      [safeUnitId]
    );

    if (unitRows.length === 0) {
      await connection.rollback();

      return {
        deleted: false,
        reason: 'missing'
      };
    }

    const relatedTables = await listUnitRelatedTableReferences(connection);
    const deletionOrder = await getUnitRelatedTableDeletionOrder(relatedTables, connection);
    const deletedRelatedRecords = [];

    for (const relatedTable of deletionOrder) {
      const where = buildUnitReferenceWhereSql(relatedTable.columnNames);
      const [deleteResult] = await connection.query(
        `
          DELETE FROM ${escapeIdentifier(relatedTable.tableName)}
          WHERE ${where.sql}
        `,
        where.valuesForUnitId.map(() => safeUnitId)
      );

      if (Number(deleteResult.affectedRows) > 0) {
        deletedRelatedRecords.push({
          tableName: relatedTable.tableName,
          recordCount: Number(deleteResult.affectedRows)
        });
      }
    }

    for (const relatedTable of relatedTables) {
      const where = buildUnitReferenceWhereSql(relatedTable.columnNames);
      const [rows] = await connection.query(
        `
          SELECT COUNT(*) AS record_count
          FROM ${escapeIdentifier(relatedTable.tableName)}
          WHERE ${where.sql}
        `,
        where.valuesForUnitId.map(() => safeUnitId)
      );

      if (Number(rows[0] && rows[0].record_count) > 0) {
        throw new Error(`Linked records remain in ${relatedTable.tableName}.`);
      }
    }

    const [unitDeleteResult] = await connection.query(
      `
        DELETE FROM units
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
      `,
      [safeUnitId]
    );

    if (Number(unitDeleteResult.affectedRows) !== 1) {
      throw new Error('The unit record could not be permanently deleted.');
    }

    await connection.commit();

    return {
      deleted: true,
      deletedRelatedRecordCount: deletedRelatedRecords.reduce(
        (total, record) => total + record.recordCount,
        0
      )
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getTechUnitPermanentDeletionPreviewById(unitId) {
  const unit = await getTechUnitLifecycleSummaryById(unitId);

  if (!unit) {
    return null;
  }

  const relatedRecords = await getUnitRelatedRecordCounts(unit.unitId);

  return {
    ...unit,
    relatedRecords,
    relatedRecordCount: relatedRecords.reduce(
      (total, record) => total + record.recordCount,
      0
    )
  };
}

async function getLatestUnitParkHistory(unitId) {
  if (!await tableExists('unit_park_history')) {
    return null;
  }

  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT
        h.event_type,
        h.from_lot_id,
        h.to_lot_id,
        h.from_assigned_to_user_id,
        h.to_assigned_to_user_id,
        h.changed_by_user_id,
        h.notes,
        h.changed_at,
        from_lot.name AS from_lot_name,
        to_lot.name AS to_lot_name,
        from_user.first_name AS from_user_first_name,
        from_user.last_name AS from_user_last_name,
        from_user.email AS from_user_email,
        to_user.first_name AS to_user_first_name,
        to_user.last_name AS to_user_last_name,
        to_user.email AS to_user_email,
        changed_by.first_name AS changed_by_first_name,
        changed_by.last_name AS changed_by_last_name,
        changed_by.email AS changed_by_email
      FROM unit_park_history h
      LEFT JOIN lots from_lot ON from_lot.lot_id = h.from_lot_id
      LEFT JOIN lots to_lot ON to_lot.lot_id = h.to_lot_id
      LEFT JOIN users from_user ON from_user.user_id = h.from_assigned_to_user_id
      LEFT JOIN users to_user ON to_user.user_id = h.to_assigned_to_user_id
      LEFT JOIN users changed_by ON changed_by.user_id = h.changed_by_user_id
      WHERE h.unit_id = ?
      ORDER BY h.changed_at DESC, h.unit_park_history_id DESC
      LIMIT 1
    `,
    [safeUnitId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    eventType: row.event_type,
    fromLotId: normalizeOptionalInteger(row.from_lot_id),
    fromLotName: row.from_lot_name || '',
    toLotId: normalizeOptionalInteger(row.to_lot_id),
    toLotName: row.to_lot_name || '',
    fromAssignedToUserId: normalizeOptionalInteger(row.from_assigned_to_user_id),
    fromAssignedToName: getUserDisplayNameFromRow(row, 'from_user') || '',
    toAssignedToUserId: normalizeOptionalInteger(row.to_assigned_to_user_id),
    toAssignedToName: getUserDisplayNameFromRow(row, 'to_user') || '',
    changedByName: getUserDisplayNameFromRow(row, 'changed_by') || '',
    changedAt: row.changed_at,
    notes: row.notes || ''
  };
}

async function getTechUnitLifecycleSummaryById(unitId) {
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId) {
    return null;
  }

  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    return null;
  }

  const parkedSql = getUnitParkedSql(state, 'u');
  const [rows] = await pool.query(
    `
      SELECT
        u.unit_id,
        u.asset_number,
        u.lot_id,
        u.assigned_to_user_id,
        l.name AS lot_name,
        assigned_user.first_name AS assigned_first_name,
        assigned_user.last_name AS assigned_last_name,
        assigned_user.email AS assigned_email,
        cv_category.label AS category_label,
        m.name AS manufacturer_name,
        um.model_name,
        pm.model_code AS processor_model_code,
        u.ram_gb,
        u.storage_gb,
        ${parkedSql} AS is_parked,
        ${state.parkingCapabilities.hasParkedAt ? 'u.parked_at' : (state.legacyArchiveCapabilities.hasArchivedAt ? 'u.archived_at' : 'NULL')} AS parked_at
      FROM units u
      LEFT JOIN lots l ON l.lot_id = u.lot_id
      LEFT JOIN users assigned_user ON assigned_user.user_id = u.assigned_to_user_id
      LEFT JOIN config_values cv_category ON cv_category.config_value_id = u.unit_category_config_value_id
      LEFT JOIN manufacturers m ON m.manufacturer_id = u.manufacturer_id
      LEFT JOIN unit_models um ON um.unit_model_id = u.unit_model_id
      LEFT JOIN processor_models pm ON pm.processor_model_id = u.processor_model_id
      WHERE u.${escapeIdentifier(state.primaryKeyColumn)} = ?
      LIMIT 1
    `,
    [safeUnitId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const [unitSerialNumber, biosSerialNumber, latestParkHistory] = await Promise.all([
    getUnitIdentifierValue(safeUnitId, 'unit_serial_number'),
    getUnitIdentifierValue(safeUnitId, 'bios_serial_number'),
    getLatestUnitParkHistory(safeUnitId)
  ]);

  const specParts = [
    row.manufacturer_name,
    row.model_name,
    row.processor_model_code,
    row.ram_gb ? `${row.ram_gb}GB Memory` : '',
    row.storage_gb ? `${row.storage_gb}GB Storage` : ''
  ].filter(Boolean);

  return {
    unitId: Number(row.unit_id),
    assetTag: row.asset_number ? getDisplayAssetTag(row.asset_number) : '',
    unitSerialNumber: unitSerialNumber || '',
    biosSerialNumber: biosSerialNumber || '',
    lotId: normalizeOptionalInteger(row.lot_id),
    lotName: row.lot_name || '',
    assignedToUserId: normalizeOptionalInteger(row.assigned_to_user_id),
    assignedToName: getUserDisplayNameFromRow(row, 'assigned') || '',
    categoryLabel: row.category_label || '',
    specSummary: specParts.length > 0 ? specParts.join(' · ') : 'No specs entered yet',
    isParked: Number(row.is_parked) === 1,
    parkedAt: row.parked_at || null,
    lifecycleSupported: Boolean(
      state.parkingCapabilities.hasIsParked &&
      state.parkingCapabilities.hasParkedAt &&
      state.parkingCapabilities.hasParkedByUserId &&
      state.assignmentCapabilities.hasAssignedToUserId
    ),
    latestParkHistory
  };
}

async function recordUnitParkHistory(connection, {
  unitId,
  eventType,
  fromLotId = null,
  toLotId = null,
  fromAssignedToUserId = null,
  toAssignedToUserId = null,
  changedByUserId = null,
  notes = null
}) {
  if (!await tableExists('unit_park_history')) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_park_history (
        unit_id,
        event_type,
        from_lot_id,
        to_lot_id,
        from_assigned_to_user_id,
        to_assigned_to_user_id,
        changed_by_user_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeRequiredInteger(unitId),
      normalizeText(eventType) || 'parked',
      normalizeOptionalInteger(fromLotId),
      normalizeOptionalInteger(toLotId),
      normalizeOptionalInteger(fromAssignedToUserId),
      normalizeOptionalInteger(toAssignedToUserId),
      normalizeOptionalInteger(changedByUserId),
      normalizeText(notes)
    ]
  );
}

function assertUnitLifecycleAuthority(actorRoleCodes) {
  if (!hasElevatedLotMoveAuthority(actorRoleCodes)) {
    throw createUnitLifecycleError(
      'BWT_UNIT_LIFECYCLE_FORBIDDEN',
      'Only a Tech Lead, Management user, or Admin can park or return a unit to Active.'
    );
  }
}

function assertUnitIsNotParked(unit) {
  if (isUnitParked(unit)) {
    throw createUnitLifecycleError(
      'BWT_UNIT_IS_PARKED',
      'This unit is parked. Return it to Active before changing unit details, assignments, lot placement, or work completion.'
    );
  }
}

async function getReturnToActiveOptions() {
  const [{ assignableLots }, technicians] = await Promise.all([
    getLotMap(),
    listActiveAssignableTechnicians()
  ]);

  return {
    lots: assignableLots,
    technicians
  };
}

async function assertReturnAssigneeIsEligible(assignedToUserId) {
  const normalizedAssignedToUserId = normalizeOptionalInteger(assignedToUserId);

  if (!normalizedAssignedToUserId) {
    return null;
  }

  const technicians = await listActiveAssignableTechnicians();
  const isEligible = technicians.some((technician) => technician.id === normalizedAssignedToUserId);

  if (!isEligible) {
    throw createUnitLifecycleError(
      'BWT_RETURN_ASSIGNEE_NOT_ELIGIBLE',
      'Choose an active Tech or Tech Lead, or leave the assignment unassigned.'
    );
  }

  return normalizedAssignedToUserId;
}

async function parkTechUnit({ unitId, parkedByUserId, actorRoleCodes }) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeParkedByUserId = normalizeRequiredInteger(parkedByUserId);
  const state = await getUnitTableState();

  if (!safeUnitId || !safeParkedByUserId || !state.parkingCapabilities.hasIsParked || !state.assignmentCapabilities.hasAssignedToUserId) {
    throw createUnitLifecycleError(
      'BWT_UNIT_LIFECYCLE_MIGRATION_REQUIRED',
      'The Parked Unit lifecycle is not ready yet. Run the Step 6f.2 SQL migration first.'
    );
  }

  assertUnitLifecycleAuthority(actorRoleCodes);

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    throw createUnitLifecycleError('BWT_UNIT_NOT_FOUND', 'The selected unit could not be found.');
  }

  if (isUnitParked(unit)) {
    throw createUnitLifecycleError('BWT_UNIT_ALREADY_PARKED', 'This unit is already parked.');
  }

  const currentLotId = normalizeOptionalInteger(unit.lot_id);
  const currentAssignedToUserId = normalizeOptionalInteger(unit.assigned_to_user_id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updates = [
      'is_parked = 1',
      'parked_at = NOW()',
      'parked_by_user_id = ?',
      'lot_id = NULL',
      'assigned_to_user_id = NULL'
    ];
    const values = [safeParkedByUserId];

    if (state.assignmentCapabilities.hasAssignedAt) {
      updates.push('assigned_at = NULL');
    }

    if (state.assignmentCapabilities.hasAssignmentUpdatedByUserId) {
      updates.push('assignment_updated_by_user_id = ?');
      values.push(safeParkedByUserId);
    }

    if (state.legacyArchiveCapabilities.hasIsArchived) {
      updates.push('is_archived = 1');
    }

    if (state.legacyArchiveCapabilities.hasArchivedAt) {
      updates.push('archived_at = NOW()');
    }

    if (state.legacyArchiveCapabilities.hasArchivedByUserId) {
      updates.push('archived_by_user_id = ?');
      values.push(safeParkedByUserId);
    }

    const [parkResult] = await connection.query(
      `
        UPDATE units
        SET ${updates.join(', ')}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
          AND COALESCE(is_parked, 0) = 0
        LIMIT 1
      `,
      [...values, safeUnitId]
    );

    if (Number(parkResult.affectedRows) !== 1) {
      throw createUnitLifecycleError('BWT_UNIT_ALREADY_PARKED', 'This unit is already parked or was changed by another user.');
    }

    if (currentAssignedToUserId) {
      await recordUnitAssignmentHistory(connection, {
        unitId: safeUnitId,
        fromUserId: currentAssignedToUserId,
        toUserId: null,
        changedByUserId: safeParkedByUserId,
        changeSource: 'parked',
        notes: 'Assignment cleared when the unit was parked.'
      });
    }

    await recordUnitParkHistory(connection, {
      unitId: safeUnitId,
      eventType: 'parked',
      fromLotId: currentLotId,
      fromAssignedToUserId: currentAssignedToUserId,
      changedByUserId: safeParkedByUserId,
      notes: 'Unit parked. Current lot and assignment were cleared; existing records and earned credit were retained.'
    });

    await connection.commit();
    return { parked: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function returnTechUnitToActive({
  unitId,
  destinationLotId,
  assignedToUserId = null,
  returnedByUserId,
  actorRoleCodes
}) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeDestinationLotId = normalizeRequiredInteger(destinationLotId);
  const safeReturnedByUserId = normalizeRequiredInteger(returnedByUserId);
  const state = await getUnitTableState();

  if (!safeUnitId || !safeDestinationLotId || !safeReturnedByUserId || !state.parkingCapabilities.hasIsParked || !state.assignmentCapabilities.hasAssignedToUserId) {
    throw createUnitLifecycleError(
      'BWT_UNIT_LIFECYCLE_MIGRATION_REQUIRED',
      'The Parked Unit lifecycle is not ready yet. Run the Step 6f.2 SQL migration first.'
    );
  }

  assertUnitLifecycleAuthority(actorRoleCodes);

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    throw createUnitLifecycleError('BWT_UNIT_NOT_FOUND', 'The selected unit could not be found.');
  }

  if (!isUnitParked(unit)) {
    throw createUnitLifecycleError('BWT_UNIT_NOT_PARKED', 'Only a parked unit can be returned to Active.');
  }

  await assertLotDestinationIsOpenOrCurrent({ unit: { lot_id: null }, nextLotId: safeDestinationLotId });
  const safeAssignedToUserId = await assertReturnAssigneeIsEligible(assignedToUserId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updates = [
      'is_parked = 0',
      'parked_at = NULL',
      'parked_by_user_id = NULL',
      'lot_id = ?',
      'assigned_to_user_id = ?'
    ];
    const values = [safeDestinationLotId, safeAssignedToUserId];

    if (state.assignmentCapabilities.hasAssignedAt) {
      updates.push('assigned_at = ?');
      values.push(safeAssignedToUserId ? new Date() : null);
    }

    if (state.assignmentCapabilities.hasAssignmentUpdatedByUserId) {
      updates.push('assignment_updated_by_user_id = ?');
      values.push(safeReturnedByUserId);
    }

    if (state.legacyArchiveCapabilities.hasIsArchived) {
      updates.push('is_archived = 0');
    }

    if (state.legacyArchiveCapabilities.hasArchivedAt) {
      updates.push('archived_at = NULL');
    }

    if (state.legacyArchiveCapabilities.hasArchivedByUserId) {
      updates.push('archived_by_user_id = NULL');
    }

    const [returnResult] = await connection.query(
      `
        UPDATE units
        SET ${updates.join(', ')}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
          AND COALESCE(is_parked, 0) = 1
        LIMIT 1
      `,
      [...values, safeUnitId]
    );

    if (Number(returnResult.affectedRows) !== 1) {
      throw createUnitLifecycleError('BWT_UNIT_NOT_PARKED', 'This unit is no longer parked or was changed by another user.');
    }

    await recordUnitLotHistory(connection, {
      unitId: safeUnitId,
      fromLotId: null,
      toLotId: safeDestinationLotId,
      movedByUserId: safeReturnedByUserId,
      notes: 'Unit returned to Active from the Parked lifecycle.'
    });

    if (safeAssignedToUserId) {
      await recordUnitAssignmentHistory(connection, {
        unitId: safeUnitId,
        fromUserId: null,
        toUserId: safeAssignedToUserId,
        changedByUserId: safeReturnedByUserId,
        changeSource: 'returned_to_active',
        notes: 'Assignment set while returning the unit to Active.'
      });
    }

    await recordUnitParkHistory(connection, {
      unitId: safeUnitId,
      eventType: 'returned_to_active',
      toLotId: safeDestinationLotId,
      toAssignedToUserId: safeAssignedToUserId,
      changedByUserId: safeReturnedByUserId,
      notes: 'Unit returned to Active. Historical work and credit records were retained without changes.'
    });

    await connection.commit();
    return { returnedToActive: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function recordUnitAssignmentHistory(connection, {
  unitId,
  fromUserId = null,
  toUserId = null,
  changedByUserId = null,
  changeSource = 'manual',
  overrideRequestId = null,
  notes = null
}) {
  if (!await tableExists('unit_assignment_history')) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_assignment_history (
        unit_id,
        from_user_id,
        to_user_id,
        changed_by_user_id,
        change_source,
        override_request_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeRequiredInteger(unitId),
      normalizeOptionalInteger(fromUserId),
      normalizeOptionalInteger(toUserId),
      normalizeOptionalInteger(changedByUserId),
      normalizeText(changeSource) || 'manual',
      normalizeOptionalInteger(overrideRequestId),
      normalizeText(notes)
    ]
  );
}

async function assignTechUnit({ unitId, toUserId = null, changedByUserId = null, changeSource = 'manual', overrideRequestId = null, notes = null }) {
  const state = await getUnitTableState();
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId || !state.exists || !state.primaryKeyColumn || !state.assignmentCapabilities.hasAssignedToUserId) {
    return false;
  }

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    return false;
  }

  assertUnitIsNotParked(unit);

  const normalizedToUserId = normalizeOptionalInteger(toUserId);
  const normalizedChangedByUserId = normalizeOptionalInteger(changedByUserId);
  const previousUserId = normalizeOptionalInteger(unit.assigned_to_user_id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const assignmentUpdates = ['assigned_to_user_id = ?'];
    const assignmentValues = [normalizedToUserId];

    if (state.assignmentCapabilities.hasAssignedAt) {
      assignmentUpdates.push('assigned_at = ?');
      assignmentValues.push(normalizedToUserId ? new Date() : null);
    }

    if (state.assignmentCapabilities.hasAssignmentUpdatedByUserId) {
      assignmentUpdates.push('assignment_updated_by_user_id = ?');
      assignmentValues.push(normalizedChangedByUserId);
    }

    await connection.query(
      `
        UPDATE units
        SET ${assignmentUpdates.join(', ')}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
      `,
      [...assignmentValues, safeUnitId]
    );

    if (previousUserId !== normalizedToUserId) {
      await recordUnitAssignmentHistory(connection, {
        unitId: safeUnitId,
        fromUserId: previousUserId,
        toUserId: normalizedToUserId,
        changedByUserId: normalizedChangedByUserId,
        changeSource,
        overrideRequestId,
        notes
      });
    }

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getResolvedProductionWeightForUnit(unit) {
  if (!unit) {
    return null;
  }

  const { lotMap } = await getLotMap();
  const lot = lotMap.get(Number(unit.lot_id)) || null;
  const [unitCategories, productionWeightOptions] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    productionWeightModel.listProductionWeightOptions()
  ]);
  const unitCategory = unitCategories.find((category) => Number(category.id) === Number(unit.unit_category_config_value_id)) || null;
  const details = getProductionWeightDetailsForUnit({
    row: unit,
    lot,
    unitCategory,
    productionWeightOptions
  });

  return productionWeightModel.normalizeWeightValue(details.effectiveWeight);
}

async function recordUnitWorkCompletion({ unitId, completedByUserId, recordedByUserId, creditSource = 'manual_completion', overrideRequestId = null, weightValue = null, notes = null }) {
  if (!await tableExists('unit_work_completions')) {
    throw new Error('The unit_work_completions table is not ready yet. Run the Step 6f.0 SQL migration first.');
  }

  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeCompletedByUserId = normalizeRequiredInteger(completedByUserId);
  const safeRecordedByUserId = normalizeOptionalInteger(recordedByUserId);

  if (!safeUnitId || !safeCompletedByUserId) {
    throw new Error('A valid unit and completed-by user are required to record work completion.');
  }

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    throw new Error('The selected unit could not be found.');
  }

  assertUnitIsNotParked(unit);

  const resolvedWeight = weightValue !== null && weightValue !== undefined
    ? productionWeightModel.normalizeWeightValue(weightValue)
    : await getResolvedProductionWeightForUnit(unit);

  if (resolvedWeight === null || resolvedWeight < 0.10 || resolvedWeight > 10.00) {
    throw new Error('A completion credit weight from 0.10 through 10.00 is required.');
  }

  const safeCreditSource = normalizeText(creditSource) || 'manual_completion';

  await pool.query(
    `
      INSERT INTO unit_work_completions (
        unit_id,
        lot_id,
        completed_by_user_id,
        production_weight_value,
        credit_source,
        recorded_by_user_id,
        override_request_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      safeUnitId,
      normalizeOptionalInteger(unit.lot_id),
      safeCompletedByUserId,
      resolvedWeight,
      safeCreditSource,
      safeRecordedByUserId,
      normalizeOptionalInteger(overrideRequestId),
      normalizeText(notes)
    ]
  );

  return true;
}


async function recordUnitAssignmentHistory(connection, {
  unitId,
  fromUserId = null,
  toUserId = null,
  changedByUserId = null,
  changeSource = 'manual',
  overrideRequestId = null,
  notes = null
}) {
  if (!await tableExists('unit_assignment_history')) {
    return;
  }

  await connection.query(
    `
      INSERT INTO unit_assignment_history (
        unit_id,
        from_user_id,
        to_user_id,
        changed_by_user_id,
        change_source,
        override_request_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeRequiredInteger(unitId),
      normalizeOptionalInteger(fromUserId),
      normalizeOptionalInteger(toUserId),
      normalizeOptionalInteger(changedByUserId),
      normalizeText(changeSource) || 'manual',
      normalizeOptionalInteger(overrideRequestId),
      normalizeText(notes)
    ]
  );
}

async function assignTechUnit({ unitId, toUserId = null, changedByUserId = null, changeSource = 'manual', overrideRequestId = null, notes = null }) {
  const state = await getUnitTableState();
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId || !state.exists || !state.primaryKeyColumn || !state.assignmentCapabilities.hasAssignedToUserId) {
    return false;
  }

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    return false;
  }

  const normalizedToUserId = normalizeOptionalInteger(toUserId);
  const normalizedChangedByUserId = normalizeOptionalInteger(changedByUserId);
  const previousUserId = normalizeOptionalInteger(unit.assigned_to_user_id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const assignmentUpdates = ['assigned_to_user_id = ?'];
    const assignmentValues = [normalizedToUserId];

    if (state.assignmentCapabilities.hasAssignedAt) {
      assignmentUpdates.push('assigned_at = ?');
      assignmentValues.push(normalizedToUserId ? new Date() : null);
    }

    if (state.assignmentCapabilities.hasAssignmentUpdatedByUserId) {
      assignmentUpdates.push('assignment_updated_by_user_id = ?');
      assignmentValues.push(normalizedChangedByUserId);
    }

    await connection.query(
      `
        UPDATE units
        SET ${assignmentUpdates.join(', ')}
        WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
        LIMIT 1
      `,
      [...assignmentValues, safeUnitId]
    );

    if (previousUserId !== normalizedToUserId) {
      await recordUnitAssignmentHistory(connection, {
        unitId: safeUnitId,
        fromUserId: previousUserId,
        toUserId: normalizedToUserId,
        changedByUserId: normalizedChangedByUserId,
        changeSource,
        overrideRequestId,
        notes
      });
    }

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getResolvedProductionWeightForUnit(unit) {
  if (!unit) {
    return null;
  }

  const { lotMap } = await getLotMap();
  const lot = lotMap.get(Number(unit.lot_id)) || null;
  const [unitCategories, productionWeightOptions] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    productionWeightModel.listProductionWeightOptions()
  ]);
  const unitCategory = unitCategories.find((category) => Number(category.id) === Number(unit.unit_category_config_value_id)) || null;
  const details = getProductionWeightDetailsForUnit({
    row: unit,
    lot,
    unitCategory,
    productionWeightOptions
  });

  return productionWeightModel.normalizeWeightValue(details.effectiveWeight);
}

async function recordUnitWorkCompletion({ unitId, completedByUserId, recordedByUserId, creditSource = 'manual_completion', overrideRequestId = null, weightValue = null, notes = null, actorRoleCodes = [] }) {
  if (!await tableExists('unit_work_completions')) {
    throw new Error('The unit_work_completions table is not ready yet. Run the Step 6f.0 SQL migration first.');
  }

  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeCompletedByUserId = normalizeRequiredInteger(completedByUserId);
  const safeRecordedByUserId = normalizeOptionalInteger(recordedByUserId);

  if (!safeUnitId || !safeCompletedByUserId) {
    throw new Error('A valid unit and completed-by user are required to record work completion.');
  }

  const completionPreview = await getUnitWorkCompletionPreview(safeUnitId);

  if (!completionPreview.ready) {
    throw new Error(completionPreview.errorMessage || 'Lot work completion could not be recorded.');
  }

  const unit = completionPreview.unit;
  assertUnitActionPermission({
    unit,
    currentUserId: safeCompletedByUserId,
    actorRoleCodes
  });

  const resolvedWeight = weightValue !== null && weightValue !== undefined
    ? productionWeightModel.normalizeWeightValue(weightValue)
    : completionPreview.productionWeight;

  if (resolvedWeight === null || resolvedWeight < 0.10 || resolvedWeight > 10.00) {
    throw new Error('A completion credit weight from 0.10 through 10.00 is required.');
  }

  const safeCreditSource = normalizeText(creditSource) || 'manual_completion';
  const completionColumns = await getTableColumns('unit_work_completions');
  const supportsWorkCycleKey = hasColumn(completionColumns, 'work_cycle_key');
  const workCycleKey = supportsWorkCycleKey && safeCreditSource === 'manual_completion'
    ? await getCurrentLotWorkCycleKey(unit)
    : null;
  const insertColumns = [
    'unit_id',
    'lot_id',
    'completed_by_user_id',
    'production_weight_value',
    'credit_source',
    'recorded_by_user_id',
    'override_request_id',
    'notes'
  ];
  const insertValues = [
    safeUnitId,
    normalizeOptionalInteger(unit.lot_id),
    safeCompletedByUserId,
    resolvedWeight,
    safeCreditSource,
    safeRecordedByUserId,
    normalizeOptionalInteger(overrideRequestId),
    normalizeText(notes)
  ];

  if (supportsWorkCycleKey) {
    insertColumns.push('work_cycle_key');
    insertValues.push(workCycleKey);
  }

  try {
    await pool.query(
      `
        INSERT INTO unit_work_completions (${insertColumns.map(escapeIdentifier).join(', ')})
        VALUES (${insertColumns.map(() => '?').join(', ')})
      `,
      insertValues
    );
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY' && workCycleKey) {
      throw new Error('Lot work is already marked complete for this unit’s current lot stay.');
    }

    throw error;
  }

  return true;
}


async function getCurrentLotCycleRecord(unit) {
  const unitId = normalizeRequiredInteger(unit && unit.unit_id);
  const lotId = normalizeOptionalInteger(unit && unit.lot_id);

  if (!unitId || !lotId || !await tableExists('unit_lot_history')) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT unit_lot_history_id, moved_at
      FROM unit_lot_history
      WHERE unit_id = ?
        AND to_lot_id = ?
      ORDER BY moved_at DESC, unit_lot_history_id DESC
      LIMIT 1
    `,
    [unitId, lotId]
  );

  return rows[0] || null;
}

async function getCurrentLotCycleStart(unit) {
  const cycleRecord = await getCurrentLotCycleRecord(unit);

  return cycleRecord && cycleRecord.moved_at
    ? cycleRecord.moved_at
    : (unit && unit.created_at ? unit.created_at : null);
}

async function getCurrentLotWorkCycleKey(unit) {
  const unitId = normalizeRequiredInteger(unit && unit.unit_id);
  const lotId = normalizeOptionalInteger(unit && unit.lot_id);

  if (!unitId || !lotId) {
    return null;
  }

  const cycleRecord = await getCurrentLotCycleRecord(unit);

  return cycleRecord && cycleRecord.unit_lot_history_id
    ? `move:${unitId}:${lotId}:${cycleRecord.unit_lot_history_id}`
    : `initial:${unitId}:${lotId}`;
}

async function hasRecordedManualCompletionForCurrentLotCycle(unit) {
  if (!unit || !await tableExists('unit_work_completions')) {
    return false;
  }

  const unitId = normalizeRequiredInteger(unit.unit_id);
  const lotId = normalizeOptionalInteger(unit.lot_id);

  if (!unitId || !lotId) {
    return false;
  }

  const cycleStart = await getCurrentLotCycleStart(unit);

  if (!cycleStart) {
    return false;
  }

  const [rows] = await pool.query(
    `
      SELECT unit_work_completion_id
      FROM unit_work_completions
      WHERE unit_id = ?
        AND lot_id = ?
        AND credit_source = 'manual_completion'
        AND completed_at >= ?
      ORDER BY completed_at DESC, unit_work_completion_id DESC
      LIMIT 1
    `,
    [unitId, lotId, cycleStart]
  );

  return rows.length > 0;
}


async function getUnitWorkCompletionPreview(unitId) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const state = await getUnitTableState();

  if (!safeUnitId || !state.exists || !state.primaryKeyColumn) {
    return {
      ready: false,
      unit: null,
      unitId: null,
      unitLabel: 'Invalid unit',
      lotName: 'Unknown lot',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'The selected unit ID is invalid.'
    };
  }

  const unit = await getUnitById(safeUnitId);

  if (!unit) {
    return {
      ready: false,
      unit: null,
      unitId: safeUnitId,
      unitLabel: 'Unit not found',
      lotName: 'Unknown lot',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'The selected unit could not be found.'
    };
  }

  if (isUnitParked(unit)) {
    return {
      ready: false,
      unit,
      unitId: safeUnitId,
      unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
      lotName: 'No active lot',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'Parked units cannot have lot work completed until they return to an active lot.'
    };
  }

  const lotId = normalizeOptionalInteger(unit.lot_id);

  if (!lotId) {
    return {
      ready: false,
      unit,
      unitId: safeUnitId,
      unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
      lotName: 'No active lot',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'This unit must be in an active lot before lot work can be completed.'
    };
  }

  const { lotMap } = await getLotMap();
  const lot = lotMap.get(lotId) || null;

  if (!lot) {
    return {
      ready: false,
      unit,
      unitId: safeUnitId,
      unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
      lotName: 'Lot not found',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'The unit’s current lot could not be found.'
    };
  }

  const productionWeight = await getResolvedProductionWeightForUnit(unit);

  if (productionWeight === null || productionWeight < 0.10 || productionWeight > 10.00) {
    return {
      ready: false,
      unit,
      unitId: safeUnitId,
      unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
      lotName: lot.name || 'Current lot',
      productionWeight: null,
      formattedProductionWeight: '—',
      errorMessage: 'This unit needs a production weight from 0.10 through 10.00 before lot work can be completed.'
    };
  }

  if (await hasRecordedManualCompletionForCurrentLotCycle(unit)) {
    return {
      ready: false,
      unit,
      unitId: safeUnitId,
      unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
      lotName: lot.name || 'Current lot',
      productionWeight,
      formattedProductionWeight: Number(productionWeight).toFixed(2),
      errorMessage: 'Lot work is already marked complete for this unit’s current lot stay.'
    };
  }

  return {
    ready: true,
    unit,
    unitId: safeUnitId,
    unitLabel: getDisplayAssetTag(unit.asset_number) || `Unit #${safeUnitId}`,
    lotId,
    lotName: lot.name || 'Current lot',
    productionWeight,
    formattedProductionWeight: Number(productionWeight).toFixed(2),
    errorMessage: ''
  };
}


function getWorkCreditSourceLabel(sourceCode) {
  const source = String(sourceCode || '').trim();

  if (source === 'manual_completion') {
    return 'Unit Complete';
  }

  if (source === 'override_prior_tech_credit') {
    return 'Prior Tech credit';
  }

  return source
    ? source.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'Recorded credit';
}

function getUserDisplayNameFromRow(row, prefix) {
  const safePrefix = String(prefix || '').trim();
  const firstName = row[`${safePrefix}_first_name`];
  const lastName = row[`${safePrefix}_last_name`];
  const email = row[`${safePrefix}_email`];
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || email || '';
}

async function getLatestWorkCompletionMapForUnits(unitIds) {
  const ids = Array.isArray(unitIds)
    ? [...new Set(unitIds.map((value) => normalizeRequiredInteger(value)).filter(Boolean))]
    : [];
  const result = new Map();

  if (ids.length === 0 || !await tableExists('unit_work_completions')) {
    return result;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `
      SELECT
        c.unit_work_completion_id,
        c.unit_id,
        c.lot_id,
        c.completed_by_user_id,
        c.completed_at,
        c.production_weight_value,
        c.credit_source,
        l.name AS lot_name,
        completed_by.first_name AS completed_by_first_name,
        completed_by.last_name AS completed_by_last_name,
        completed_by.email AS completed_by_email
      FROM unit_work_completions c
      INNER JOIN (
        SELECT unit_id, MAX(unit_work_completion_id) AS latest_completion_id
        FROM unit_work_completions
        WHERE unit_id IN (${placeholders})
        GROUP BY unit_id
      ) latest_completion
        ON latest_completion.latest_completion_id = c.unit_work_completion_id
      LEFT JOIN lots l
        ON l.lot_id = c.lot_id
      LEFT JOIN users completed_by
        ON completed_by.user_id = c.completed_by_user_id
    `,
    ids
  );

  rows.forEach((row) => {
    result.set(Number(row.unit_id), {
      unitWorkCompletionId: Number(row.unit_work_completion_id),
      lotId: row.lot_id ? Number(row.lot_id) : null,
      lotName: row.lot_name || 'No active lot',
      completedByUserId: row.completed_by_user_id ? Number(row.completed_by_user_id) : null,
      completedByName: getUserDisplayNameFromRow(row, 'completed_by') || 'Unknown user',
      completedAt: row.completed_at,
      productionWeight: row.production_weight_value !== null && row.production_weight_value !== undefined
        ? Number(row.production_weight_value)
        : null,
      formattedProductionWeight: row.production_weight_value !== null && row.production_weight_value !== undefined
        ? Number(row.production_weight_value).toFixed(2)
        : '—',
      creditSource: row.credit_source || '',
      creditSourceLabel: getWorkCreditSourceLabel(row.credit_source)
    });
  });

  return result;
}

async function getUnitWorkCompletionsForUser(unitId, userId) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const safeUserId = normalizeRequiredInteger(userId);

  if (!safeUnitId || !safeUserId || !await tableExists('unit_work_completions')) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT
        c.unit_work_completion_id,
        c.lot_id,
        c.completed_at,
        c.production_weight_value,
        c.credit_source,
        c.notes,
        l.name AS lot_name
      FROM unit_work_completions c
      LEFT JOIN lots l
        ON l.lot_id = c.lot_id
      WHERE c.unit_id = ?
        AND c.completed_by_user_id = ?
      ORDER BY c.completed_at DESC, c.unit_work_completion_id DESC
      LIMIT 100
    `,
    [safeUnitId, safeUserId]
  );

  return rows.map((row) => ({
    unitWorkCompletionId: Number(row.unit_work_completion_id),
    lotName: row.lot_name || 'No active lot',
    completedAt: row.completed_at,
    formattedProductionWeight: row.production_weight_value !== null && row.production_weight_value !== undefined
      ? Number(row.production_weight_value).toFixed(2)
      : '—',
    creditSourceLabel: getWorkCreditSourceLabel(row.credit_source),
    notes: row.notes || ''
  }));
}

async function getUnitOperationalHistory(unitId) {
  const safeUnitId = normalizeRequiredInteger(unitId);
  const emptyHistory = {
    workCompletions: [],
    assignmentChanges: [],
    lotMoves: [],
    lifecycleEvents: []
  };

  if (!safeUnitId) {
    return emptyHistory;
  }

  const [hasWorkCompletions, hasAssignmentHistory, hasLotHistory, hasParkHistory] = await Promise.all([
    tableExists('unit_work_completions'),
    tableExists('unit_assignment_history'),
    tableExists('unit_lot_history'),
    tableExists('unit_park_history')
  ]);

  const [workRows, assignmentRows, lotRows, parkRows] = await Promise.all([
    hasWorkCompletions
      ? pool.query(
        `
          SELECT
            c.unit_work_completion_id,
            c.lot_id,
            c.completed_by_user_id,
            c.completed_at,
            c.production_weight_value,
            c.credit_source,
            c.recorded_by_user_id,
            c.notes,
            l.name AS lot_name,
            completed_by.first_name AS completed_by_first_name,
            completed_by.last_name AS completed_by_last_name,
            completed_by.email AS completed_by_email,
            recorded_by.first_name AS recorded_by_first_name,
            recorded_by.last_name AS recorded_by_last_name,
            recorded_by.email AS recorded_by_email
          FROM unit_work_completions c
          LEFT JOIN lots l
            ON l.lot_id = c.lot_id
          LEFT JOIN users completed_by
            ON completed_by.user_id = c.completed_by_user_id
          LEFT JOIN users recorded_by
            ON recorded_by.user_id = c.recorded_by_user_id
          WHERE c.unit_id = ?
          ORDER BY c.completed_at DESC, c.unit_work_completion_id DESC
          LIMIT 100
        `,
        [safeUnitId]
      )
      : Promise.resolve([[]]),
    hasAssignmentHistory
      ? pool.query(
        `
          SELECT
            h.unit_assignment_history_id,
            h.from_user_id,
            h.to_user_id,
            h.changed_by_user_id,
            h.change_source,
            h.notes,
            h.changed_at,
            from_user.first_name AS from_user_first_name,
            from_user.last_name AS from_user_last_name,
            from_user.email AS from_user_email,
            to_user.first_name AS to_user_first_name,
            to_user.last_name AS to_user_last_name,
            to_user.email AS to_user_email,
            changed_by.first_name AS changed_by_first_name,
            changed_by.last_name AS changed_by_last_name,
            changed_by.email AS changed_by_email
          FROM unit_assignment_history h
          LEFT JOIN users from_user
            ON from_user.user_id = h.from_user_id
          LEFT JOIN users to_user
            ON to_user.user_id = h.to_user_id
          LEFT JOIN users changed_by
            ON changed_by.user_id = h.changed_by_user_id
          WHERE h.unit_id = ?
          ORDER BY h.changed_at DESC, h.unit_assignment_history_id DESC
          LIMIT 100
        `,
        [safeUnitId]
      )
      : Promise.resolve([[]]),
    hasLotHistory
      ? pool.query(
        `
          SELECT
            h.unit_lot_history_id,
            h.from_lot_id,
            h.to_lot_id,
            h.moved_by_user_id,
            h.notes,
            h.moved_at,
            from_lot.name AS from_lot_name,
            to_lot.name AS to_lot_name,
            moved_by.first_name AS moved_by_first_name,
            moved_by.last_name AS moved_by_last_name,
            moved_by.email AS moved_by_email
          FROM unit_lot_history h
          LEFT JOIN lots from_lot
            ON from_lot.lot_id = h.from_lot_id
          LEFT JOIN lots to_lot
            ON to_lot.lot_id = h.to_lot_id
          LEFT JOIN users moved_by
            ON moved_by.user_id = h.moved_by_user_id
          WHERE h.unit_id = ?
          ORDER BY h.moved_at DESC, h.unit_lot_history_id DESC
          LIMIT 100
        `,
        [safeUnitId]
      )
      : Promise.resolve([[]]),
    hasParkHistory
      ? pool.query(
        `
          SELECT
            h.unit_park_history_id,
            h.event_type,
            h.from_lot_id,
            h.to_lot_id,
            h.from_assigned_to_user_id,
            h.to_assigned_to_user_id,
            h.changed_by_user_id,
            h.notes,
            h.changed_at,
            from_lot.name AS from_lot_name,
            to_lot.name AS to_lot_name,
            from_user.first_name AS from_user_first_name,
            from_user.last_name AS from_user_last_name,
            from_user.email AS from_user_email,
            to_user.first_name AS to_user_first_name,
            to_user.last_name AS to_user_last_name,
            to_user.email AS to_user_email,
            changed_by.first_name AS changed_by_first_name,
            changed_by.last_name AS changed_by_last_name,
            changed_by.email AS changed_by_email
          FROM unit_park_history h
          LEFT JOIN lots from_lot ON from_lot.lot_id = h.from_lot_id
          LEFT JOIN lots to_lot ON to_lot.lot_id = h.to_lot_id
          LEFT JOIN users from_user ON from_user.user_id = h.from_assigned_to_user_id
          LEFT JOIN users to_user ON to_user.user_id = h.to_assigned_to_user_id
          LEFT JOIN users changed_by ON changed_by.user_id = h.changed_by_user_id
          WHERE h.unit_id = ?
          ORDER BY h.changed_at DESC, h.unit_park_history_id DESC
          LIMIT 100
        `,
        [safeUnitId]
      )
      : Promise.resolve([[]])
  ]);

  return {
    workCompletions: (workRows[0] || []).map((row) => ({
      unitWorkCompletionId: Number(row.unit_work_completion_id),
      lotName: row.lot_name || 'No active lot',
      completedByName: getUserDisplayNameFromRow(row, 'completed_by') || 'Unknown user',
      recordedByName: getUserDisplayNameFromRow(row, 'recorded_by') || '',
      completedAt: row.completed_at,
      productionWeight: row.production_weight_value !== null && row.production_weight_value !== undefined
        ? Number(row.production_weight_value)
        : null,
      formattedProductionWeight: row.production_weight_value !== null && row.production_weight_value !== undefined
        ? Number(row.production_weight_value).toFixed(2)
        : '—',
      creditSource: row.credit_source || '',
      creditSourceLabel: getWorkCreditSourceLabel(row.credit_source),
      notes: row.notes || ''
    })),
    assignmentChanges: (assignmentRows[0] || []).map((row) => ({
      fromUserName: getUserDisplayNameFromRow(row, 'from_user') || 'Unassigned',
      toUserName: getUserDisplayNameFromRow(row, 'to_user') || 'Unassigned',
      changedByName: getUserDisplayNameFromRow(row, 'changed_by') || 'System',
      changedAt: row.changed_at,
      changeSource: row.change_source || 'manual',
      notes: row.notes || ''
    })),
    lotMoves: (lotRows[0] || []).map((row) => ({
      fromLotName: row.from_lot_name || 'No active lot',
      toLotName: row.to_lot_name || 'No active lot',
      movedByName: getUserDisplayNameFromRow(row, 'moved_by') || 'System',
      movedAt: row.moved_at,
      notes: row.notes || ''
    })),
    lifecycleEvents: (parkRows[0] || []).map((row) => ({
      eventType: row.event_type || 'parked',
      eventLabel: row.event_type === 'returned_to_active' ? 'Returned to Active' : 'Parked',
      fromLotName: row.from_lot_name || 'No active lot',
      toLotName: row.to_lot_name || 'No active lot',
      fromAssignedToName: getUserDisplayNameFromRow(row, 'from_user') || 'Unassigned',
      toAssignedToName: getUserDisplayNameFromRow(row, 'to_user') || 'Unassigned',
      changedByName: getUserDisplayNameFromRow(row, 'changed_by') || 'System',
      changedAt: row.changed_at,
      notes: row.notes || ''
    }))
  };
}

function hasElevatedLotMoveAuthority(actorRoleCodes) {
  const roles = Array.isArray(actorRoleCodes) ? actorRoleCodes : [];

  return roles.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(String(roleCode || '').trim()));
}

function assertUnitActionPermission({ unit, currentUserId, actorRoleCodes }) {
  assertUnitIsNotParked(unit);

  if (hasElevatedLotMoveAuthority(actorRoleCodes)) {
    return;
  }

  const safeCurrentUserId = normalizeRequiredInteger(currentUserId);
  const assignedUserId = normalizeOptionalInteger(unit && unit.assigned_to_user_id);

  if (!safeCurrentUserId || !assignedUserId || assignedUserId !== safeCurrentUserId) {
    throw createLotMovePolicyError(
      'BWT_UNIT_ACTION_NOT_ASSIGNED',
      'You can record work only for a unit currently assigned to you.'
    );
  }
}

function assertUnitEditPermission({ unit, currentUserId, actorRoleCodes }) {
  assertUnitIsNotParked(unit);

  if (hasElevatedLotMoveAuthority(actorRoleCodes)) {
    return;
  }

  const safeCurrentUserId = normalizeRequiredInteger(currentUserId);
  const assignedUserId = normalizeOptionalInteger(unit && unit.assigned_to_user_id);

  if (!safeCurrentUserId || !assignedUserId || assignedUserId !== safeCurrentUserId) {
    throw createLotMovePolicyError(
      'BWT_UNIT_EDIT_NOT_ASSIGNED',
      'You can edit only units currently assigned to you.'
    );
  }
}

async function hasAnyRecordedManualCompletion(unitId) {
  const safeUnitId = normalizeRequiredInteger(unitId);

  if (!safeUnitId || !await tableExists('unit_work_completions')) {
    return false;
  }

  const [rows] = await pool.query(
    `
      SELECT unit_work_completion_id
      FROM unit_work_completions
      WHERE unit_id = ?
        AND credit_source = 'manual_completion'
      LIMIT 1
    `,
    [safeUnitId]
  );

  return rows.length > 0;
}

function createLotMovePolicyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function assertLotDestinationIsOpenOrCurrent({ unit, nextLotId }) {
  const previousLotId = normalizeOptionalInteger(unit && unit.lot_id);
  const normalizedNextLotId = normalizeRequiredInteger(nextLotId);

  if (!normalizedNextLotId) {
    throw createLotMovePolicyError(
      'BWT_LOT_DESTINATION_NOT_OPEN',
      'Choose an open, assignable lot.'
    );
  }

  if (previousLotId && previousLotId === normalizedNextLotId) {
    return;
  }

  const { assignableLots } = await getLotMap();
  const isOpenAssignableLot = assignableLots.some((lot) => Number(lot.lot_id) === normalizedNextLotId);

  if (!isOpenAssignableLot) {
    throw createLotMovePolicyError(
      'BWT_LOT_DESTINATION_NOT_OPEN',
      'Closed, hidden, and parent/container lots cannot receive units. Choose an open child or standalone lot.'
    );
  }
}

async function assertLotMovePermission({ unit, nextLotId, currentUserId, actorRoleCodes }) {
  const previousLotId = normalizeOptionalInteger(unit && unit.lot_id);
  const normalizedNextLotId = normalizeRequiredInteger(nextLotId);

  if (!previousLotId || !normalizedNextLotId || previousLotId === normalizedNextLotId) {
    return;
  }

  if (hasElevatedLotMoveAuthority(actorRoleCodes)) {
    return;
  }

  const currentUserIdNumber = normalizeRequiredInteger(currentUserId);
  const assignedUserId = normalizeOptionalInteger(unit && unit.assigned_to_user_id);

  if (!currentUserIdNumber || !assignedUserId || assignedUserId !== currentUserIdNumber) {
    throw createLotMovePolicyError(
      'BWT_LOT_MOVE_NOT_ASSIGNED',
      'Only the Tech currently assigned to an unfinished unit may correct its lot directly.'
    );
  }

  if (await hasAnyRecordedManualCompletion(unit.unit_id)) {
    throw createLotMovePolicyError(
      'BWT_LOT_MOVE_REQUIRES_APPROVAL',
      'This unit already has recorded work. A Tech Lead, Management user, or Admin must move it to another lot.'
    );
  }
}

module.exports = {
  getBlankUnitFormData,
  getTechUnitFormOptions,
  getUnitFormDataById,
  listTechUnits,
  findDuplicateUnitsForForm,
  findSerialDuplicateCandidates,
  getDuplicateAssumptionCandidates,
  assumeExistingTechUnitFromDuplicateMatch,
  getDuplicateUnitMessage,
  createTechUnit,
  createIntentionalDuplicateTechUnitWithConnection,
  updateTechUnit,
  useExistingTechUnit,
  getUnitById,
  getTechUnitLifecycleSummaryById,
  getTechUnitPermanentDeletionPreviewById,
  getReturnToActiveOptions,
  parkTechUnit,
  returnTechUnitToActive,
  isUnitParked,
  permanentlyDeleteTechUnit,
  assignTechUnit,
  getLatestWorkCompletionMapForUnits,
  getUnitOperationalHistory,
  getUnitWorkCompletionsForUser,
  getUnitWorkCompletionPreview,
  recordUnitWorkCompletion,
  getAssetTagPrefix,
  getDisplayAssetTag,
  normalizeAssetTagInput,
  isAssignableLot,
  getAssignableLots,
  getBrowsableLots,
  getProcessorCompatibilityStatus
};
