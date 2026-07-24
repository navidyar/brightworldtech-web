'use strict';

const { getLotRequirementField } = require('../config/lotRequirementRegistry');

const VALUE_COLUMN_NAMES = Object.freeze([
  'requirement_config_value_id',
  'manufacturer_id',
  'unit_model_id',
  'processor_model_id',
  'requirement_text',
  'requirement_number'
]);

function parseTypedIdentifier(value, expectedPrefix) {
  const match = String(value || '').trim().match(/^([a-z_]+):(\d+)$/);

  if (!match || match[1] !== expectedPrefix) {
    return null;
  }

  const parsed = Number(match[2]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildRequirementValuePayload(requirementKey, requiredValue) {
  const field = getLotRequirementField(requirementKey);

  if (!field) {
    throw new Error('Unknown lot requirement field.');
  }

  const payload = Object.fromEntries(VALUE_COLUMN_NAMES.map((columnName) => [columnName, null]));
  const normalizedValue = String(requiredValue || '').trim();

  if (!normalizedValue) {
    throw new Error('Required value is required.');
  }

  if (field.storageKind === 'number') {
    const numericValue = Number(normalizedValue);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new Error(`${field.label} must be a number greater than zero.`);
    }

    payload.requirement_number = numericValue;
    return payload;
  }

  const prefixByStorageKind = {
    config_value: 'config_value',
    manufacturer: 'manufacturer',
    unit_model: 'unit_model',
    processor_model: 'processor_model'
  };
  const columnByStorageKind = {
    config_value: 'requirement_config_value_id',
    manufacturer: 'manufacturer_id',
    unit_model: 'unit_model_id',
    processor_model: 'processor_model_id'
  };
  const expectedPrefix = prefixByStorageKind[field.storageKind];
  const targetColumn = columnByStorageKind[field.storageKind];
  const selectedId = parseTypedIdentifier(normalizedValue, expectedPrefix);

  if (!expectedPrefix || !targetColumn || !selectedId) {
    throw new Error(`Select a valid ${field.label} value.`);
  }

  payload[targetColumn] = selectedId;
  return payload;
}

function getRequirementValueToken(row) {
  if (row.requirement_config_value_id) {
    return `config_value:${row.requirement_config_value_id}`;
  }
  if (row.manufacturer_id) {
    return `manufacturer:${row.manufacturer_id}`;
  }
  if (row.unit_model_id) {
    return `unit_model:${row.unit_model_id}`;
  }
  if (row.processor_model_id) {
    return `processor_model:${row.processor_model_id}`;
  }
  if (row.requirement_number !== null && row.requirement_number !== undefined) {
    return String(Number(row.requirement_number));
  }
  return String(row.requirement_text || '').trim();
}

module.exports = {
  VALUE_COLUMN_NAMES,
  buildRequirementValuePayload,
  getRequirementValueToken,
  parseTypedIdentifier
};
