'use strict';

const { isReplaceableManualSource } = require('./unitFieldAuthority');

const SUPPORTED_SCALAR_FIELDS = Object.freeze({
  manufacturer: Object.freeze({
    fieldKey: 'manufacturer',
    formProperty: 'manufacturerId',
    storage: 'units',
    kind: 'catalog',
    catalogType: 'manufacturer',
    maximumLength: 160,
    allowConfirmedAbsent: false
  }),
  unit_model: Object.freeze({
    fieldKey: 'unit_model',
    formProperty: 'unitModelId',
    storage: 'units',
    kind: 'catalog',
    catalogType: 'unit_model',
    maximumLength: 255,
    allowConfirmedAbsent: false
  }),
  processor_model: Object.freeze({
    fieldKey: 'processor_model',
    formProperty: 'processorModelId',
    storage: 'units',
    kind: 'catalog',
    catalogType: 'processor_model',
    maximumLength: 255,
    allowConfirmedAbsent: false
  }),
  processor_speed_ghz: Object.freeze({
    fieldKey: 'processor_speed_ghz',
    formProperty: 'processorSpeedGhz',
    storage: 'units',
    kind: 'number',
    minimum: 0.01,
    maximum: 20,
    decimalPlaces: 3
  }),
  operating_system: Object.freeze({
    fieldKey: 'operating_system',
    formProperty: 'operatingSystemConfigValueId',
    storage: 'units',
    kind: 'catalog',
    catalogType: 'operating_system',
    maximumLength: 255,
    allowConfirmedAbsent: true
  }),
  bios_version: Object.freeze({
    fieldKey: 'bios_version',
    formProperty: 'biosVersion',
    storage: 'unit_specifications',
    kind: 'text',
    maximumLength: 255
  }),
  os_build: Object.freeze({
    fieldKey: 'os_build',
    formProperty: 'osBuild',
    storage: 'unit_specifications',
    kind: 'text',
    maximumLength: 120
  }),
  windows_display_version: Object.freeze({
    fieldKey: 'windows_display_version',
    formProperty: null,
    storage: 'unit_specifications',
    kind: 'text',
    maximumLength: 80
  }),
  keyboard_language: Object.freeze({
    fieldKey: 'keyboard_language',
    formProperty: 'keyboardLanguageConfigValueId',
    storage: 'unit_specifications',
    kind: 'system_config',
    maximumLength: 160,
    allowConfirmedAbsent: false
  })
});

const OBSERVATION_STATES = new Set(['known', 'confirmed_absent', 'unknown']);

function normalizeObservationState(value) {
  const state = String(value || '').trim().toLowerCase();
  return OBSERVATION_STATES.has(state) ? state : '';
}

function roundNumber(value, decimalPlaces) {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeKnownValue(definition, value) {
  if (definition.kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < definition.minimum || parsed > definition.maximum) {
      throw new Error(`${definition.fieldKey} must be between ${definition.minimum} and ${definition.maximum}.`);
    }
    return roundNumber(parsed, definition.decimalPlaces || 3);
  }

  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${definition.fieldKey} cannot be blank when state is known.`);
  return text.slice(0, definition.maximumLength || 255);
}

function normalizeFieldObservation(fieldKey, rawObservation) {
  const definition = SUPPORTED_SCALAR_FIELDS[fieldKey];
  if (!definition || rawObservation === undefined) return null;

  const wrapped = rawObservation && typeof rawObservation === 'object' && !Array.isArray(rawObservation)
    ? rawObservation
    : { state: 'known', value: rawObservation };
  const state = normalizeObservationState(wrapped.state || 'known');
  if (!state) throw new Error(`${fieldKey} has an unsupported observation state.`);

  if (state === 'unknown') {
    return { fieldKey, state, value: null };
  }
  if (state === 'confirmed_absent') {
    if (definition.allowConfirmedAbsent === false) {
      throw new Error(`${fieldKey} cannot use confirmed_absent; submit unknown when the tool cannot determine it.`);
    }
    return { fieldKey, state, value: null };
  }

  return {
    fieldKey,
    state,
    value: normalizeKnownValue(definition, wrapped.value)
  };
}

function normalizeScalarObservations(fields = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('fields must be an object keyed by BWTDallas field key.');
  }

  const observations = [];
  for (const fieldKey of Object.keys(SUPPORTED_SCALAR_FIELDS)) {
    const observation = normalizeFieldObservation(fieldKey, fields[fieldKey]);
    if (observation) observations.push(observation);
  }
  return observations;
}

function isEmptyValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function comparableValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number(value);
  return String(value).trim();
}

function valuesEquivalent(left, right) {
  return comparableValue(left) === comparableValue(right);
}

function isManualSource(sourceCode) {
  return String(sourceCode || '').trim().toLowerCase() === 'manual_override';
}

function isKnownToolSource(sourceCode) {
  const source = String(sourceCode || '').trim().toLowerCase();
  return source !== '' && !isManualSource(source) && /(scan|techtools|tool|api_)/.test(source);
}

function extractAppliedToolValue(fieldKey, storedValue) {
  if (!storedValue || typeof storedValue !== 'object' || Array.isArray(storedValue)) return storedValue;
  const resolvedId = Number(storedValue.resolved_id ?? storedValue.resolvedId);
  if (Number.isSafeInteger(resolvedId) && resolvedId > 0) return resolvedId;
  const definition = SUPPORTED_SCALAR_FIELDS[fieldKey];
  return ['catalog', 'system_config'].includes(definition?.kind) ? null : storedValue;
}

function assessFieldOwnership({
  currentValue,
  sourceCode = '',
  hasLatestAppliedToolObservation = false,
  latestAppliedToolValue = null
}) {
  if (isManualSource(sourceCode)) return 'manual';
  if (isEmptyValue(currentValue)) return 'blank';
  if (isReplaceableManualSource(sourceCode)) return 'replaceable_manual';
  if (isKnownToolSource(sourceCode)) return 'tool';
  if (hasLatestAppliedToolObservation && valuesEquivalent(currentValue, latestAppliedToolValue)) return 'tool';
  return 'protected_legacy';
}

function decideScalarApplication({
  observation,
  currentValue,
  sourceCode = '',
  hasLatestAppliedToolObservation = false,
  latestAppliedToolValue = null
}) {
  if (observation.state === 'unknown') {
    return { status: 'ignored_unknown', reason: 'unknown_does_not_overwrite', desiredValue: currentValue };
  }

  const ownership = assessFieldOwnership({
    currentValue,
    sourceCode,
    hasLatestAppliedToolObservation,
    latestAppliedToolValue
  });

  if (ownership === 'manual') {
    return { status: 'blocked_manual', reason: 'active_cycle_manual_override', desiredValue: currentValue };
  }

  if (ownership === 'protected_legacy') {
    return { status: 'blocked_manual', reason: 'existing_value_not_tool_owned', desiredValue: currentValue };
  }

  const desiredValue = observation.state === 'confirmed_absent' ? null : observation.value;
  if (valuesEquivalent(currentValue, desiredValue)) {
    return { status: 'unchanged', reason: 'already_current', desiredValue };
  }

  return { status: 'applied', reason: 'latest_valid_tool_observation', desiredValue };
}

module.exports = {
  SUPPORTED_SCALAR_FIELDS,
  normalizeFieldObservation,
  normalizeScalarObservations,
  valuesEquivalent,
  decideScalarApplication,
  assessFieldOwnership,
  extractAppliedToolValue,
  isManualSource
};
