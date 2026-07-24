'use strict';

const LOT_REQUIREMENT_FIELDS = Object.freeze([
  Object.freeze({
    key: 'unit_type',
    label: 'Unit Type',
    helpText: 'Laptop, Desktop, MacBook, or another configured Unit Category.',
    storageKind: 'config_value',
    optionSource: 'unit_type',
    allowedOperators: Object.freeze(['equals'])
  }),
  Object.freeze({
    key: 'manufacturer',
    label: 'Manufacturer',
    helpText: 'A configured manufacturer such as Dell, HP, Lenovo, or Apple.',
    storageKind: 'manufacturer',
    optionSource: 'manufacturer',
    allowedOperators: Object.freeze(['equals'])
  }),
  Object.freeze({
    key: 'model',
    label: 'Model',
    helpText: 'A configured Unit Model. The option includes its manufacturer for clarity.',
    storageKind: 'unit_model',
    optionSource: 'model',
    allowedOperators: Object.freeze(['equals'])
  }),
  Object.freeze({
    key: 'processor',
    label: 'Processor',
    helpText: 'A configured processor model.',
    storageKind: 'processor_model',
    optionSource: 'processor',
    allowedOperators: Object.freeze(['equals'])
  }),
  Object.freeze({
    key: 'ram_gb',
    label: 'Memory Size',
    helpText: 'Total current memory in GB.',
    storageKind: 'number',
    optionSource: null,
    allowedOperators: Object.freeze(['equals', 'greater_equal', 'less_equal'])
  }),
  Object.freeze({
    key: 'ram_type',
    label: 'Memory Type',
    helpText: 'A configured RAM type such as DDR4, DDR5, or LPDDR4X.',
    storageKind: 'config_value',
    optionSource: 'ram_type',
    allowedOperators: Object.freeze(['equals'])
  }),
  Object.freeze({
    key: 'storage_gb',
    label: 'Storage Size',
    helpText: 'Total current storage in GB.',
    storageKind: 'number',
    optionSource: null,
    allowedOperators: Object.freeze(['equals', 'greater_equal', 'less_equal'])
  }),
  Object.freeze({
    key: 'storage_type',
    label: 'Storage Type',
    helpText: 'A configured storage type such as SATA, NVMe, or eMMC.',
    storageKind: 'config_value',
    optionSource: 'storage_type',
    allowedOperators: Object.freeze(['equals'])
  })
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
  return LOT_REQUIREMENT_FIELDS.map((field) => ({ ...field }));
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
