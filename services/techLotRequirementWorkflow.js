'use strict';

const { evaluateUnitSnapshot } = require('./lotRequirementEvaluator');
const { applyManagementAcceptance } = require('./lotValidationOverridePolicy');

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
  ram_gb: 'memory_modules',
  ram_type: 'memory_modules',
  storage_gb: 'storage_devices',
  storage_type: 'storage_devices'
});

function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRequirementPolicyCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return POLICY_ALIASES[normalized] || 'strict';
}

function getOptionById(options, value) {
  const safeId = asPositiveInteger(value);

  if (!safeId) {
    return null;
  }

  return (Array.isArray(options) ? options : [])
    .find((option) => Number(option.id) === safeId) || null;
}

function optionLabel(options, value) {
  const option = getOptionById(options, value);
  return option ? String(option.shortLabel || option.label || option.code || '').trim() : '';
}

function createCatalogActual({ ids = [], labels = [], sourceLabel }) {
  const normalizedIds = [...new Set(ids.map(asPositiveInteger).filter(Boolean))];
  const normalizedLabels = [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))];

  return {
    kind: 'catalog',
    isSupported: true,
    ids: normalizedIds,
    numberValue: null,
    displayValue: normalizedLabels.join(', '),
    sourceLabel: sourceLabel || 'Current Unit form'
  };
}

function createNumberActual({ value, sourceLabel, suffix = '' }) {
  const numericValue = asFiniteNumber(value);

  return {
    kind: 'number',
    isSupported: true,
    ids: [],
    numberValue: numericValue,
    displayValue: numericValue === null ? '' : `${numericValue}${suffix}`,
    sourceLabel: sourceLabel || 'Current Unit form'
  };
}

function meaningfulRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
}

function buildMemoryActual(formData, formOptions) {
  const rows = meaningfulRows(formData.memoryModules)
    .filter((row) => asFiniteNumber(row.sizeGb) > 0);

  if (rows.length > 0) {
    return {
      total: createNumberActual({
        value: rows.reduce((sum, row) => sum + Number(row.sizeGb), 0),
        sourceLabel: 'Current memory rows',
        suffix: ' GB'
      }),
      type: createCatalogActual({
        ids: rows.map((row) => row.ramTypeConfigValueId),
        labels: rows.map((row) => optionLabel(formOptions.ramTypes, row.ramTypeConfigValueId)),
        sourceLabel: 'Current memory rows'
      })
    };
  }

  return {
    total: createNumberActual({
      value: formData.ramGb,
      sourceLabel: 'Current memory total',
      suffix: ' GB'
    }),
    type: createCatalogActual({
      ids: [formData.ramTypeConfigValueId],
      labels: [optionLabel(formOptions.ramTypes, formData.ramTypeConfigValueId)],
      sourceLabel: 'Current memory type'
    })
  };
}

function buildStorageActual(formData, formOptions) {
  const rows = meaningfulRows(formData.storageDevices)
    .filter((row) => asFiniteNumber(row.sizeGb) > 0);

  if (rows.length > 0) {
    return {
      total: createNumberActual({
        value: rows.reduce((sum, row) => sum + Number(row.sizeGb), 0),
        sourceLabel: 'Current storage rows',
        suffix: ' GB'
      }),
      type: createCatalogActual({
        ids: rows.map((row) => row.storageTypeConfigValueId),
        labels: rows.map((row) => optionLabel(formOptions.storageTypes, row.storageTypeConfigValueId)),
        sourceLabel: 'Current storage rows'
      })
    };
  }

  return {
    total: createNumberActual({
      value: formData.storageGb,
      sourceLabel: 'Current storage total',
      suffix: ' GB'
    }),
    type: createCatalogActual({
      ids: [formData.storageTypeConfigValueId],
      labels: [optionLabel(formOptions.storageTypes, formData.storageTypeConfigValueId)],
      sourceLabel: 'Current storage type'
    })
  };
}

function buildSubmittedUnitSnapshot({ formData = {}, formOptions = {}, unitId = null, lotId = null } = {}) {
  const memory = buildMemoryActual(formData, formOptions);
  const storage = buildStorageActual(formData, formOptions);
  const safeUnitId = asPositiveInteger(unitId);

  return {
    unitId: safeUnitId,
    lotId: asPositiveInteger(lotId || formData.lotId),
    label: String(formData.assetTag || '').trim() || (safeUnitId ? `Unit #${safeUnitId}` : 'Unsaved Unit'),
    subLabel: 'Current Unit form values',
    assetTag: String(formData.assetTag || '').trim(),
    unitSerial: String(formData.unitSerialNumber || '').trim(),
    biosSerial: String(formData.biosSerialNumber || '').trim(),
    technicians: [],
    technicianSummary: '',
    lotAssignmentSignature: '',
    valuesByKey: {
      unit_type: createCatalogActual({
        ids: [formData.unitCategoryConfigValueId],
        labels: [optionLabel(formOptions.unitCategories, formData.unitCategoryConfigValueId)],
        sourceLabel: 'Unit Category field'
      }),
      manufacturer: createCatalogActual({
        ids: [formData.manufacturerId],
        labels: [optionLabel(formOptions.manufacturers, formData.manufacturerId)],
        sourceLabel: 'Manufacturer field'
      }),
      model: createCatalogActual({
        ids: [formData.unitModelId],
        labels: [optionLabel(formOptions.unitModels, formData.unitModelId)],
        sourceLabel: 'Unit Model field'
      }),
      processor: createCatalogActual({
        ids: [formData.processorModelId],
        labels: [optionLabel(formOptions.processorModels, formData.processorModelId)],
        sourceLabel: 'Processor field'
      }),
      ram_gb: memory.total,
      ram_type: memory.type,
      storage_gb: storage.total,
      storage_type: storage.type
    }
  };
}

function getPolicyLabel(code, configuredLabel = '') {
  if (configuredLabel) {
    return String(configuredLabel);
  }

  if (code === 'warn_only') return 'Warn Only';
  if (code === 'open_mixed') return 'Open / Mixed';
  return 'Strict';
}

function buildWorkflowDecision({ technicalResult, activeOverride = null, lot = null } = {}) {
  const resultWithAcceptance = applyManagementAcceptance(technicalResult, activeOverride);
  const policyCode = normalizeRequirementPolicyCode(lot?.requirement_policy_code);
  const policyLabel = getPolicyLabel(policyCode, lot?.requirement_policy_label);
  const technicalFailure = ['rejected', 'needs_review'].includes(resultWithAcceptance.technicalStatus);
  const managementAccepted = resultWithAcceptance.status === 'accepted_override';
  const strictBlocked = policyCode === 'strict' && technicalFailure && !managementAccepted;
  const saveAllowed = !strictBlocked;
  let statusLabel = resultWithAcceptance.statusLabel;
  const issueChecks = [
    ...(Array.isArray(resultWithAcceptance.failedChecks) ? resultWithAcceptance.failedChecks : []),
    ...(Array.isArray(resultWithAcceptance.reviewChecks) ? resultWithAcceptance.reviewChecks : [])
  ];
  const blockingFieldKeys = [...new Set(issueChecks
    .map((check) => REQUIREMENT_FIELD_BINDINGS[check.requirementKey] || '')
    .filter(Boolean))];

  let headline = 'Lot requirements met';
  let message = 'The current Unit form values meet the selected Lot requirements.';
  let tone = 'success';

  if (resultWithAcceptance.status === 'open') {
    headline = 'No active Lot requirements';
    message = 'This Lot currently accepts Units without technical requirement checks.';
    tone = 'neutral';
  } else if (managementAccepted) {
    headline = 'Accepted by Management';
    message = 'A current Management acceptance allows this Unit to remain in the selected Lot.';
    tone = 'override';
  } else if (technicalFailure && policyCode === 'warn_only') {
    statusLabel = 'Allowed with Warning';
    headline = 'Lot requirement warning';
    message = 'The Unit does not meet every requirement, but this Lot is configured to allow saving with a warning.';
    tone = 'warning';
  } else if (technicalFailure && policyCode === 'open_mixed') {
    statusLabel = 'Allowed in Mixed Lot';
    headline = 'Mixed Lot — review suggested';
    message = 'The Unit does not meet every listed requirement, but this Lot allows mixed Units.';
    tone = 'neutral';
  } else if (resultWithAcceptance.technicalStatus === 'needs_review') {
    headline = 'Lot requirements need Management review';
    message = 'One or more Lot requirements cannot be evaluated reliably. Saving is blocked for a Strict Lot.';
    tone = 'error';
  } else if (resultWithAcceptance.technicalStatus === 'rejected') {
    headline = 'Unit does not meet Lot requirements';
    message = 'Correct the highlighted Unit values or choose another Lot before saving.';
    tone = 'error';
  }

  return {
    ...resultWithAcceptance,
    policyCode,
    policyLabel,
    statusLabel,
    saveAllowed,
    strictBlocked,
    technicalFailure,
    managementAccepted,
    issueChecks,
    issueCount: issueChecks.length,
    blockingFieldKeys,
    headline,
    message,
    tone
  };
}

function buildTechLotRequirementWorkflow({
  lot,
  requirements = [],
  formData = {},
  formOptions = {},
  unitId = null,
  activeOverride = null
} = {}) {
  if (!lot || !asPositiveInteger(lot.lot_id)) {
    return null;
  }

  const activeRequirements = (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => Number(requirement.is_active) === 1);
  const snapshot = buildSubmittedUnitSnapshot({
    formData,
    formOptions,
    unitId,
    lotId: lot.lot_id
  });
  const technicalResult = evaluateUnitSnapshot(snapshot, activeRequirements);
  const decision = buildWorkflowDecision({ technicalResult, activeOverride, lot });

  return {
    ...decision,
    lotId: Number(lot.lot_id),
    lotName: String(lot.lot_name || lot.name || `Lot ${lot.lot_id}`),
    requirementCount: activeRequirements.length
  };
}

function getBlockingMessage(workflow) {
  if (!workflow || workflow.saveAllowed) {
    return '';
  }

  if (workflow.technicalStatus === 'needs_review') {
    return 'The selected Lot has a requirement that needs Management review. This Unit cannot be saved to the Strict Lot until the requirement is corrected or Management accepts the existing Unit from Lot Details.';
  }

  return 'This Unit does not meet the selected Strict Lot requirements. Correct the highlighted values or choose another Lot before saving.';
}

module.exports = {
  REQUIREMENT_FIELD_BINDINGS,
  buildSubmittedUnitSnapshot,
  buildTechLotRequirementWorkflow,
  buildWorkflowDecision,
  getBlockingMessage,
  normalizeRequirementPolicyCode
};
