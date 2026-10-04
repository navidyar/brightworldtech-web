'use strict';

const TOOL_COMPLETION_REQUIREMENTS = Object.freeze([
  Object.freeze({
    policyKey: 'requireScanToolsBeforeCompletion',
    toolSource: 'scantool',
    label: 'ScanTools'
  }),
  Object.freeze({
    policyKey: 'requireTechToolsBeforeCompletion',
    toolSource: 'techtools',
    label: 'TechTools'
  })
]);

const COMPLETION_OVERRIDE_ROLES = new Set(['admin', 'management', 'tech_lead']);

function normalizeOverrideReason(value, maxLength = 1000) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function canOverrideMissingToolRequirements(roleCodes = [], permissions = null) {
  if (permissions instanceof Set || Array.isArray(permissions)) {
    return new Set(permissions).has('units.tool_requirements.override');
  }
  return (Array.isArray(roleCodes) ? roleCodes : [])
    .some((roleCode) => COMPLETION_OVERRIDE_ROLES.has(String(roleCode || '').trim()));
}

function buildCompletionToolRequirementStatus({
  effectivePolicy = {},
  completedToolSources = [],
  productionCycleKey = null
} = {}) {
  const completed = new Set((Array.isArray(completedToolSources) ? completedToolSources : [])
    .map((source) => String(source || '').trim())
    .filter(Boolean));
  const requirements = TOOL_COMPLETION_REQUIREMENTS
    .filter((definition) => effectivePolicy[definition.policyKey] === true)
    .map((definition) => ({
      tool_source: definition.toolSource,
      label: definition.label,
      completed: completed.has(definition.toolSource)
    }));
  const missing = requirements.filter((requirement) => !requirement.completed);

  return {
    production_cycle_key: String(productionCycleKey || '').trim() || null,
    required: requirements.length > 0,
    satisfied: missing.length === 0,
    requirements,
    missing
  };
}

function evaluateCompletionToolRequirementEnforcement({
  status,
  roleCodes = [],
  permissions = null,
  overrideReason = ''
} = {}) {
  const safeStatus = status || { required: false, satisfied: true, missing: [] };
  const missing = Array.isArray(safeStatus.missing) ? safeStatus.missing : [];
  const reason = normalizeOverrideReason(overrideReason);

  if (missing.length === 0) {
    return {
      allowed: true,
      override_used: false,
      override_reason: '',
      can_override: false,
      code: 'TOOL_REQUIREMENTS_SATISFIED'
    };
  }

  const canOverride = canOverrideMissingToolRequirements(roleCodes, permissions);
  if (!canOverride) {
    return {
      allowed: false,
      override_used: false,
      override_reason: '',
      can_override: false,
      code: 'TOOL_COMPLETION_REQUIREMENT_MISSING'
    };
  }

  if (!reason) {
    return {
      allowed: false,
      override_used: false,
      override_reason: '',
      can_override: true,
      code: 'TOOL_COMPLETION_OVERRIDE_REASON_REQUIRED'
    };
  }

  return {
    allowed: true,
    override_used: true,
    override_reason: reason,
    can_override: true,
    code: 'TOOL_COMPLETION_REQUIREMENT_OVERRIDDEN'
  };
}

function getMissingToolRequirementMessage(status) {
  const missing = Array.isArray(status?.missing) ? status.missing : [];
  if (missing.length === 0) return '';
  const labels = missing.map((item) => item.label || item.tool_source).filter(Boolean);
  if (labels.length === 1) return `${labels[0]} must run during the current production cycle before this Unit can be completed.`;
  return `${labels.join(' and ')} must run during the current production cycle before this Unit can be completed.`;
}

module.exports = {
  TOOL_COMPLETION_REQUIREMENTS,
  normalizeOverrideReason,
  canOverrideMissingToolRequirements,
  buildCompletionToolRequirementStatus,
  evaluateCompletionToolRequirementEnforcement,
  getMissingToolRequirementMessage
};
