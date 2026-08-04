'use strict';

const { normalizeRequirementKey } = require('./lotRequirementRegistry');

const POLICY_ALIASES = Object.freeze({
  strict: 'strict',
  required: 'strict',
  enforced: 'strict',
  validate: 'strict',
  warn_only: 'warn_only',
  warning: 'warn_only',
  warn: 'warn_only',
  open_mixed: 'open_mixed',
  open: 'open_mixed',
  mixed: 'open_mixed',
  flexible: 'open_mixed',
  none: 'open_mixed',
  no_requirements: 'open_mixed'
});

const REQUIREMENT_FIELD_BINDINGS = Object.freeze({
  unit_type: 'unit_category',
  manufacturer: 'manufacturer',
  model: 'unit_model',
  processor: 'processor_model',
  processor_family: 'processor_model',
  ram_gb: 'memory_modules',
  ram_type: 'memory_modules',
  storage_gb: 'storage_devices',
  storage_type: 'storage_devices',
  battery_health: 'battery_health'
});

function normalizeRequirementPolicyCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return POLICY_ALIASES[normalized] || 'strict';
}

function getRequirementFormFieldKey(requirementKey) {
  return REQUIREMENT_FIELD_BINDINGS[normalizeRequirementKey(requirementKey)] || null;
}

function buildLotRequirementFormConstraints(requirements = [], policyCode = 'strict') {
  const strict = normalizeRequirementPolicyCode(policyCode) === 'strict';
  const constraintsByFieldKey = new Map();

  (Array.isArray(requirements) ? requirements : []).forEach((requirement) => {
    if (!requirement || Number(requirement.is_active) !== 1) {
      return;
    }

    const requirementKey = normalizeRequirementKey(requirement.requirement_key);
    const fieldKey = getRequirementFormFieldKey(requirementKey);

    if (!fieldKey) {
      return;
    }

    if (!constraintsByFieldKey.has(fieldKey)) {
      constraintsByFieldKey.set(fieldKey, {
        fieldKey,
        forceVisible: true,
        forceRequired: strict,
        sources: []
      });
    }

    const constraint = constraintsByFieldKey.get(fieldKey);
    const requirementId = Number(requirement.lot_requirement_id);
    const sourceKey = Number.isSafeInteger(requirementId) && requirementId > 0
      ? `lot_requirement:${requirementId}`
      : `lot_requirement:${requirementKey}`;
    const sourceLabel = String(
      requirement.requirement_label
      || requirement.requirement_key
      || requirementKey
    ).trim();

    if (!constraint.sources.some((source) => source.key === sourceKey)) {
      constraint.sources.push({ key: sourceKey, label: sourceLabel });
    }
  });

  return Object.freeze(
    [...constraintsByFieldKey.values()].map((constraint) => Object.freeze({
      ...constraint,
      sources: Object.freeze(constraint.sources.map((source) => Object.freeze({ ...source })))
    }))
  );
}

module.exports = {
  REQUIREMENT_FIELD_BINDINGS,
  buildLotRequirementFormConstraints,
  getRequirementFormFieldKey,
  normalizeRequirementPolicyCode
};
