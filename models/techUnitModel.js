const { pool } = require('./db');
const lotModel = require('./lotModel');

const UNIT_LIMIT = 100;
const ASSET_NUMBER_START = 2300000;

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
    'processor_models',
    'unit_identifiers'
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

async function listUnitModels() {
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

  const activeFilter = hasColumn(columns, 'is_active') ? 'WHERE um.is_active = 1' : '';
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
        ${modelIdentifierSelect}
      FROM unit_models um
      ${manufacturerJoin}
      ${activeFilter}
      ORDER BY manufacturer_name, model_name, model_number
    `
  );

  return rows.map((row) => {
    const details = [
      row.manufacturer_name,
      row.model_number,
      row.model_identifier
    ].filter(Boolean);

    return {
      id: Number(row.unit_model_id),
      manufacturerId: row.manufacturer_id ? Number(row.manufacturer_id) : null,
      unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
      label: details.length > 0 ? `${row.model_name} (${details.join(' · ')})` : row.model_name,
      shortLabel: row.model_name
    };
  });
}

async function listProcessorModels() {
  const columns = await getTableColumns('processor_models');

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

  const activeFilter = hasColumn(columns, 'is_active') ? 'WHERE is_active = 1' : '';

  const [rows] = await pool.query(
    `
      SELECT
        processor_model_id,
        ${brandIdColumn ? escapeIdentifier(brandIdColumn) : 'NULL'} AS processor_brand_id,
        ${familyColumn ? escapeIdentifier(familyColumn) : 'NULL'} AS processor_family,
        ${escapeIdentifier(modelColumn)} AS model_code,
        ${speedColumn ? escapeIdentifier(speedColumn) : 'NULL'} AS base_speed_ghz,
        ${generationColumn ? escapeIdentifier(generationColumn) : 'NULL'} AS generation
      FROM processor_models
      ${activeFilter}
      ORDER BY processor_family, model_code, generation
    `
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
      baseSpeedGhz: row.base_speed_ghz
    };
  });
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
    hasUnitStatus: hasColumn(columns, 'current_unit_status_config_value_id')
  };
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

function isAssignableLot(lot, parentLotIdsWithChildren) {
  if (!lot) {
    return false;
  }

  return !parentLotIdsWithChildren.has(String(lot.lot_id));
}

function getAssignableLots(lots) {
  const parentLotIdsWithChildren = getParentLotIdsWithChildren(lots);

  return lots.filter((lot) => isAssignableLot(lot, parentLotIdsWithChildren));
}

async function getLotMap() {
  const lots = await lotModel.listLots();
  const assignableLots = getAssignableLots(lots);
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot);
  });

  return {
    lots,
    assignableLots,
    lotMap
  };
}

async function generateNextAssetNumber() {
  const [rows] = await pool.query(
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

function normalizeIdentifierText(value) {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');

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

async function getTechUnitFormOptions() {
  const state = await getUnitTableState();
  const { assignableLots } = await getLotMap();

  const [
    unitCategories,
    unitStatuses,
    ramTypes,
    storageTypes,
    operatingSystems,
    manufacturers,
    unitModels,
    processorModels
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    listConfigValuesByCategoryCodes(['unit_statuses', 'unit_status', 'current_unit_statuses', 'current_unit_status']),
    listConfigValuesByCategoryCodes(['ram_types', 'ram_type']),
    listConfigValuesByCategoryCodes(['storage_types', 'storage_type', 'ssd_types', 'ssd_type']),
    listConfigValuesByCategoryCodes(['operating_systems', 'operating_system']),
    listManufacturers(),
    listUnitModels(),
    listProcessorModels()
  ]);

  const receivedStatus = unitStatuses.find((status) => status.code === 'received') || unitStatuses[0] || null;

  return {
    supported: state.exists && Boolean(state.primaryKeyColumn),
    message: state.exists
      ? 'Unit form is connected to the current units table schema.'
      : 'The units table does not exist yet.',
    assetTagPrefix: getAssetTagPrefix(),
    state,
    lots: assignableLots,
    unitCategories,
    unitStatuses,
    defaultUnitStatusId: receivedStatus ? String(receivedStatus.id) : '',
    ramTypes,
    storageTypes,
    operatingSystems,
    manufacturers,
    unitModels,
    processorModels
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

  const unitSerialNumber = await getUnitIdentifierValue(unitId, 'unit_serial_number');
  const biosSerialNumber = await getUnitIdentifierValue(unitId, 'bios_serial_number');

  return {
    assetTag: unit.asset_number ? getDisplayAssetTag(unit.asset_number) : '',
    unitSerialNumber,
    biosSerialNumber,
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

async function listTechUnits(filters = {}) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    return {
      supported: false,
      message: 'The units table or primary key column was not found yet.',
      units: [],
      filters,
      lots: [],
      unitLimit: UNIT_LIMIT
    };
  }

  const { assignableLots, lotMap } = await getLotMap();
  const assignableLotIds = new Set(assignableLots.map((lot) => String(lot.lot_id)));

  const [
    unitCategories,
    unitStatuses,
    ramTypes,
    storageTypes,
    operatingSystems,
    manufacturers,
    unitModels,
    processorModels
  ] = await Promise.all([
    listConfigValuesByCategoryCodes(['unit_categories', 'unit_category', 'unit_types', 'unit_type']),
    listConfigValuesByCategoryCodes(['unit_statuses', 'unit_status', 'current_unit_statuses', 'current_unit_status']),
    listConfigValuesByCategoryCodes(['ram_types', 'ram_type']),
    listConfigValuesByCategoryCodes(['storage_types', 'storage_type', 'ssd_types', 'ssd_type']),
    listConfigValuesByCategoryCodes(['operating_systems', 'operating_system']),
    listManufacturers(),
    listUnitModels(),
    listProcessorModels()
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

  const where = [];
  const params = [];

  if (filters.lotId) {
    const lotId = Number(filters.lotId);

    if (Number.isInteger(lotId) && lotId > 0 && assignableLotIds.has(String(lotId))) {
      where.push('u.lot_id = ?');
      params.push(lotId);
    }
  }

  if (filters.search) {
    const normalizedSearchAssetNumber = normalizeAssetTagInput(filters.search);
    const normalizedIdentifierSearch = compactAssetTagValue(filters.search);
    const searchParts = [
      'CAST(u.asset_number AS CHAR) LIKE ?',
      'CAST(u.unit_id AS CHAR) LIKE ?',
      'u.hardware_notes LIKE ?',
      'u.cosmetic_notes LIKE ?',
      'm.name LIKE ?',
      'um.model_name LIKE ?',
      'pm.model_code LIKE ?',
      'cv_category.label LIKE ?',
      'cv_status.label LIKE ?',
      'cv_ram_type.label LIKE ?',
      'cv_storage_type.label LIKE ?',
      'cv_os.label LIKE ?'
    ];

    params.push(
      `%${normalizedSearchAssetNumber || filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`
    );

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
      params.push(`%${filters.search}%`, `%${normalizedIdentifierSearch}%`);
    }

    if (normalizedSearchAssetNumber) {
      searchParts.unshift('u.asset_number = ?');
      params.unshift(normalizedSearchAssetNumber);
    }

    where.push(`(${searchParts.join(' OR ')})`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `
      SELECT u.*
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
      ${whereSql}
      ORDER BY u.updated_at DESC, u.unit_id DESC
      LIMIT ?
    `,
    [...params, UNIT_LIMIT]
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

    const specParts = [
      manufacturerLabel,
      modelLabel,
      processorLabel,
      row.ram_gb ? `${row.ram_gb}GB RAM` : '',
      ramTypeLabel,
      row.storage_gb ? `${row.storage_gb}GB Storage` : '',
      storageTypeLabel
    ].filter(Boolean);

    return {
      unitId: row.unit_id,
      assetNumber: row.asset_number,
      assetTag,
      label: assetTag || `Unit #${row.unit_id}`,
      lotId: row.lot_id,
      lotName: lot ? lot.lot_name : `Lot ID ${row.lot_id}`,
      statusLabel: configLabelById(unitStatusMap, row.current_unit_status_config_value_id, 'Unknown'),
      categoryLabel: configLabelById(unitCategoryMap, row.unit_category_config_value_id, 'Unknown'),
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
      completedAt: row.completed_at
    };
  });

  return {
    supported: true,
    message: 'Tech units loaded.',
    assetTagPrefix: getAssetTagPrefix(),
    units,
    filters,
    lots: assignableLots,
    unitLimit: UNIT_LIMIT
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
    : `Unit #${firstMatch.unitId}`;

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
  const clauses = [];
  const params = [];

  identifierEntries.forEach((entry) => {
    const typeId = typeMap.get(entry.typeCode);

    if (!typeId || !entry.normalizedValue) {
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

function buildWritePayload(formData, currentUserId, mode, assetNumber) {
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
  }

  addColumn('lot_id', normalizeRequiredInteger(formData.lotId));
  addColumn('unit_category_config_value_id', normalizeRequiredInteger(formData.unitCategoryConfigValueId));
  addColumn('current_unit_status_config_value_id', normalizeRequiredInteger(formData.currentUnitStatusConfigValueId));
  addColumn('manufacturer_id', normalizeOptionalInteger(formData.manufacturerId));
  addColumn('unit_model_id', normalizeOptionalInteger(formData.unitModelId));
  addColumn('processor_model_id', normalizeOptionalInteger(formData.processorModelId));
  addColumn('processor_speed_ghz', normalizeOptionalDecimal(formData.processorSpeedGhz));
  addColumn('ram_gb', normalizeOptionalInteger(formData.ramGb));
  addColumn('ram_type_config_value_id', normalizeOptionalInteger(formData.ramTypeConfigValueId));
  addColumn('storage_gb', normalizeOptionalInteger(formData.storageGb));
  addColumn('storage_type_config_value_id', normalizeOptionalInteger(formData.storageTypeConfigValueId));
  addColumn('operating_system_config_value_id', normalizeOptionalInteger(formData.operatingSystemConfigValueId));
  addColumn('hardware_notes', normalizeText(formData.hardwareNotes));
  addColumn('cosmetic_notes', normalizeText(formData.cosmeticNotes));

  return {
    columns,
    values
  };
}

async function createTechUnit(formData, currentUserId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.primaryKeyColumn) {
    throw new Error('The units table or primary key column was not found.');
  }

  const suppliedAssetNumber = normalizeAssetTagInput(formData.assetTag);
  const assetNumber = suppliedAssetNumber || await generateNextAssetNumber();
  const duplicateMatches = await findDuplicateUnitsFromIdentifiers(buildIdentifierEntries(formData, assetNumber));

  if (duplicateMatches.length > 0) {
    throw createDuplicateIdentifierError(duplicateMatches);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const payload = buildWritePayload(formData, currentUserId, 'create', assetNumber);
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

  try {
    await connection.beginTransaction();

    const payload = buildWritePayload(formData, currentUserId, 'update', null);
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

async function updateTechUnit(unitId, formData, currentUserId) {
  return updateExistingTechUnit(unitId, formData, currentUserId, {
    recordLotHistory: true,
    lotMoveNotes: 'Unit lot changed from the Tech Unit edit form.'
  });
}

async function useExistingTechUnit(unitId, formData, currentUserId) {
  return updateExistingTechUnit(unitId, formData, currentUserId, {
    recordLotHistory: true,
    lotMoveNotes: 'Duplicate detection confirmed this was an existing unit; unit record was updated instead of creating a duplicate.'
  });
}

module.exports = {
  getBlankUnitFormData,
  getTechUnitFormOptions,
  getUnitFormDataById,
  listTechUnits,
  findDuplicateUnitsForForm,
  getDuplicateUnitMessage,
  createTechUnit,
  updateTechUnit,
  useExistingTechUnit,
  getUnitById,
  getAssetTagPrefix,
  getDisplayAssetTag,
  normalizeAssetTagInput,
  isAssignableLot,
  getAssignableLots
};
