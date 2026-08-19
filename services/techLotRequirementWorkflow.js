'use strict';

const { formatHardwareCapacityGb } = require('./hardwareCapacity');

const { evaluateUnitSnapshot } = require('./lotRequirementEvaluator');
const { applyManagementAcceptance } = require('./lotValidationOverridePolicy');
const {
  REQUIREMENT_FIELD_BINDINGS,
  normalizeRequirementPolicyCode
} = require('../config/lotRequirementFormPolicy');

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
  return option ? String(option.shortLabel || option.label || option.name || option.modelName || option.code || '').trim() : '';
}

function getOptionByCode(options, value) {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return null;
  }

  return (Array.isArray(options) ? options : [])
    .find((option) => String(option.code || option.value || '').trim() === normalizedValue) || null;
}

function optionLabelByCode(options, value) {
  const option = getOptionByCode(options, value);
  return option ? String(option.shortLabel || option.label || option.name || option.code || option.value || '').trim() : String(value || '').trim();
}

function normalizeComparableText(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function createTextActual({ values = [], labels = [], sourceLabel }) {
  const rawValues = Array.isArray(values) ? values : [values];
  const normalizedValues = [...new Set(rawValues.map(normalizeComparableText).filter(Boolean))];
  const normalizedLabels = [...new Set((Array.isArray(labels) ? labels : [labels])
    .map((label) => String(label || '').trim())
    .filter(Boolean))];

  return {
    kind: 'text',
    isSupported: true,
    ids: [],
    numberValue: null,
    textValues: normalizedValues,
    displayValue: normalizedLabels.length > 0
      ? normalizedLabels.join(', ')
      : rawValues.map((value) => String(value || '').trim()).filter(Boolean).join(', '),
    sourceLabel: sourceLabel || 'Current Unit form'
  };
}

function createCatalogActual({ ids = [], labels = [], sourceLabel }) {
  const normalizedIds = [...new Set(ids.map(asPositiveInteger).filter(Boolean))];
  const normalizedLabels = [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))];

  return {
    kind: 'catalog',
    isSupported: true,
    ids: normalizedIds,
    numberValue: null,
    textValues: [],
    displayValue: normalizedLabels.join(', '),
    sourceLabel: sourceLabel || 'Current Unit form'
  };
}

function createNumberActual({ value, sourceLabel, suffix = '', formatter = null }) {
  const numericValue = asFiniteNumber(value);

  return {
    kind: 'number',
    isSupported: true,
    ids: [],
    numberValue: numericValue,
    textValues: [],
    displayValue: numericValue === null ? '' : (formatter ? formatter(numericValue) : `${numericValue}${suffix}`),
    sourceLabel: sourceLabel || 'Current Unit form'
  };
}

function meaningfulRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
}

function buildMemoryActual(formData, formOptions) {
  const rows = meaningfulRows(formData.memoryModules)
    .filter((row) => String(row.sizeGb ?? '').trim() !== '' && asFiniteNumber(row.sizeGb) >= 0);

  if (rows.length > 0) {
    const populatedRows = rows.filter((row) => asFiniteNumber(row.sizeGb) > 0);

    return {
      total: createNumberActual({
        value: rows.reduce((sum, row) => sum + Number(row.sizeGb), 0),
        sourceLabel: 'Current memory rows',
        formatter: formatHardwareCapacityGb
      }),
      type: createCatalogActual({
        ids: populatedRows.map((row) => row.ramTypeConfigValueId),
        labels: populatedRows.map((row) => optionLabel(formOptions.ramTypes, row.ramTypeConfigValueId)),
        sourceLabel: 'Current memory rows'
      }),
      installType: createTextActual({
        values: rows.map((row) => row.memoryInstallTypeCode),
        labels: rows.map((row) => optionLabelByCode(formOptions.memoryInstallTypes, row.memoryInstallTypeCode)),
        sourceLabel: 'Current memory rows'
      })
    };
  }

  return {
    total: createNumberActual({
      value: formData.ramGb,
      sourceLabel: 'Current memory total',
      formatter: formatHardwareCapacityGb
    }),
    type: createCatalogActual({
      ids: [formData.ramTypeConfigValueId],
      labels: [optionLabel(formOptions.ramTypes, formData.ramTypeConfigValueId)],
      sourceLabel: 'Current memory type'
    }),
    installType: createTextActual({ values: [], labels: [], sourceLabel: 'Current memory rows' })
  };
}

function buildStorageActual(formData, formOptions) {
  const rows = meaningfulRows(formData.storageDevices)
    .filter((row) => String(row.sizeGb ?? '').trim() !== '' && asFiniteNumber(row.sizeGb) >= 0);

  if (rows.length > 0) {
    const populatedRows = rows.filter((row) => asFiniteNumber(row.sizeGb) > 0);

    return {
      total: createNumberActual({
        value: rows.reduce((sum, row) => sum + Number(row.sizeGb), 0),
        sourceLabel: 'Current storage rows',
        formatter: formatHardwareCapacityGb
      }),
      type: createCatalogActual({
        ids: populatedRows.map((row) => row.storageTypeConfigValueId),
        labels: populatedRows.map((row) => optionLabel(formOptions.storageTypes, row.storageTypeConfigValueId)),
        sourceLabel: 'Current storage rows'
      }),
      wipeStatus: createCatalogActual({
        ids: rows.map((row) => row.wipeStatusConfigValueId),
        labels: rows.map((row) => optionLabel(formOptions.storageWipeStatuses, row.wipeStatusConfigValueId)),
        sourceLabel: 'Current storage rows'
      })
    };
  }

  return {
    total: createNumberActual({
      value: formData.storageGb,
      sourceLabel: 'Current storage total',
      formatter: formatHardwareCapacityGb
    }),
    type: createCatalogActual({
      ids: [formData.storageTypeConfigValueId],
      labels: [optionLabel(formOptions.storageTypes, formData.storageTypeConfigValueId)],
      sourceLabel: 'Current storage type'
    }),
    wipeStatus: createCatalogActual({ ids: [], labels: [], sourceLabel: 'Current storage rows' })
  };
}

function buildSubmittedUnitSnapshot({ formData = {}, formOptions = {}, unitId = null, lotId = null } = {}) {
  const memory = buildMemoryActual(formData, formOptions);
  const storage = buildStorageActual(formData, formOptions);
  const safeUnitId = asPositiveInteger(unitId);
  const selectedProcessor = getOptionById(formOptions.processorModels, formData.processorModelId);

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
      screen_size: createCatalogActual({
        ids: [formData.screenSizeConfigValueId],
        labels: [optionLabel(formOptions.screenSizes, formData.screenSizeConfigValueId)],
        sourceLabel: 'Screen Size field'
      }),
      model_year: createNumberActual({
        value: formData.modelYear,
        sourceLabel: 'Model Year field'
      }),
      processor: createCatalogActual({
        ids: [formData.processorModelId],
        labels: [optionLabel(formOptions.processorModels, formData.processorModelId)],
        sourceLabel: 'Processor field'
      }),
      unit_serial_number: createTextActual({
        values: [formData.unitSerialNumber],
        labels: [formData.unitSerialNumber],
        sourceLabel: 'Unit Serial Number field'
      }),
      bios_serial_number: createTextActual({
        values: [formData.biosSerialNumber],
        labels: [formData.biosSerialNumber],
        sourceLabel: 'BIOS Serial Number field'
      }),
      processor_family: createCatalogActual({
        ids: selectedProcessor?.processorFamilyIds || [],
        labels: selectedProcessor?.processorFamilyLabels || [],
        sourceLabel: 'Processor family membership'
      }),
      processor_speed_ghz: createNumberActual({
        value: formData.processorSpeedGhz,
        sourceLabel: 'Processor Speed field',
        suffix: ' GHz'
      }),
      ram_gb: memory.total,
      ram_type: memory.type,
      memory_install_type: memory.installType,
      storage_gb: storage.total,
      storage_type: storage.type,
      storage_wipe_status: storage.wipeStatus,
      operating_system: createCatalogActual({
        ids: [formData.operatingSystemConfigValueId],
        labels: [optionLabel(formOptions.operatingSystems, formData.operatingSystemConfigValueId)],
        sourceLabel: 'Operating System field'
      }),
      os_build: createTextActual({ values: [formData.osBuild], labels: [formData.osBuild], sourceLabel: 'OS Build field' }),
      bios_version: createTextActual({ values: [formData.biosVersion], labels: [formData.biosVersion], sourceLabel: 'BIOS Version field' }),
      battery_health: createNumberActual({
        value: formData.batteryHealthPercent,
        sourceLabel: 'Battery Health field',
        suffix: '%'
      }),
      absolute_status: createCatalogActual({
        ids: [formData.absoluteStatusConfigValueId],
        labels: [optionLabel(formOptions.absoluteStatusOptions, formData.absoluteStatusConfigValueId)],
        sourceLabel: 'Absolute Status field'
      }),
      physical_camera_status: createCatalogActual({
        ids: [formData.physicalCameraStatusConfigValueId],
        labels: [optionLabel(formOptions.physicalCameraStatusOptions, formData.physicalCameraStatusConfigValueId)],
        sourceLabel: 'Physical Camera field'
      }),
      touchscreen_status: createCatalogActual({
        ids: [formData.touchscreenStatusConfigValueId],
        labels: [optionLabel(formOptions.touchscreenStatusOptions, formData.touchscreenStatusConfigValueId)],
        sourceLabel: 'Touchscreen field'
      }),
      keyboard_language: createCatalogActual({
        ids: [formData.keyboardLanguageConfigValueId],
        labels: [optionLabel(formOptions.keyboardLanguageOptions, formData.keyboardLanguageConfigValueId)],
        sourceLabel: 'Keyboard Language field'
      }),
      complete_diagnostics: createCatalogActual({
        ids: [formData.completeDiagnosticsStatusConfigValueId],
        labels: [optionLabel(formOptions.diagnosticsStatusOptions, formData.completeDiagnosticsStatusConfigValueId)],
        sourceLabel: 'Complete Diagnostics field'
      }),
      virus_check: createCatalogActual({
        ids: [formData.virusCheckStatusConfigValueId],
        labels: [optionLabel(formOptions.virusCheckStatusOptions, formData.virusCheckStatusConfigValueId)],
        sourceLabel: 'Virus Check field'
      }),
      driver_check: createCatalogActual({
        ids: [formData.driverCheckStatusConfigValueId],
        labels: [optionLabel(formOptions.driverCheckStatusOptions, formData.driverCheckStatusConfigValueId)],
        sourceLabel: 'Driver Check field'
      }),
      skinned_status: createCatalogActual({
        ids: [formData.skinnedStatusConfigValueId],
        labels: [optionLabel(formOptions.skinnedStatusOptions, formData.skinnedStatusConfigValueId)],
        sourceLabel: 'Skinned field'
      }),
      overall_grade: createCatalogActual({
        ids: [formData.overallGradeConfigValueId],
        labels: [optionLabel(formOptions.overallGradeOptions, formData.overallGradeConfigValueId)],
        sourceLabel: 'Cosmetic Grade field'
      }),
      unit_outcome: createTextActual({
        values: [formData.outcomeCode],
        labels: [optionLabelByCode(formOptions.outcomeOptions, formData.outcomeCode)],
        sourceLabel: 'Unit Outcome field'
      })
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
