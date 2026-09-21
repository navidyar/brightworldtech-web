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
const { normalizeScalarObservations } = require('./apiScalarInventoryPolicy');
const { normalizeMemoryObservation } = require('./apiMemoryInventory');
const { normalizeStorageObservation } = require('./apiStorageInventory');
const { normalizeDisplayObservation } = require('./apiGraphicsDisplayInventory');
const { normalizeSecurityObservation } = require('./apiConnectivitySecurityPowerInventory');
const { normalizeBatteryObservation, normalizeDiagnosticsObservation } = require('./apiHardwareDiagnosticsInventory');

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

const SCALAR_REQUIREMENT_KEYS = Object.freeze({
  manufacturer: 'manufacturer',
  unit_model: 'model',
  processor_model: 'processor',
  processor_speed_ghz: 'processor_speed_ghz',
  operating_system: 'operating_system',
  bios_version: 'bios_version',
  os_build: 'os_build',
  keyboard_language: 'keyboard_language'
});

function addKnownObservation(observations, requirementKey, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  observations.set(requirementKey, { state: 'known', value });
}

function uniqueNonBlank(values = []) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function buildCanonicalRequirementObservations(body = {}, { includeUnitCategory = true } = {}) {
  const observations = new Map();

  // Resolve/Preflight consumes the same canonical Tool payload that Commit ingests.
  // Legacy detected_values/detectedValues is intentionally not consulted here.
  // This prevents generic Tool input from impersonating manual/business fields.
  for (const observation of normalizeScalarObservations(body.fields || {})) {
    const requirementKey = SCALAR_REQUIREMENT_KEYS[observation.fieldKey];
    if (!requirementKey || observation.state !== 'known') continue;
    addKnownObservation(observations, requirementKey, observation.value);
  }

  const memory = normalizeMemoryObservation(body.memory);
  if (memory?.state === 'known') {
    addKnownObservation(observations, 'ram_gb', memory.value.total_gb);
    const ramTypes = uniqueNonBlank(memory.value.modules.map((module) => module.ram_type_submitted));
    if (ramTypes.length === 1) addKnownObservation(observations, 'ram_type', ramTypes[0]);
    const installTypes = uniqueNonBlank(memory.value.modules.map((module) => module.memory_install_type_code));
    if (installTypes.length === 1 && installTypes[0] !== 'unknown') addKnownObservation(observations, 'memory_install_type', installTypes[0]);
  }

  const storage = normalizeStorageObservation(body.storage);
  if (storage?.state === 'confirmed_absent') {
    observations.set('storage_gb', { state: 'known', value: 0 });
  } else if (storage?.state === 'known') {
    addKnownObservation(observations, 'storage_gb', storage.value.total_gb);
    const storageTypes = uniqueNonBlank(storage.value.devices.map((device) => device.storage_type_submitted));
    if (storageTypes.length === 1) addKnownObservation(observations, 'storage_type', storageTypes[0]);
  }

  const display = normalizeDisplayObservation(body.display);
  const panel = display?.state === 'known' ? display.value?.built_in_panel : null;
  if (panel?.confidence === 'confirmed' && panel.screen_size_submitted !== null && panel.screen_size_submitted !== undefined) {
    addKnownObservation(observations, 'screen_size', `${panel.screen_size_submitted}-inch`);
  }

  const security = normalizeSecurityObservation(body.security);
  if (security?.state === 'known' && security.value?.absolute_status !== undefined) {
    addKnownObservation(observations, 'absolute_status', security.value.absolute_status);
  }

  const battery = normalizeBatteryObservation(body.battery);
  if (battery?.state === 'known' && battery.value?.health_percent !== undefined && battery.value?.health_percent !== null) {
    addKnownObservation(observations, 'battery_health', battery.value.health_percent);
  }

  const diagnostics = normalizeDiagnosticsObservation(body.diagnostics);
  if (diagnostics?.state === 'known') {
    for (const item of diagnostics.value?.items || []) {
      if (!['pass', 'fail'].includes(item.state)) continue;
      if (item.key === 'device-manager') addKnownObservation(observations, 'driver_check', item.state === 'pass' ? 'Pass' : 'Fail');
      if (item.key === 'antivirus') addKnownObservation(observations, 'virus_check', item.state === 'pass' ? 'Pass' : 'Fail');
    }
  }

  if (includeUnitCategory) addTopLevelRequirementContext(body, observations);
  addKnownObservation(observations, 'unit_serial_number', body.unit_serial_number ?? body.unitSerialNumber ?? body.unit_serial);
  addKnownObservation(observations, 'bios_serial_number', body.bios_serial_number ?? body.biosSerialNumber ?? body.bios_serial);

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

function buildDetectedCatalogIssues({ observations, effectiveStates, formData }) {
  const issues = [];
  const modelObservation = observations.get('model');
  if (modelObservation?.state === 'known' && effectiveStates.get('model') !== 'known') {
    const manufacturerId = normalizePositiveInteger(formData.manufacturerId);
    const unitCategoryConfigValueId = normalizePositiveInteger(formData.unitCategoryConfigValueId);
    issues.push({
      field_key: 'model',
      code: 'MODEL_NOT_AVAILABLE',
      submitted_value: String(modelObservation.value ?? '').trim(),
      request_supported: Boolean(manufacturerId && unitCategoryConfigValueId),
      request_kind: 'model',
      request_endpoint: '/api/v1/units/catalog-requests/model',
      request_context: {
        manufacturer_id: manufacturerId,
        unit_category_config_value_id: unitCategoryConfigValueId
      },
      message: manufacturerId && unitCategoryConfigValueId
        ? 'The observed Unit Model is not currently available in BWTDallas. Submit a Model Catalog request and wait for approval before continuing.'
        : 'The observed Unit Model could not be resolved because its Manufacturer or Unit Category context is unavailable.'
    });
  }

  const processorObservation = observations.get('processor');
  if (processorObservation?.state === 'known' && effectiveStates.get('processor') !== 'known') {
    const unitModelId = normalizePositiveInteger(formData.unitModelId);
    const modelIssue = issues.some((issue) => issue.field_key === 'model');
    issues.push({
      field_key: 'processor',
      code: unitModelId ? 'PROCESSOR_NOT_AVAILABLE' : 'PROCESSOR_CONTEXT_UNRESOLVED',
      submitted_value: String(processorObservation.value ?? '').trim(),
      request_supported: Boolean(unitModelId),
      request_kind: 'processor',
      request_endpoint: '/api/v1/units/catalog-requests/processor',
      request_context: { unit_model_id: unitModelId },
      dependent_on_model_request: modelIssue,
      message: unitModelId
        ? 'The observed Processor is not currently available for this Unit Model in BWTDallas. Submit a Processor Catalog request and wait for approval before continuing.'
        : 'The observed Processor cannot be resolved until the Unit Model is available in BWTDallas.'
    });
  }

  return issues;
}

module.exports = {
  normalizePositiveInteger,
  normalizeObservation,
  normalizeDetectedValues,
  addTopLevelRequirementContext,
  buildCanonicalRequirementObservations,
  resolveGenericOption,
  applyKnownRequirementValue,
  applyDetectedValues,
  buildDetectedCatalogIssues
};
