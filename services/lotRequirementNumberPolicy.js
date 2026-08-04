'use strict';

function analyzeRequirementNumber(field, value) {
  const normalized = String(value == null ? '' : value).trim();
  const label = field && field.label ? field.label : 'Required value';

  if (!normalized) {
    return { valid: false, numericValue: null, message: 'Required value is required.' };
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return { valid: false, numericValue: null, message: `${label} must be a valid number.` };
  }

  const numericValue = Number(normalized);
  const minimum = field && Number.isFinite(Number(field.minimumValue)) ? Number(field.minimumValue) : 0.01;
  const maximum = field && field.maximumValue !== null && field.maximumValue !== undefined
    ? Number(field.maximumValue)
    : null;
  const decimalPlaces = field && Number.isInteger(field.decimalPlaces) ? field.decimalPlaces : 2;
  const suppliedDecimalPlaces = normalized.includes('.') ? normalized.split('.')[1].length : 0;

  if (!Number.isFinite(numericValue) || numericValue < minimum) {
    return {
      valid: false,
      numericValue: null,
      message: minimum === 0
        ? `${label} must be zero or higher.`
        : `${label} must be ${minimum} or higher.`
    };
  }

  if (maximum !== null && numericValue > maximum) {
    return { valid: false, numericValue: null, message: `${label} must be ${maximum} or lower.` };
  }

  if (suppliedDecimalPlaces > decimalPlaces) {
    return {
      valid: false,
      numericValue: null,
      message: `${label} may use no more than ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'}.`
    };
  }

  return { valid: true, numericValue, message: '' };
}

module.exports = { analyzeRequirementNumber };
