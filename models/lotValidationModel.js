const { pool } = require('./db');
const lotModel = require('./lotModel');

const UNIT_LIMIT = 250;

const UNIT_FIELD_MAPPINGS = {
  unit_type: [
    'unit_type_config_value_id',
    'unit_type',
    'type_config_value_id',
    'type',
    'category_config_value_id',
    'category'
  ],
  manufacturer: [
    'manufacturer_config_value_id',
    'manufacturer',
    'make_config_value_id',
    'make',
    'brand_config_value_id',
    'brand'
  ],
  model: [
    'unit_model_config_value_id',
    'model_config_value_id',
    'unit_model',
    'model',
    'model_name'
  ],
  ram_size: [
    'ram_size_config_value_id',
    'ram_config_value_id',
    'ram_size',
    'ram_gb',
    'memory_gb',
    'memory_size'
  ],
  ram_type: [
    'ram_type_config_value_id',
    'ram_type',
    'memory_type'
  ],
  storage_size: [
    'storage_size_config_value_id',
    'ssd_size_config_value_id',
    'storage_size',
    'ssd_size',
    'storage_gb',
    'ssd_gb',
    'drive_size'
  ],
  storage_type: [
    'storage_type_config_value_id',
    'ssd_type_config_value_id',
    'storage_type',
    'ssd_type',
    'drive_type'
  ],
  processor_brand: [
    'processor_brand_config_value_id',
    'processor_brand',
    'cpu_brand_config_value_id',
    'cpu_brand'
  ],
  processor_model: [
    'processor_model_config_value_id',
    'processor_model',
    'cpu_model_config_value_id',
    'cpu_model',
    'processor',
    'cpu'
  ],
  touchscreen: [
    'touchscreen_config_value_id',
    'touchscreen',
    'is_touchscreen',
    'has_touchscreen'
  ]
};

const UNIT_IDENTIFIER_COLUMNS = [
  'bwt_asset_tag',
  'asset_tag',
  'unit_asset_tag',
  'serial_number',
  'unit_serial_number',
  'bios_serial_number',
  'name',
  'unit_name'
];

async function getColumnSet(tableName) {
  const allowedTables = ['units', 'config_values'];

  if (!allowedTables.includes(tableName)) {
    throw new Error(`Unsupported table for validation column inspection: ${tableName}`);
  }

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.columnName));
}

function hasColumn(columns, columnName) {
  return columns.has(columnName);
}

function pickColumn(columns, candidates) {
  return candidates.find((columnName) => columns.has(columnName)) || null;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9.]+/g, '');
}

function parseNumber(value) {
  const match = String(value ?? '').match(/-?\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBooleanLike(value) {
  const normalized = normalizeText(value);

  if (['1', 'true', 'yes', 'y', 'touch', 'touchscreen', 'has touch', 'has touchscreen'].includes(normalized)) {
    return 'yes';
  }

  if (['0', 'false', 'no', 'n', 'non-touch', 'non touch', 'notouch', 'no touch', 'no touchscreen'].includes(normalized)) {
    return 'no';
  }

  if (['any', 'either', 'n/a', 'na', 'not required'].includes(normalized)) {
    return 'any';
  }

  return normalized;
}

function isConfigValueColumn(columnName) {
  return columnName.endsWith('_config_value_id') || columnName === 'config_value_id';
}

async function getConfigValueMap() {
  const configColumns = await getColumnSet('config_values');

  if (!hasColumn(configColumns, 'config_value_id')) {
    return new Map();
  }

  const labelExpression = hasColumn(configColumns, 'label')
    ? 'label'
    : hasColumn(configColumns, 'name')
      ? 'name'
      : 'code';

  const [rows] = await pool.query(`
    SELECT
      config_value_id,
      code,
      ${labelExpression} AS label
    FROM config_values
  `);

  const configValueMap = new Map();

  rows.forEach((row) => {
    configValueMap.set(Number(row.config_value_id), {
      config_value_id: Number(row.config_value_id),
      code: row.code,
      label: row.label || row.code
    });
  });

  return configValueMap;
}

function getDisplayValueFromUnit(unit, columnName, configValueMap) {
  const rawValue = unit[columnName];

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  if (isConfigValueColumn(columnName)) {
    const configValue = configValueMap.get(Number(rawValue));

    if (configValue) {
      return {
        rawValue,
        displayValue: configValue.label || configValue.code,
        comparableValues: [
          configValue.label,
          configValue.code,
          rawValue
        ].filter(Boolean)
      };
    }
  }

  return {
    rawValue,
    displayValue: String(rawValue),
    comparableValues: [rawValue]
  };
}

function getActualRequirementValue(unit, requirementKey, unitColumns, configValueMap) {
  const candidateColumns = UNIT_FIELD_MAPPINGS[requirementKey] || [];

  for (const columnName of candidateColumns) {
    if (!hasColumn(unitColumns, columnName)) {
      continue;
    }

    const value = getDisplayValueFromUnit(unit, columnName, configValueMap);

    if (value) {
      return {
        isSupported: true,
        sourceColumn: columnName,
        rawValue: value.rawValue,
        displayValue: value.displayValue,
        comparableValues: value.comparableValues
      };
    }
  }

  return {
    isSupported: false,
    sourceColumn: null,
    rawValue: null,
    displayValue: null,
    comparableValues: []
  };
}

function compareValues({
  requirementKey,
  operatorCode,
  requiredValue,
  actualValue
}) {
  if (!actualValue.isSupported) {
    return {
      passed: false,
      status: 'needs_review',
      message: 'No matching unit column was found for this requirement.'
    };
  }

  const normalizedOperator = normalizeText(operatorCode || 'equals');
  const requiredText = String(requiredValue ?? '').trim();
  const actualText = String(actualValue.displayValue ?? '').trim();

  if (!requiredText) {
    return {
      passed: false,
      status: 'needs_review',
      message: 'Requirement is missing a required value.'
    };
  }

  if (!actualText) {
    return {
      passed: false,
      status: 'rejected',
      message: 'Unit does not have a value for this requirement.'
    };
  }

  if (requirementKey === 'touchscreen') {
    const requiredBoolean = normalizeBooleanLike(requiredText);
    const actualBoolean = normalizeBooleanLike(actualText);

    if (requiredBoolean === 'any') {
      return {
        passed: true,
        status: 'accepted',
        message: 'Touchscreen can be either yes or no.'
      };
    }

    return {
      passed: requiredBoolean === actualBoolean,
      status: requiredBoolean === actualBoolean ? 'accepted' : 'rejected',
      message: requiredBoolean === actualBoolean
        ? 'Touchscreen requirement matched.'
        : `Expected ${requiredText}, found ${actualText}.`
    };
  }

  const requiredNumber = parseNumber(requiredText);
  const actualNumber = parseNumber(actualText);
  const bothNumeric = requiredNumber !== null && actualNumber !== null;

  if (normalizedOperator === 'minimum' || normalizedOperator === 'min' || normalizedOperator === 'at_least') {
    if (!bothNumeric) {
      return {
        passed: false,
        status: 'needs_review',
        message: 'Minimum comparison needs numeric values.'
      };
    }

    return {
      passed: actualNumber >= requiredNumber,
      status: actualNumber >= requiredNumber ? 'accepted' : 'rejected',
      message: actualNumber >= requiredNumber
        ? 'Minimum requirement matched.'
        : `Expected at least ${requiredText}, found ${actualText}.`
    };
  }

  if (normalizedOperator === 'maximum' || normalizedOperator === 'max' || normalizedOperator === 'at_most') {
    if (!bothNumeric) {
      return {
        passed: false,
        status: 'needs_review',
        message: 'Maximum comparison needs numeric values.'
      };
    }

    return {
      passed: actualNumber <= requiredNumber,
      status: actualNumber <= requiredNumber ? 'accepted' : 'rejected',
      message: actualNumber <= requiredNumber
        ? 'Maximum requirement matched.'
        : `Expected at most ${requiredText}, found ${actualText}.`
    };
  }

  const normalizedRequired = normalizeText(requiredText);
  const normalizedActualValues = actualValue.comparableValues.map(normalizeText);
  const compactRequired = normalizeComparableText(requiredText);
  const compactActualValues = actualValue.comparableValues.map(normalizeComparableText);

  if (normalizedOperator === 'contains') {
    const passed = normalizedActualValues.some((value) => value.includes(normalizedRequired)) ||
      compactActualValues.some((value) => value.includes(compactRequired));

    return {
      passed,
      status: passed ? 'accepted' : 'rejected',
      message: passed
        ? 'Contains requirement matched.'
        : `Expected value to contain ${requiredText}, found ${actualText}.`
    };
  }

  if (normalizedOperator === 'not_equals' || normalizedOperator === 'not equal' || normalizedOperator === 'not') {
    const matched = normalizedActualValues.includes(normalizedRequired) ||
      compactActualValues.includes(compactRequired);

    return {
      passed: !matched,
      status: !matched ? 'accepted' : 'rejected',
      message: !matched
        ? 'Not-equals requirement matched.'
        : `Expected value different from ${requiredText}, found ${actualText}.`
    };
  }

  if (bothNumeric && ['ram_size', 'storage_size'].includes(requirementKey)) {
    return {
      passed: actualNumber === requiredNumber,
      status: actualNumber === requiredNumber ? 'accepted' : 'rejected',
      message: actualNumber === requiredNumber
        ? 'Numeric size requirement matched.'
        : `Expected ${requiredText}, found ${actualText}.`
    };
  }

  const matched = normalizedActualValues.includes(normalizedRequired) ||
    compactActualValues.includes(compactRequired);

  return {
    passed: matched,
    status: matched ? 'accepted' : 'rejected',
    message: matched
      ? 'Requirement matched.'
      : `Expected ${requiredText}, found ${actualText}.`
  };
}

async function listUnitsForLot(lotId, unitColumns) {
  if (!hasColumn(unitColumns, 'lot_id')) {
    return {
      supported: false,
      units: []
    };
  }

  const orderColumn = pickColumn(unitColumns, [
    'created_at',
    'updated_at',
    'unit_id',
    'id'
  ]);

  const orderSql = orderColumn
    ? `ORDER BY \`${orderColumn}\` DESC`
    : '';

  const [units] = await pool.query(
    `
      SELECT *
      FROM units
      WHERE lot_id = ?
      ${orderSql}
      LIMIT ?
    `,
    [lotId, UNIT_LIMIT]
  );

  return {
    supported: true,
    units
  };
}

function getUnitDisplayName(unit, unitColumns, configValueMap) {
  const unitIdColumn = pickColumn(unitColumns, ['unit_id', 'id']);
  const unitId = unitIdColumn ? unit[unitIdColumn] : null;

  for (const columnName of UNIT_IDENTIFIER_COLUMNS) {
    if (!hasColumn(unitColumns, columnName)) {
      continue;
    }

    const value = getDisplayValueFromUnit(unit, columnName, configValueMap);

    if (value && value.displayValue) {
      return {
        unitId,
        label: value.displayValue,
        subLabel: unitId ? `Unit ID ${unitId}` : 'Unit'
      };
    }
  }

  return {
    unitId,
    label: unitId ? `Unit #${unitId}` : 'Unknown Unit',
    subLabel: 'No primary identifier found'
  };
}

function summarizeUnitValidation(checks, requirementCount) {
  if (requirementCount === 0) {
    return 'open';
  }

  if (checks.some((check) => check.status === 'rejected')) {
    return 'rejected';
  }

  if (checks.some((check) => check.status === 'needs_review')) {
    return 'needs_review';
  }

  return 'accepted';
}

function getStatusLabel(status) {
  if (status === 'accepted') {
    return 'Accepted';
  }

  if (status === 'rejected') {
    return 'Rejected';
  }

  if (status === 'needs_review') {
    return 'Needs Review';
  }

  if (status === 'open') {
    return 'Open';
  }

  return 'Unknown';
}

async function buildLotValidationReport(lotId) {
  const unitColumns = await getColumnSet('units');
  const configValueMap = await getConfigValueMap();
  const requirements = await lotModel.listLotRequirements(lotId);
  const activeRequirements = requirements.filter((requirement) => Number(requirement.is_active) === 1);
  const unitsResult = await listUnitsForLot(lotId, unitColumns);

  if (!unitsResult.supported) {
    return {
      supported: false,
      message: 'The units table does not have a lot_id column, so lot validation cannot run yet.',
      requirementCount: activeRequirements.length,
      unitsChecked: 0,
      unitLimit: UNIT_LIMIT,
      acceptedCount: 0,
      rejectedCount: 0,
      needsReviewCount: 0,
      openCount: 0,
      units: []
    };
  }

  const validatedUnits = unitsResult.units.map((unit) => {
    const unitDisplay = getUnitDisplayName(unit, unitColumns, configValueMap);

    const checks = activeRequirements.map((requirement) => {
      const requirementKey = String(requirement.requirement_key || '').trim();
      const actualValue = getActualRequirementValue(unit, requirementKey, unitColumns, configValueMap);

      const comparison = compareValues({
        requirementKey,
        operatorCode: requirement.operator_code || 'equals',
        requiredValue: requirement.required_value,
        actualValue
      });

      return {
        requirementKey,
        operatorCode: requirement.operator_code || 'equals',
        requiredValue: requirement.required_value || '',
        actualValue: actualValue.displayValue || '—',
        sourceColumn: actualValue.sourceColumn || '—',
        passed: comparison.passed,
        status: comparison.status,
        statusLabel: getStatusLabel(comparison.status),
        message: comparison.message
      };
    });

    const status = summarizeUnitValidation(checks, activeRequirements.length);

    return {
      unitId: unitDisplay.unitId,
      label: unitDisplay.label,
      subLabel: unitDisplay.subLabel,
      status,
      statusLabel: getStatusLabel(status),
      checks,
      failedChecks: checks.filter((check) => check.status === 'rejected'),
      reviewChecks: checks.filter((check) => check.status === 'needs_review')
    };
  });

  return {
    supported: true,
    message: activeRequirements.length === 0
      ? 'This lot has no active requirements. Units are treated as open until requirements are added.'
      : 'Validation preview compares units in this lot against active lot requirements.',
    requirementCount: activeRequirements.length,
    unitsChecked: validatedUnits.length,
    unitLimit: UNIT_LIMIT,
    acceptedCount: validatedUnits.filter((unit) => unit.status === 'accepted').length,
    rejectedCount: validatedUnits.filter((unit) => unit.status === 'rejected').length,
    needsReviewCount: validatedUnits.filter((unit) => unit.status === 'needs_review').length,
    openCount: validatedUnits.filter((unit) => unit.status === 'open').length,
    units: validatedUnits
  };
}

module.exports = {
  buildLotValidationReport
};