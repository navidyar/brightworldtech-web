'use strict';

const {
  getLotRequirementField,
  normalizeRequirementKey
} = require('../config/lotRequirementRegistry');
const {
  resolveManufacturerCandidate,
  resolveModelCandidate,
  resolveProcessorCandidate,
  resolveOperatingSystemCandidate
} = require('./apiCatalogInventory');

const OBSERVATION_STATES = new Set(['known', 'unknown']);

const FORM_PROPERTY_BY_REQUIREMENT_KEY = Object.freeze({
  unit_type: 'unitCategoryConfigValueId',
  manufacturer: 'manufacturerId',
  model: 'unitModelId',
  screen_size: 'screenSizeConfigValueId',
  model_year: 'modelYear',
  processor: 'processorModelId',
  processor_speed_ghz: 'processorSpeedGhz',
  ram_gb: 'ramGb',
  ram_type: 'ramTypeConfigValueId',
  memory_install_type: 'memoryInstallTypeCode',
  storage_gb: 'storageGb',
  storage_type: 'storageTypeConfigValueId',
  storage_wipe_status: 'storageWipeStatusConfigValueId',
  operating_system: 'operatingSystemConfigValueId',
  os_build: 'osBuild',
  bios_version: 'biosVersion',
  battery_health: 'batteryHealthPercent',
  absolute_status: 'absoluteStatusConfigValueId',
  touchscreen_status: 'touchscreenStatusConfigValueId',
  keyboard_language: 'keyboardLanguageConfigValueId',
  complete_diagnostics: 'completeDiagnosticsStatusConfigValueId',
  virus_check: 'virusCheckStatusConfigValueId',
  driver_check: 'driverCheckStatusConfigValueId',
  skinned_status: 'skinnedStatusConfigValueId',
  overall_grade: 'overallGradeConfigValueId',
  unit_outcome: 'outcomeCode'
});

const OPTION_SOURCE_BY_REQUIREMENT_KEY = Object.freeze({
  unit_type: 'unitCategories',
  screen_size: 'screenSizes',
  ram_type: 'ramTypes',
  memory_install_type: 'memoryInstallTypes',
  storage_type: 'storageTypes',
  storage_wipe_status: 'storageWipeStatuses',
  absolute_status: 'absoluteStatusOptions',
  touchscreen_status: 'touchscreenStatusOptions',
  keyboard_language: 'keyboardLanguageOptions',
  complete_diagnostics: 'diagnosticsStatusOptions',
  virus_check: 'virusCheckStatusOptions',
  driver_check: 'driverCheckStatusOptions',
  skinned_status: 'skinnedStatusOptions',
  overall_grade: 'overallGradeOptions',
  unit_outcome: 'outcomeOptions'
});

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeComparableText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeObservation(rawValue) {
  if (rawValue === undefined) return { state: 'not_evaluable', value: null };
  const wrapped = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue
    : { state: 'known', value: rawValue };
  const state = String(wrapped.state || 'known').trim().toLowerCase();
  if (!OBSERVATION_STATES.has(state)) return { state: 'unknown', value: null };
  return { state, value: state === 'known' ? wrapped.value : null };
}

function normalizeDetectedValues(body = {}) {
  const raw = body.detected_values ?? body.detectedValues ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map();
  const observations = new Map();
  Object.entries(raw).forEach(([rawKey, rawValue]) => {
    const key = normalizeRequirementKey(rawKey);
    if (!getLotRequirementField(key)) return;
    observations.set(key, normalizeObservation(rawValue));
  });
  return observations;
}

function addTopLevelRequirementContext(body = {}, observations = new Map()) {
  const unitCategory = body.unit_category_config_value_id ?? body.unitCategoryConfigValueId;
  if (unitCategory !== undefined && unitCategory !== null && String(unitCategory).trim() !== '') {
    observations.set('unit_type', normalizeObservation(unitCategory));
  }
  return observations;
}

function optionId(option) {
  return normalizePositiveInteger(option && (option.id ?? option.configValueId ?? option.config_value_id));
}

function optionTexts(option = {}) {
  return [
    option.label,
    option.shortLabel,
    option.value,
    option.code,
    option.name,
    option.modelName,
    option.modelCode
  ].map(normalizeComparableText).filter(Boolean);
}

function resolveGenericOption(options, submitted) {
  const safeOptions = Array.isArray(options) ? options : [];
  const submittedId = normalizePositiveInteger(submitted);
  if (submittedId) {
    const exact = safeOptions.find((option) => optionId(option) === submittedId);
    return exact ? { status: 'resolved', resolvedId: submittedId, option: exact } : { status: 'unmapped' };
  }

  const key = normalizeComparableText(submitted);
  if (!key) return { status: 'unmapped' };
  const matches = safeOptions.filter((option) => optionTexts(option).includes(key));
  if (matches.length === 1) return { status: 'resolved', resolvedId: optionId(matches[0]), option: matches[0] };
  return { status: matches.length > 1 ? 'ambiguous' : 'unmapped' };
}

function processorResolutionOptions(formOptions, formData) {
  const unitModelId = normalizePositiveInteger(formData.unitModelId);
  const options = Array.isArray(formOptions.processorModels) ? formOptions.processorModels : [];
  if (!unitModelId) return options;
  return options.filter((option) => {
    const compatibleIds = Array.isArray(option.compatibleUnitModelIds) ? option.compatibleUnitModelIds : [];
    return compatibleIds.length === 0 || compatibleIds.some((id) => Number(id) === unitModelId);
  });
}

function resolveKnownCatalogValue(requirementKey, submitted, formOptions, formData) {
  const submittedId = normalizePositiveInteger(submitted);

  if (requirementKey === 'manufacturer') {
    const options = formOptions.manufacturers || [];
    if (submittedId && options.some((option) => Number(option.id) === submittedId)) return submittedId;
    const result = resolveManufacturerCandidate(submitted, options);
    return result.status === 'resolved' ? result.resolvedId : null;
  }

  if (requirementKey === 'model') {
    const manufacturerId = normalizePositiveInteger(formData.manufacturerId);
    const categoryId = normalizePositiveInteger(formData.unitCategoryConfigValueId);
    let options = Array.isArray(formOptions.unitModels) ? formOptions.unitModels : [];
    if (manufacturerId) options = options.filter((option) => Number(option.manufacturerId) === manufacturerId);
    if (categoryId) options = options.filter((option) => Number(option.unitCategoryConfigValueId) === categoryId);
    if (submittedId && options.some((option) => Number(option.id) === submittedId)) return submittedId;
    const manufacturer = (formOptions.manufacturers || []).find((option) => Number(option.id) === manufacturerId);
    const candidates = options.map((option) => ({
      ...option,
      label: option.shortLabel || option.label,
      manufacturerLabel: manufacturer?.label || manufacturer?.name || ''
    }));
    const result = resolveModelCandidate(submitted, candidates, manufacturer?.label || manufacturer?.name || '');
    return result.status === 'resolved' ? result.resolvedId : null;
  }

  if (requirementKey === 'processor') {
    const options = processorResolutionOptions(formOptions, formData);
    if (submittedId && options.some((option) => Number(option.id) === submittedId)) return submittedId;
    const brands = new Map((formOptions.processorBrands || []).map((brand) => [Number(brand.id), brand.label]));
    const candidates = options.map((option) => ({
      ...option,
      modelCode: option.shortLabel || option.modelCode || option.label,
      brandName: brands.get(Number(option.processorBrandId)) || ''
    }));
    const result = resolveProcessorCandidate(submitted, candidates);
    return result.status === 'resolved' ? result.resolvedId : null;
  }

  if (requirementKey === 'operating_system') {
    const options = formOptions.operatingSystems || [];
    if (submittedId && options.some((option) => Number(option.id) === submittedId)) return submittedId;
    const result = resolveOperatingSystemCandidate(submitted, options);
    return result.status === 'resolved' ? result.resolvedId : null;
  }

  const optionSource = OPTION_SOURCE_BY_REQUIREMENT_KEY[requirementKey];
  if (!optionSource) return null;
  const result = resolveGenericOption(formOptions[optionSource], submitted);
  return result.status === 'resolved' ? result.resolvedId || result.option?.code || null : null;
}

function clearRequirementValue(formData, requirementKey) {
  if (requirementKey === 'unit_serial_number') formData.unitSerialNumber = '';
  else if (requirementKey === 'bios_serial_number') formData.biosSerialNumber = '';
  else if (requirementKey === 'processor_family') formData.processorModelId = '';
  else if (requirementKey === 'ram_gb' || requirementKey === 'ram_type' || requirementKey === 'memory_install_type') {
    formData.memoryModules = [];
    if (requirementKey === 'ram_gb') formData.ramGb = '';
    if (requirementKey === 'ram_type') formData.ramTypeConfigValueId = '';
  } else if (requirementKey === 'storage_gb' || requirementKey === 'storage_type' || requirementKey === 'storage_wipe_status') {
    formData.storageDevices = [];
    if (requirementKey === 'storage_gb') formData.storageGb = '';
    if (requirementKey === 'storage_type') formData.storageTypeConfigValueId = '';
  } else {
    const property = FORM_PROPERTY_BY_REQUIREMENT_KEY[requirementKey];
    if (property) formData[property] = '';
  }
}

function applyKnownRequirementValue(formData, requirementKey, value, formOptions) {
  const field = getLotRequirementField(requirementKey);
  if (!field) return false;

  if (requirementKey === 'unit_serial_number') {
    formData.unitSerialNumber = String(value ?? '').trim();
    return Boolean(formData.unitSerialNumber);
  }
  if (requirementKey === 'bios_serial_number') {
    formData.biosSerialNumber = String(value ?? '').trim();
    return Boolean(formData.biosSerialNumber);
  }
  if (requirementKey === 'processor_family') return false;

  if (['ram_gb', 'ram_type', 'memory_install_type'].includes(requirementKey)) formData.memoryModules = [];
  if (['storage_gb', 'storage_type', 'storage_wipe_status'].includes(requirementKey)) formData.storageDevices = [];

  if (field.storageKind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return false;
    const property = FORM_PROPERTY_BY_REQUIREMENT_KEY[requirementKey];
    if (!property) return false;
    formData[property] = String(parsed);
    return true;
  }

  if (field.storageKind === 'text') {
    const property = FORM_PROPERTY_BY_REQUIREMENT_KEY[requirementKey];
    if (!property) return false;
    const text = String(value ?? '').trim();
    if (!text) return false;
    formData[property] = text;
    return true;
  }

  if (field.storageKind === 'text_option' && requirementKey === 'memory_install_type') {
    const result = resolveGenericOption(formOptions.memoryInstallTypes, value);
    const code = result.option && String(result.option.code || result.option.value || '').trim();
    if (!code) return false;
    formData.preflightMemoryInstallTypeCode = code;
    return true;
  }

  if (field.storageKind === 'text_option' && requirementKey === 'unit_outcome') {
    const result = resolveGenericOption(formOptions.outcomeOptions, value);
    const code = result.option && String(result.option.code || result.option.value || '').trim();
    if (!code) return false;
    formData.outcomeCode = code;
    return true;
  }

  if (requirementKey === 'storage_wipe_status') {
    const resolvedId = resolveKnownCatalogValue(requirementKey, value, formOptions, formData);
    if (!resolvedId) return false;
    formData.preflightStorageWipeStatusConfigValueId = String(resolvedId);
    return true;
  }

  const resolvedId = resolveKnownCatalogValue(requirementKey, value, formOptions, formData);
  if (!resolvedId) return false;
  const property = FORM_PROPERTY_BY_REQUIREMENT_KEY[requirementKey];
  if (!property) return false;
  formData[property] = String(resolvedId);
  return true;
}

function applyDetectedValues({ formData, observations, formOptions }) {
  const effectiveStates = new Map();
  const orderedKeys = [...observations.keys()].sort((left, right) => {
    const priority = { unit_type: 10, manufacturer: 20, model: 30, processor: 40 };
    return (priority[left] || 100) - (priority[right] || 100);
  });

  orderedKeys.forEach((requirementKey) => {
    const observation = observations.get(requirementKey);
    if (observation.state === 'unknown') {
      clearRequirementValue(formData, requirementKey);
      effectiveStates.set(requirementKey, 'unknown');
      return;
    }

    const applied = applyKnownRequirementValue(formData, requirementKey, observation.value, formOptions);
    if (!applied) {
      clearRequirementValue(formData, requirementKey);
      effectiveStates.set(requirementKey, 'unknown');
      return;
    }

    effectiveStates.set(requirementKey, 'known');
    if (requirementKey === 'processor') effectiveStates.set('processor_family', 'known');
  });

  if (effectiveStates.get('memory_install_type') === 'known') {
    formData.memoryModules = [{
      sizeGb: formData.ramGb || '0',
      ramTypeConfigValueId: formData.ramTypeConfigValueId || '',
      memoryInstallTypeCode: formData.preflightMemoryInstallTypeCode || ''
    }];
  }

  if (effectiveStates.get('storage_wipe_status') === 'known') {
    formData.storageDevices = [{
      sizeGb: formData.storageGb || '0',
      storageTypeConfigValueId: formData.storageTypeConfigValueId || '',
      wipeStatusConfigValueId: formData.preflightStorageWipeStatusConfigValueId || ''
    }];
  }

  delete formData.preflightMemoryInstallTypeCode;
  delete formData.preflightStorageWipeStatusConfigValueId;
  return effectiveStates;
}
module.exports = {
  normalizePositiveInteger,
  normalizeObservation,
  normalizeDetectedValues,
  addTopLevelRequirementContext,
  resolveGenericOption,
  applyKnownRequirementValue,
  applyDetectedValues
};
