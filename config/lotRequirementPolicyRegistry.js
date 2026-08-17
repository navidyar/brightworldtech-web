'use strict';

const { POLICY_KEY_BY_SYSTEM_VALUE_ID } = require('./configIdentityRegistry');

const POLICY_DEFINITIONS = Object.freeze({
  strict: Object.freeze({
    code: 'strict',
    label: 'Strict',
    description: 'Blocks a Unit when required information is missing or an active Lot requirement is not met.'
  }),
  warn_only: Object.freeze({
    code: 'warn_only',
    label: 'Warn Only',
    description: 'Shows requirement problems but allows the Unit to be saved or moved into the Lot.'
  }),
  open_mixed: Object.freeze({
    code: 'open_mixed',
    label: 'Open / Mixed',
    description: 'Allows mixed Units. Active requirements remain visible for information and review.'
  })
});

const POLICY_ALIASES = Object.freeze({
  strict: 'strict',
  required: 'strict',
  enforced: 'strict',
  validate: 'strict',
  warn: 'warn_only',
  warning: 'warn_only',
  warn_only: 'warn_only',
  open: 'open_mixed',
  mixed: 'open_mixed',
  flexible: 'open_mixed',
  no_requirements: 'open_mixed',
  none: 'open_mixed',
  not_strict: 'open_mixed',
  open_mixed: 'open_mixed'
});

function normalizePolicyCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return POLICY_ALIASES[normalized] || '';
}

function listPolicyDefinitions() {
  return Object.values(POLICY_DEFINITIONS);
}

function buildRequirementPolicyOptions(rows) {
  const seenCodes = new Set();
  const optionsByCode = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row.is_active ?? 1) !== 1) {
      continue;
    }

    const code = POLICY_KEY_BY_SYSTEM_VALUE_ID[Number(row.system_config_value_id || row.systemConfigValueId || 0)] || normalizePolicyCode(row.code);
    const definition = POLICY_DEFINITIONS[code];
    const configValueId = Number(row.config_value_id);

    if (!definition || !Number.isInteger(configValueId) || configValueId <= 0 || seenCodes.has(code)) {
      continue;
    }

    seenCodes.add(code);
    optionsByCode.set(code, Object.freeze({
      config_value_id: configValueId,
      code,
      label: definition.label,
      description: definition.description,
      sort_order: Number(row.sort_order || 0)
    }));
  }

  return listPolicyDefinitions()
    .map((definition) => optionsByCode.get(definition.code))
    .filter(Boolean);
}

function getDefaultRequirementPolicyId(options) {
  return Number((Array.isArray(options) ? options : [])
    .find((option) => option.code === 'strict')?.config_value_id || 0) || null;
}

function findSelectedRequirementPolicy(options, selectedId) {
  const normalizedId = Number(selectedId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return (Array.isArray(options) ? options : [])
    .find((option) => Number(option.config_value_id) === normalizedId) || null;
}

function validateRequirementPolicyRegistry() {
  const errors = [];
  const definitions = listPolicyDefinitions();

  if (definitions.length !== 3) {
    errors.push('Exactly three requirement enforcement policies are required.');
  }

  for (const definition of definitions) {
    if (!definition.code || !definition.label || !definition.description) {
      errors.push(`Requirement policy ${definition.code || '(missing code)'} is incomplete.`);
    }
  }

  return errors;
}

module.exports = {
  POLICY_DEFINITIONS,
  buildRequirementPolicyOptions,
  findSelectedRequirementPolicy,
  getDefaultRequirementPolicyId,
  listPolicyDefinitions,
  normalizePolicyCode,
  validateRequirementPolicyRegistry
};
