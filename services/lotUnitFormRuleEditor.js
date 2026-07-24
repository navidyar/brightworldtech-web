'use strict';

const {
  REQUIREMENT,
  VISIBILITY,
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');

const VALID_VISIBILITY_MODES = new Set(Object.values(VISIBILITY));
const VALID_REQUIREMENT_MODES = new Set(Object.values(REQUIREMENT));

class LotUnitFormRuleEditorError extends Error {
  constructor(messages) {
    const normalizedMessages = Array.isArray(messages) ? messages : [messages];
    super(normalizedMessages[0] || 'The Unit form configuration is invalid.');
    this.name = 'LotUnitFormRuleEditorError';
    this.messages = normalizedMessages.filter(Boolean).map(String);
  }
}

function normalizeModeMap(value, label) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new LotUnitFormRuleEditorError(`${label} settings must be submitted as field-keyed values.`);
  }

  return value;
}

function findUnknownKeys(modeMap) {
  return Object.keys(modeMap).filter((fieldKey) => {
    const field = getUnitFormFieldDefinition(fieldKey);
    return !field || !field.enabledForLotRules;
  });
}

function normalizeSubmittedLotFormRules({ visibilityModes, requirementModes } = {}) {
  const normalizedVisibilityModes = normalizeModeMap(visibilityModes, 'Visibility');
  const normalizedRequirementModes = normalizeModeMap(requirementModes, 'Requirement');
  const unknownKeys = [
    ...new Set([
      ...findUnknownKeys(normalizedVisibilityModes),
      ...findUnknownKeys(normalizedRequirementModes)
    ])
  ];

  if (unknownKeys.length > 0) {
    throw new LotUnitFormRuleEditorError(
      unknownKeys.map((fieldKey) => `Field ${fieldKey} is unknown or protected and cannot be configured by a Lot.`)
    );
  }

  const errors = [];
  const rules = [];

  for (const field of listLotConfigurableUnitFormFields()) {
    const visibilityMode = String(
      normalizedVisibilityModes[field.key] ?? VISIBILITY.INHERIT
    ).trim();
    const requirementMode = String(
      normalizedRequirementModes[field.key] ?? REQUIREMENT.INHERIT
    ).trim();

    if (!VALID_VISIBILITY_MODES.has(visibilityMode)) {
      errors.push(`${field.label} has an invalid visibility setting.`);
      continue;
    }

    if (!VALID_REQUIREMENT_MODES.has(requirementMode)) {
      errors.push(`${field.label} has an invalid requirement setting.`);
      continue;
    }

    if (visibilityMode !== VISIBILITY.INHERIT && !field.visibilityConfigurable) {
      errors.push(`${field.label} does not support visibility overrides.`);
    }

    if (requirementMode !== REQUIREMENT.INHERIT && !field.requirementConfigurable) {
      errors.push(`${field.label} does not support requirement overrides.`);
    }

    if (visibilityMode === VISIBILITY.HIDDEN && requirementMode === REQUIREMENT.REQUIRED) {
      errors.push(`${field.label} cannot be directly configured as Hidden and Required.`);
    }

    if (visibilityMode === VISIBILITY.INHERIT && requirementMode === REQUIREMENT.INHERIT) {
      continue;
    }

    rules.push(Object.freeze({
      fieldKey: field.key,
      visibilityMode,
      requirementMode
    }));
  }

  if (errors.length > 0) {
    throw new LotUnitFormRuleEditorError(errors);
  }

  return Object.freeze(rules);
}

function rulesToSelectionMaps(rules = []) {
  const visibilityModes = {};
  const requirementModes = {};

  for (const rule of rules) {
    const fieldKey = String(rule.fieldKey ?? rule.field_key ?? '').trim();

    if (!fieldKey) {
      continue;
    }

    visibilityModes[fieldKey] = String(
      rule.visibilityMode ?? rule.visibility_mode ?? VISIBILITY.INHERIT
    );
    requirementModes[fieldKey] = String(
      rule.requirementMode ?? rule.requirement_mode ?? REQUIREMENT.INHERIT
    );
  }

  return { visibilityModes, requirementModes };
}

module.exports = {
  LotUnitFormRuleEditorError,
  normalizeSubmittedLotFormRules,
  rulesToSelectionMaps
};
