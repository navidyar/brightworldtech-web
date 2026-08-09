'use strict';

const EQUALS = Object.freeze(['equals']);
const NUMERIC = Object.freeze(['equals', 'greater_equal', 'less_equal']);

function catalogField(key, label, helpText, storageKind, optionSource) {
  return Object.freeze({
    key,
    label,
    helpText,
    storageKind,
    optionSource,
    allowedOperators: EQUALS,
    selectable: true
  });
}

function textField(key, label, helpText, extra = {}) {
  return Object.freeze({
    key,
    label,
    helpText,
    storageKind: 'text',
    optionSource: null,
    maximumLength: 120,
    allowedOperators: EQUALS,
    selectable: true,
    ...extra
  });
}

function numericField(key, label, helpText, {
  unitSuffix = '',
  minimumValue = 0,
  maximumValue = null,
  decimalPlaces = 2,
  exampleValue = ''
} = {}) {
  return Object.freeze({
    key,
    label,
    helpText,
    storageKind: 'number',
    optionSource: null,
    unitSuffix,
    minimumValue,
    maximumValue,
    decimalPlaces,
    exampleValue,
    allowedOperators: NUMERIC,
    selectable: true
  });
}

const LOT_REQUIREMENT_FIELDS = Object.freeze([
  // Serial identifiers remain recognized for legacy stored requirements, but they are
  // intentionally unavailable for new Lot rules because each value must be unique.
  textField('unit_serial_number', 'Unit Serial Number', 'Legacy exact Unit Serial Number rule.', { selectable: false }),
  textField('bios_serial_number', 'BIOS Serial Number', 'Legacy exact BIOS Serial Number rule.', { selectable: false }),
  catalogField('unit_type', 'Unit Type', 'Laptop, Desktop, MacBook, or another configured Unit Category.', 'config_value', 'unit_type'),
  catalogField('manufacturer', 'Manufacturer', 'A configured manufacturer such as Dell, HP, Lenovo, or Apple.', 'manufacturer', 'manufacturer'),
  catalogField('model', 'Model', 'A configured Unit Model. The option includes its manufacturer for clarity.', 'unit_model', 'model'),
  catalogField('processor', 'Processor', 'A configured processor model.', 'processor_model', 'processor'),
  catalogField('processor_family', 'Processor Family', 'Any processor explicitly included in a reusable processor family.', 'processor_family', 'processor_family'),
  numericField('processor_speed_ghz', 'Processor Speed', 'Recorded processor speed in GHz.', {
    unitSuffix: ' GHz',
    minimumValue: 0,
    maximumValue: null,
    decimalPlaces: 2,
    exampleValue: '2.40'
  }),
  numericField('ram_gb', 'Current Memory Size', 'Total current memory in GB.', {
    unitSuffix: ' GB',
    minimumValue: 0,
    maximumValue: null,
    decimalPlaces: 2,
    exampleValue: '16'
  }),
  catalogField('ram_type', 'Memory Type', 'A configured RAM type such as DDR4, DDR5, or LPDDR4X.', 'config_value', 'ram_type'),
  catalogField('memory_install_type', 'Memory Install Type', 'A current memory module install type such as removable or integrated.', 'text_option', 'memory_install_type'),
  numericField('storage_gb', 'Current Storage Size', 'Total current storage in GB.', {
    unitSuffix: ' GB',
    minimumValue: 0,
    maximumValue: null,
    decimalPlaces: 2,
    exampleValue: '512'
  }),
  catalogField('storage_type', 'Storage Type', 'A configured storage type such as SATA, NVMe, or eMMC.', 'config_value', 'storage_type'),
  catalogField('storage_wipe_status', 'Storage Wipe Status', 'A wipe status recorded on at least one current storage device.', 'config_value', 'storage_wipe_status'),
  catalogField('operating_system', 'Operating System', 'A configured operating system.', 'config_value', 'operating_system'),
  textField('os_build', 'OS Build', 'Exact OS build text.'),
  textField('bios_version', 'BIOS Version', 'Exact BIOS version text.'),
  numericField('battery_health', 'Battery Health', 'Recorded battery health percentage from 0 through 100.', {
    unitSuffix: '%',
    minimumValue: 0,
    maximumValue: 100,
    decimalPlaces: 1,
    exampleValue: '87.5'
  }),
  catalogField('absolute_status', 'Absolute Status', 'A configured Absolute status.', 'config_value', 'absolute_status'),
  catalogField('physical_camera_status', 'Physical Camera', 'A configured physical camera status.', 'config_value', 'physical_camera_status'),
  catalogField('touchscreen_status', 'Touchscreen', 'A configured touchscreen status.', 'config_value', 'touchscreen_status'),
  catalogField('keyboard_language', 'Keyboard Language', 'A configured keyboard language.', 'config_value', 'keyboard_language'),
  catalogField('complete_diagnostics', 'Complete Diagnostics', 'A configured diagnostics status.', 'config_value', 'complete_diagnostics'),
  catalogField('virus_check', 'Virus Check', 'A configured virus-check status.', 'config_value', 'virus_check'),
  catalogField('driver_check', 'Driver Check', 'A configured driver-check status.', 'config_value', 'driver_check'),
  catalogField('skinned_status', 'Skinned', 'A configured skinned status.', 'config_value', 'skinned_status'),
  catalogField('overall_grade', 'Cosmetic Grade', 'A configured current cosmetic grade.', 'config_value', 'overall_grade'),
  catalogField('unit_outcome', 'Unit Outcome', 'The current Pass or Fail outcome.', 'text_option', 'unit_outcome')
]);

const LOT_REQUIREMENT_OPERATORS = Object.freeze([
  Object.freeze({ key: 'equals', label: 'Must equal' }),
  Object.freeze({ key: 'greater_equal', label: 'Minimum' }),
  Object.freeze({ key: 'less_equal', label: 'Maximum' })
]);

const FIELD_ALIASES = Object.freeze({
  ram_size: 'ram_gb',
  storage_size: 'storage_gb',
  processor_model: 'processor'
});

const OPERATOR_ALIASES = Object.freeze({
  minimum: 'greater_equal',
  maximum: 'less_equal'
});

const fieldsByKey = new Map(LOT_REQUIREMENT_FIELDS.map((field) => [field.key, field]));
const operatorsByKey = new Map(LOT_REQUIREMENT_OPERATORS.map((operator) => [operator.key, operator]));

function normalizeRequirementKey(value) {
  const key = String(value || '').trim();
  return FIELD_ALIASES[key] || key;
}

function normalizeOperatorCode(value) {
  const code = String(value || 'equals').trim();
  return OPERATOR_ALIASES[code] || code;
}

function getLotRequirementField(value) {
  return fieldsByKey.get(normalizeRequirementKey(value)) || null;
}

function getLotRequirementOperator(value) {
  return operatorsByKey.get(normalizeOperatorCode(value)) || null;
}

function listLotRequirementFields() {
  return LOT_REQUIREMENT_FIELDS
    .filter((field) => field.selectable !== false)
    .map((field) => ({ ...field }));
}

function listLotRequirementOperators() {
  return LOT_REQUIREMENT_OPERATORS.map((operator) => ({ ...operator }));
}

function isOperatorAllowedForField(requirementKey, operatorCode) {
  const field = getLotRequirementField(requirementKey);
  const normalizedOperator = normalizeOperatorCode(operatorCode);

  return Boolean(field && field.allowedOperators.includes(normalizedOperator));
}

function validateLotRequirementRegistry() {
  const errors = [];
  const seenFieldKeys = new Set();
  const seenOperatorKeys = new Set();

  LOT_REQUIREMENT_OPERATORS.forEach((operator) => {
    if (!operator.key || seenOperatorKeys.has(operator.key)) {
      errors.push(`Duplicate or missing operator key: ${operator.key || '(blank)'}`);
    }
    seenOperatorKeys.add(operator.key);
  });

  LOT_REQUIREMENT_FIELDS.forEach((field) => {
    if (!field.key || seenFieldKeys.has(field.key)) {
      errors.push(`Duplicate or missing field key: ${field.key || '(blank)'}`);
    }
    seenFieldKeys.add(field.key);

    if (!field.label || !field.storageKind) {
      errors.push(`Field ${field.key || '(blank)'} is missing label or storageKind.`);
    }

    if (!Array.isArray(field.allowedOperators) || field.allowedOperators.length === 0) {
      errors.push(`Field ${field.key || '(blank)'} has no allowed operators.`);
    } else {
      field.allowedOperators.forEach((operatorCode) => {
        if (!operatorsByKey.has(operatorCode)) {
          errors.push(`Field ${field.key} references unknown operator ${operatorCode}.`);
        }
      });
    }
  });

  return errors;
}

module.exports = {
  LOT_REQUIREMENT_FIELDS,
  LOT_REQUIREMENT_OPERATORS,
  getLotRequirementField,
  getLotRequirementOperator,
  isOperatorAllowedForField,
  listLotRequirementFields,
  listLotRequirementOperators,
  normalizeOperatorCode,
  normalizeRequirementKey,
  validateLotRequirementRegistry
};
