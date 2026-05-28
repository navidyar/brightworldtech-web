const { pool } = require('./db');
const lotModel = require('./lotModel');
const requirementOptionModel = require('./requirementOptionModel');

const UNIT_LIMIT = 100;

const FIELD_DEFINITIONS = [
  {
    name: 'assetTag',
    label: 'Asset Tag',
    requirementKey: null,
    candidates: ['asset_tag', 'bwt_asset_tag', 'unit_asset_tag']
  },
  {
    name: 'serialNumber',
    label: 'Unit Serial Number',
    requirementKey: null,
    candidates: ['serial_number', 'unit_serial_number']
  },
  {
    name: 'biosSerialNumber',
    label: 'BIOS Serial Number',
    requirementKey: null,
    candidates: ['bios_serial_number']
  },
  {
    name: 'unitType',
    label: 'Unit Type',
    requirementKey: 'unit_type',
    candidates: ['unit_type_config_value_id', 'unit_type', 'type_config_value_id', 'type', 'category_config_value_id', 'category']
  },
  {
    name: 'manufacturer',
    label: 'Manufacturer',
    requirementKey: 'manufacturer',
    candidates: ['manufacturer_config_value_id', 'manufacturer', 'make_config_value_id', 'make', 'brand_config_value_id', 'brand']
  },
  {
    name: 'model',
    label: 'Model',
    requirementKey: 'model',
    candidates: ['unit_model_config_value_id', 'model_config_value_id', 'unit_model', 'model', 'model_name']
  },
  {
    name: 'ramSize',
    label: 'RAM Size',
    requirementKey: 'ram_size',
    candidates: ['ram_size_config_value_id', 'ram_config_value_id', 'ram_size', 'ram_gb', 'memory_gb', 'memory_size']
  },
  {
    name: 'ramType',
    label: 'RAM Type',
    requirementKey: 'ram_type',
    candidates: ['ram_type_config_value_id', 'ram_type', 'memory_type']
  },
  {
    name: 'storageSize',
    label: 'Storage Size',
    requirementKey: 'storage_size',
    candidates: ['storage_size_config_value_id', 'ssd_size_config_value_id', 'storage_size', 'ssd_size', 'storage_gb', 'ssd_gb', 'drive_size']
  },
  {
    name: 'storageType',
    label: 'Storage Type',
    requirementKey: 'storage_type',
    candidates: ['storage_type_config_value_id', 'ssd_type_config_value_id', 'storage_type', 'ssd_type', 'drive_type']
  },
  {
    name: 'processorBrand',
    label: 'Processor Brand',
    requirementKey: 'processor_brand',
    candidates: ['processor_brand_config_value_id', 'processor_brand', 'cpu_brand_config_value_id', 'cpu_brand']
  },
  {
    name: 'processorModel',
    label: 'Processor Model',
    requirementKey: 'processor_model',
    candidates: ['processor_model_config_value_id', 'processor_model', 'cpu_model_config_value_id', 'cpu_model', 'processor', 'cpu']
  },
  {
    name: 'touchscreen',
    label: 'Touchscreen',
    requirementKey: 'touchscreen',
    candidates: ['touchscreen_config_value_id', 'touchscreen', 'is_touchscreen', 'has_touchscreen']
  },
  {
    name: 'notes',
    label: 'Notes',
    requirementKey: null,
    candidates: ['notes', 'tech_notes', 'comments']
  }
];

const SEARCH_FIELD_NAMES = [
  'assetTag',
  'serialNumber',
  'biosSerialNumber',
  'manufacturer',
  'model',
  'processorModel'
];

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
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
  const allowedTables = ['units', 'config_values'];

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

function isConfigValueColumn(columnName) {
  return String(columnName || '').endsWith('_config_value_id');
}

function isBooleanLikeColumn(columnInfo) {
  if (!columnInfo) {
    return false;
  }

  return ['tinyint', 'bit', 'boolean', 'bool'].includes(String(columnInfo.dataType || '').toLowerCase());
}

function buildFieldTargets(columns) {
  const targets = {};

  FIELD_DEFINITIONS.forEach((field) => {
    const columnName = pickColumn(columns, field.candidates);
    const columnInfo = columnName ? columns.get(columnName) : null;

    targets[field.name] = {
      fieldName: field.name,
      label: field.label,
      requirementKey: field.requirementKey,
      columnName,
      isSupported: Boolean(columnName),
      isConfigValueColumn: Boolean(columnName && isConfigValueColumn(columnName)),
      isBooleanLikeColumn: Boolean(columnInfo && field.name === 'touchscreen' && isBooleanLikeColumn(columnInfo)),
      dataType: columnInfo ? columnInfo.dataType : null
    };
  });

  return targets;
}

function getPrimaryKeyColumn(columns) {
  return pickColumn(columns, ['unit_id', 'id']);
}

async function getConfigValueMap() {
  const columns = await getTableColumns('config_values');

  if (!hasColumn(columns, 'config_value_id')) {
    return new Map();
  }

  const labelColumn = pickColumn(columns, ['label', 'name']) || 'code';
  const codeColumn = hasColumn(columns, 'code') ? 'code' : labelColumn;

  const [rows] = await pool.query(
    `
      SELECT
        config_value_id,
        ${escapeIdentifier(labelColumn)} AS label,
        ${escapeIdentifier(codeColumn)} AS code
      FROM config_values
    `
  );

  const configValueMap = new Map();

  rows.forEach((row) => {
    configValueMap.set(Number(row.config_value_id), {
      label: row.label || row.code,
      code: row.code || row.label
    });
  });

  return configValueMap;
}

async function getUnitTableState() {
  const columns = await getTableColumns('units');
  const exists = columns.size > 0;
  const primaryKeyColumn = exists ? getPrimaryKeyColumn(columns) : null;

  return {
    exists,
    columns,
    primaryKeyColumn,
    hasPrimaryKey: Boolean(primaryKeyColumn),
    hasLotId: hasColumn(columns, 'lot_id'),
    fieldTargets: buildFieldTargets(columns)
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeBooleanValue(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return 1;
  }

  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return 0;
  }

  return null;
}

function normalizeValueForTarget(rawValue, target) {
  const value = normalizeText(rawValue);

  if (!value) {
    return null;
  }

  if (target.isBooleanLikeColumn) {
    return normalizeBooleanValue(value);
  }

  if (target.isConfigValueColumn) {
    const numericValue = Number(value);

    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
  }

  return value;
}

function getDisplayValue(row, target, configValueMap) {
  if (!target || !target.isSupported) {
    return '';
  }

  const rawValue = row[target.columnName];

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return '';
  }

  if (target.isBooleanLikeColumn) {
    return Number(rawValue) === 1 ? 'Yes' : 'No';
  }

  if (target.isConfigValueColumn) {
    const configValue = configValueMap.get(Number(rawValue));

    return configValue ? configValue.label : String(rawValue);
  }

  return String(rawValue);
}

function getRawFormValueFromRow(row, target) {
  if (!target || !target.isSupported) {
    return '';
  }

  const rawValue = row[target.columnName];

  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  if (target.isBooleanLikeColumn) {
    return Number(rawValue) === 1 ? 'yes' : 'no';
  }

  return String(rawValue);
}

function buildUnitDisplayRow(row, state, configValueMap, lotMap) {
  const fieldValues = {};

  FIELD_DEFINITIONS.forEach((field) => {
    fieldValues[field.name] = getDisplayValue(row, state.fieldTargets[field.name], configValueMap);
  });

  const primaryKeyValue = state.primaryKeyColumn ? row[state.primaryKeyColumn] : null;
  const lotId = state.hasLotId ? row.lot_id : null;
  const lot = lotId ? lotMap.get(Number(lotId)) : null;

  const label =
    fieldValues.assetTag ||
    fieldValues.serialNumber ||
    fieldValues.biosSerialNumber ||
    fieldValues.model ||
    (primaryKeyValue ? `Unit #${primaryKeyValue}` : 'Unit');

  const identifiers = [
    fieldValues.assetTag ? `Asset: ${fieldValues.assetTag}` : '',
    fieldValues.serialNumber ? `Serial: ${fieldValues.serialNumber}` : '',
    fieldValues.biosSerialNumber ? `BIOS: ${fieldValues.biosSerialNumber}` : ''
  ].filter(Boolean);

  const specSummary = [
    fieldValues.manufacturer,
    fieldValues.model,
    fieldValues.processorModel,
    fieldValues.ramSize,
    fieldValues.storageSize
  ].filter(Boolean).join(' · ');

  return {
    unitId: primaryKeyValue,
    label,
    identifiers,
    specSummary: specSummary || 'No specs entered yet',
    lotId,
    lotName: lot ? lot.lot_name : lotId ? `Lot ID ${lotId}` : 'No lot',
    fieldValues,
    raw: row
  };
}

async function getLotMap() {
  const lots = await lotModel.listLots();
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot);
  });

  return {
    lots,
    lotMap
  };
}

function getSearchColumns(state) {
  const columns = [];

  SEARCH_FIELD_NAMES.forEach((fieldName) => {
    const target = state.fieldTargets[fieldName];

    if (target && target.isSupported && !target.isConfigValueColumn && !target.isBooleanLikeColumn) {
      columns.push(target.columnName);
    }
  });

  return [...new Set(columns)];
}

async function listTechUnits(filters = {}) {
  const state = await getUnitTableState();

  if (!state.exists || !state.hasPrimaryKey) {
    return {
      supported: false,
      message: 'The units table or primary key column was not found yet.',
      units: [],
      filters
    };
  }

  const configValueMap = await getConfigValueMap();
  const { lots, lotMap } = await getLotMap();

  const where = [];
  const params = [];

  if (state.hasLotId && filters.lotId) {
    const lotId = Number(filters.lotId);

    if (Number.isInteger(lotId) && lotId > 0) {
      where.push('lot_id = ?');
      params.push(lotId);
    }
  }

  if (filters.search) {
    const searchColumns = getSearchColumns(state);

    if (searchColumns.length > 0) {
      where.push(`(${searchColumns.map((columnName) => `${escapeIdentifier(columnName)} LIKE ?`).join(' OR ')})`);
      searchColumns.forEach(() => params.push(`%${filters.search}%`));
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderColumn = pickColumn(state.columns, ['updated_at', 'created_at', state.primaryKeyColumn]) || state.primaryKeyColumn;

  const [rows] = await pool.query(
    `
      SELECT *
      FROM units
      ${whereSql}
      ORDER BY ${escapeIdentifier(orderColumn)} DESC
      LIMIT ?
    `,
    [...params, UNIT_LIMIT]
  );

  return {
    supported: true,
    message: 'Tech units loaded.',
    units: rows.map((row) => buildUnitDisplayRow(row, state, configValueMap, lotMap)),
    filters,
    lots,
    unitLimit: UNIT_LIMIT
  };
}

async function getRequirementOptionMap() {
  const requirementKeys = FIELD_DEFINITIONS
    .map((field) => field.requirementKey)
    .filter(Boolean);

  return requirementOptionModel.getRequirementValueOptionsByKey(requirementKeys);
}

async function getTechUnitFormOptions() {
  const state = await getUnitTableState();
  const { lots } = await getLotMap();
  const requirementValueOptionsByKey = await getRequirementOptionMap();

  return {
    supported: state.exists && state.hasPrimaryKey,
    message: state.exists
      ? 'Unit form is connected to the units table.'
      : 'The units table does not exist yet.',
    hasLotId: state.hasLotId,
    primaryKeyColumn: state.primaryKeyColumn,
    fieldDefinitions: FIELD_DEFINITIONS,
    fieldTargets: state.fieldTargets,
    lots,
    requirementValueOptionsByKey
  };
}

function getBlankUnitFormData() {
  return {
    lotId: '',
    assetTag: '',
    serialNumber: '',
    biosSerialNumber: '',
    unitType: '',
    manufacturer: '',
    model: '',
    ramSize: '',
    ramType: '',
    storageSize: '',
    storageType: '',
    processorBrand: '',
    processorModel: '',
    touchscreen: '',
    notes: ''
  };
}

async function getUnitById(unitId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.hasPrimaryKey) {
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

async function getUnitFormDataById(unitId) {
  const state = await getUnitTableState();
  const unit = await getUnitById(unitId);

  if (!unit) {
    return null;
  }

  const formData = getBlankUnitFormData();

  if (state.hasLotId && unit.lot_id) {
    formData.lotId = String(unit.lot_id);
  }

  FIELD_DEFINITIONS.forEach((field) => {
    formData[field.name] = getRawFormValueFromRow(unit, state.fieldTargets[field.name]);
  });

  return formData;
}

function buildWritePayload(formData, state, currentUserId, mode) {
  const columns = [];
  const values = [];
  const usedColumns = new Set();

  function addColumn(columnName, value) {
    if (!columnName || usedColumns.has(columnName)) {
      return;
    }

    usedColumns.add(columnName);
    columns.push(columnName);
    values.push(value);
  }

  if (state.hasLotId) {
    const lotId = Number(formData.lotId);
    addColumn('lot_id', Number.isInteger(lotId) && lotId > 0 ? lotId : null);
  }

  FIELD_DEFINITIONS.forEach((field) => {
    const target = state.fieldTargets[field.name];

    if (!target || !target.isSupported) {
      return;
    }

    addColumn(target.columnName, normalizeValueForTarget(formData[field.name], target));
  });

  if (mode === 'create') {
    if (hasColumn(state.columns, 'created_by_user_id')) {
      addColumn('created_by_user_id', currentUserId || null);
    }

    if (hasColumn(state.columns, 'created_at')) {
      addColumn('created_at', new Date());
    }
  }

  if (hasColumn(state.columns, 'updated_by_user_id')) {
    addColumn('updated_by_user_id', currentUserId || null);
  }

  if (hasColumn(state.columns, 'updated_at')) {
    addColumn('updated_at', new Date());
  }

  return {
    columns,
    values
  };
}

async function createTechUnit(formData, currentUserId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.hasPrimaryKey) {
    throw new Error('The units table or primary key column was not found.');
  }

  const payload = buildWritePayload(formData, state, currentUserId, 'create');

  if (payload.columns.length === 0) {
    throw new Error('No supported unit columns were found to insert.');
  }

  const placeholders = payload.columns.map(() => '?').join(', ');
  const columnSql = payload.columns.map(escapeIdentifier).join(', ');

  const [result] = await pool.query(
    `
      INSERT INTO units (${columnSql})
      VALUES (${placeholders})
    `,
    payload.values
  );

  return result.insertId;
}

async function updateTechUnit(unitId, formData, currentUserId) {
  const state = await getUnitTableState();

  if (!state.exists || !state.hasPrimaryKey) {
    throw new Error('The units table or primary key column was not found.');
  }

  const payload = buildWritePayload(formData, state, currentUserId, 'update');

  if (payload.columns.length === 0) {
    throw new Error('No supported unit columns were found to update.');
  }

  const setSql = payload.columns.map((columnName) => `${escapeIdentifier(columnName)} = ?`).join(', ');

  await pool.query(
    `
      UPDATE units
      SET ${setSql}
      WHERE ${escapeIdentifier(state.primaryKeyColumn)} = ?
      LIMIT 1
    `,
    [...payload.values, unitId]
  );
}

module.exports = {
  FIELD_DEFINITIONS,
  getBlankUnitFormData,
  getTechUnitFormOptions,
  getUnitFormDataById,
  listTechUnits,
  createTechUnit,
  updateTechUnit,
  getUnitById
};