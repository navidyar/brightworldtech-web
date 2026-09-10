'use strict';

const { assessFieldOwnership, valuesEquivalent } = require('./apiScalarInventoryPolicy');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const { resolveSystemConfigValue } = require('./apiConfigValueResolver');

const CONNECTIVITY_FIELD_KEY = 'connectivity_hardware';
const SECURITY_FIELD_KEY = 'security_firmware';
const POWER_FIELD_KEY = 'power_hardware';
const WIFI_FORM_FIELD_KEY = 'wifi_card_present';
const ABSOLUTE_FORM_FIELD_KEY = 'absolute_status';

const PRESENCE_STATES = new Set(['present', 'absent', 'unknown']);
const BOOLEAN_STATES = new Set(['enabled', 'disabled', 'unknown']);
const WARNING_STATES = new Set(['warning', 'none', 'unknown']);

function normalizeText(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeState(value, allowed, aliases = new Map()) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (typeof value === 'boolean') {
    if (allowed === PRESENCE_STATES) return value ? 'present' : 'absent';
    if (allowed === BOOLEAN_STATES) return value ? 'enabled' : 'disabled';
    if (allowed === WARNING_STATES) return value ? 'warning' : 'none';
  }
  const token = normalizeText(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = aliases.get(token) || token;
  return allowed.has(mapped) ? mapped : 'unknown';
}

function normalizePresence(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.state === 'unknown') return 'unknown';
    if (value.present !== undefined) return normalizePresence(value.present);
    if (value.detected !== undefined) return normalizePresence(value.detected);
    return normalizePresence(value.state ?? value.status);
  }
  return normalizeState(value, PRESENCE_STATES, new Map([
    ['yes', 'present'], ['detected', 'present'], ['installed', 'present'], ['available', 'present'],
    ['no', 'absent'], ['not_detected', 'absent'], ['not_present', 'absent'], ['none', 'absent'],
    ['unavailable', 'unknown'], ['unsupported', 'unknown']
  ]));
}

function normalizeBooleanState(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.state === 'unknown') return 'unknown';
    if (value.enabled !== undefined) return normalizeBooleanState(value.enabled);
    return normalizeBooleanState(value.state ?? value.status ?? value.value);
  }
  return normalizeState(value, BOOLEAN_STATES, new Map([
    ['yes', 'enabled'], ['on', 'enabled'], ['true', 'enabled'],
    ['no', 'disabled'], ['off', 'disabled'], ['false', 'disabled'],
    ['unavailable', 'unknown'], ['unsupported', 'unknown']
  ]));
}

function normalizeWarning(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.state === 'unknown') return 'unknown';
    if (value.warning !== undefined) return normalizeWarning(value.warning);
    return normalizeWarning(value.state ?? value.status);
  }
  return normalizeState(value, WARNING_STATES, new Map([
    ['yes', 'warning'], ['present', 'warning'], ['detected', 'warning'], ['true', 'warning'],
    ['no', 'none'], ['clear', 'none'], ['normal', 'none'], ['false', 'none'],
    ['unavailable', 'unknown'], ['unsupported', 'unknown']
  ]));
}

function normalizeObservedText(value, maxLength) {
  if (value === undefined) return undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const state = normalizeText(value.state || 'known', 40).toLowerCase();
    if (state === 'unknown') return undefined;
    if (state === 'confirmed_absent') return null;
    value = value.value ?? value.text ?? value.name ?? value.model;
  }
  if (value === null) return undefined;
  const text = normalizeText(value, maxLength);
  return text || null;
}

function normalizeObservedInteger(value, { minimum = 1, maximum = 2000 } = {}) {
  if (value === undefined) return undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const state = normalizeText(value.state || 'known', 40).toLowerCase();
    if (state === 'unknown') return undefined;
    if (state === 'confirmed_absent') return null;
    value = value.value ?? value.watts ?? value.wattage;
  }
  if (value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`AC adapter wattage must be a whole number between ${minimum} and ${maximum} watts.`);
  }
  return number;
}

function normalizeWifi(raw) {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('connectivity.wifi must be an object.');
  const explicitState = normalizeText(raw.state || 'known', 40).toLowerCase();
  if (explicitState === 'unknown') return { state: 'unknown' };
  if (!['known', 'confirmed_absent'].includes(explicitState)) throw new Error('connectivity.wifi.state must be known, confirmed_absent, or unknown.');
  const presence = explicitState === 'confirmed_absent' ? 'absent' : normalizePresence(raw);
  return {
    state: 'known',
    presence,
    technology: presence === 'absent' ? null : normalizeObservedText(raw.technology, 120),
    model: presence === 'absent' ? null : normalizeObservedText(raw.model ?? raw.name, 255)
  };
}

function normalizeCellular(raw) {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('connectivity.cellular must be an object.');
  const explicitState = normalizeText(raw.state || 'known', 40).toLowerCase();
  if (explicitState === 'unknown') return { state: 'unknown' };
  if (!['known', 'confirmed_absent'].includes(explicitState)) throw new Error('connectivity.cellular.state must be known, confirmed_absent, or unknown.');
  const presence = explicitState === 'confirmed_absent' ? 'absent' : normalizePresence(raw);
  return {
    state: 'known',
    presence,
    technology: presence === 'absent' ? null : normalizeObservedText(raw.technology, 120),
    model: presence === 'absent' ? null : normalizeObservedText(raw.model ?? raw.name, 255),
    imei: presence === 'absent' ? null : normalizeObservedText(raw.imei, 32)
  };
}

function normalizeConnectivityObservation(rawConnectivity) {
  if (rawConnectivity === undefined) return null;
  if (!rawConnectivity || typeof rawConnectivity !== 'object' || Array.isArray(rawConnectivity)) throw new Error('connectivity must be an object.');
  const state = normalizeText(rawConnectivity.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('connectivity.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: CONNECTIVITY_FIELD_KEY, state, value: null };
  const wifi = normalizeWifi(rawConnectivity.wifi);
  const cellular = normalizeCellular(rawConnectivity.cellular ?? rawConnectivity.lte ?? rawConnectivity.wwan);
  if (!wifi && !cellular) return null;
  return { fieldKey: CONNECTIVITY_FIELD_KEY, state: 'known', value: { wifi, cellular } };
}

function normalizeTpm(raw) {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('security.tpm must be an object.');
  const state = normalizeText(raw.state || 'known', 40).toLowerCase();
  if (state === 'unknown') return { state: 'unknown' };
  if (!['known', 'confirmed_absent'].includes(state)) throw new Error('security.tpm.state must be known, confirmed_absent, or unknown.');
  const presence = state === 'confirmed_absent' ? 'absent' : normalizePresence(raw);
  const enabledState = raw.enabled === undefined || raw.enabled === null ? undefined : normalizeBooleanState(raw.enabled);
  const activatedState = raw.activated === undefined || raw.activated === null ? undefined : normalizeBooleanState(raw.activated);
  return {
    state: 'known',
    presence,
    version: presence === 'absent' ? null : normalizeObservedText(raw.version, 32),
    enabled: presence === 'absent' ? 'disabled' : (enabledState === 'unknown' ? undefined : enabledState),
    activated: presence === 'absent' ? 'disabled' : (activatedState === 'unknown' ? undefined : activatedState)
  };
}

function normalizeSecurityObservation(rawSecurity) {
  if (rawSecurity === undefined) return null;
  if (!rawSecurity || typeof rawSecurity !== 'object' || Array.isArray(rawSecurity)) throw new Error('security must be an object.');
  const state = normalizeText(rawSecurity.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('security.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: SECURITY_FIELD_KEY, state, value: null };
  const systemUuid = normalizeObservedText(rawSecurity.system_uuid ?? rawSecurity.systemUuid ?? rawSecurity.uuid, 64);
  const hasSecureBoot = rawSecurity.secure_boot !== undefined || rawSecurity.secureBoot !== undefined;
  const rawSecureBootState = hasSecureBoot ? normalizeBooleanState(rawSecurity.secure_boot ?? rawSecurity.secureBoot) : undefined;
  const secureBoot = rawSecureBootState === 'unknown' ? undefined : rawSecureBootState;
  const tpm = normalizeTpm(rawSecurity.tpm);
  const absoluteStatus = normalizeObservedText(rawSecurity.absolute_status ?? rawSecurity.absoluteStatus ?? rawSecurity.absolute, 160);
  if (systemUuid === undefined && secureBoot === undefined && !tpm && absoluteStatus === undefined) return null;
  return {
    fieldKey: SECURITY_FIELD_KEY,
    state: 'known',
    value: {
      system_uuid: systemUuid,
      secure_boot_state_code: secureBoot,
      tpm,
      absolute_status: absoluteStatus
    }
  };
}

function normalizePowerObservation(rawPower) {
  if (rawPower === undefined) return null;
  if (!rawPower || typeof rawPower !== 'object' || Array.isArray(rawPower)) throw new Error('power must be an object.');
  const state = normalizeText(rawPower.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('power.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: POWER_FIELD_KEY, state, value: null };

  let keyboardBacklight;
  if (rawPower.keyboard_backlight !== undefined || rawPower.keyboardBacklight !== undefined) {
    const backlightState = normalizePresence(rawPower.keyboard_backlight ?? rawPower.keyboardBacklight);
    keyboardBacklight = backlightState === 'unknown' ? undefined : backlightState;
  }
  const adapterWattage = normalizeObservedInteger(rawPower.ac_adapter_wattage ?? rawPower.acAdapterWattage ?? rawPower.adapter_wattage ?? rawPower.adapterWattage);
  let warning = null;
  if (rawPower.bios_adapter_warning !== undefined || rawPower.biosAdapterWarning !== undefined) {
    const rawWarning = rawPower.bios_adapter_warning ?? rawPower.biosAdapterWarning;
    const warningState = normalizeWarning(rawWarning);
    const message = rawWarning && typeof rawWarning === 'object' && !Array.isArray(rawWarning)
      ? normalizeObservedText(rawWarning.message ?? rawWarning.detail, 1000)
      : undefined;
    warning = warningState === 'unknown' ? null : { state: warningState, message: warningState === 'none' ? null : message };
  }
  if (keyboardBacklight === undefined && adapterWattage === undefined && !warning) return null;
  return {
    fieldKey: POWER_FIELD_KEY,
    state: 'known',
    value: {
      keyboard_backlight_state_code: keyboardBacklight,
      ac_adapter_wattage: adapterWattage,
      bios_adapter_warning: warning
    }
  };
}

async function resolveYesNo(connection, presence) {
  if (!['present', 'absent'].includes(presence)) return { status: 'unknown', submitted: presence };
  const submitted = presence === 'present' ? 'Yes' : 'No';
  return resolveSystemConfigValue(connection, {
    systemConfigCategoryId: SYSTEM_CONFIG_CATEGORY_IDS.YES_NO_OPTIONS,
    submitted,
    candidates: presence === 'present' ? ['Present', 'True'] : ['Absent', 'False']
  });
}

async function resolveConnectivitySecurityPowerObservation(connection, { connectivity, security, power }) {
  const resolved = { connectivity, security, power, wifiResolution: null, absoluteResolution: null };
  if (connectivity?.state === 'known' && connectivity.value.wifi?.state === 'known') {
    resolved.wifiResolution = await resolveYesNo(connection, connectivity.value.wifi.presence);
  }
  if (security?.state === 'known' && security.value.absolute_status !== undefined && security.value.absolute_status !== null) {
    resolved.absoluteResolution = await resolveSystemConfigValue(connection, {
      systemConfigCategoryId: SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES,
      submitted: security.value.absolute_status
    });
  }
  return resolved;
}

async function loadCurrentConnectivitySecurityPowerState(connection, unitId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT us.unit_id, us.wifi_card_present_config_value_id, us.absolute_status_config_value_id,
            us.wifi_hardware_state_code, us.wifi_technology, us.wifi_adapter_model,
            us.lte_hardware_state_code, us.lte_technology, us.lte_module_model, us.lte_imei,
            us.secure_boot_state_code, us.tpm_hardware_state_code, us.tpm_version,
            us.tpm_enabled_state_code, us.tpm_activated_state_code,
            us.keyboard_backlight_state_code, us.ac_adapter_wattage,
            us.bios_adapter_warning_state_code, us.bios_adapter_warning_message
       FROM unit_specifications us
      WHERE us.unit_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [unitId]
  );
  return rows[0] || null;
}

function mergeDefined(current, next) {
  return next === undefined ? current : next;
}

function buildToolOnlyDesiredState(current, resolved) {
  const desired = { ...current };
  const connectivity = resolved.connectivity;
  if (connectivity?.state === 'known') {
    const wifi = connectivity.value.wifi;
    if (wifi?.state === 'known' && wifi.presence !== 'unknown') {
      desired.wifi_hardware_state_code = wifi.presence;
      if (wifi.presence === 'absent') {
        desired.wifi_technology = null;
        desired.wifi_adapter_model = null;
      } else if (wifi.presence !== 'unknown') {
        desired.wifi_technology = mergeDefined(current.wifi_technology, wifi.technology);
        desired.wifi_adapter_model = mergeDefined(current.wifi_adapter_model, wifi.model);
      }
    }
    const cellular = connectivity.value.cellular;
    if (cellular?.state === 'known' && cellular.presence !== 'unknown') {
      desired.lte_hardware_state_code = cellular.presence;
      if (cellular.presence === 'absent') {
        desired.lte_technology = null;
        desired.lte_module_model = null;
        desired.lte_imei = null;
      } else if (cellular.presence !== 'unknown') {
        desired.lte_technology = mergeDefined(current.lte_technology, cellular.technology);
        desired.lte_module_model = mergeDefined(current.lte_module_model, cellular.model);
        desired.lte_imei = mergeDefined(current.lte_imei, cellular.imei);
      }
    }
  }

  const security = resolved.security;
  if (security?.state === 'known') {
    const value = security.value;
    desired.secure_boot_state_code = mergeDefined(current.secure_boot_state_code, value.secure_boot_state_code);
    if (value.tpm?.state === 'known' && value.tpm.presence !== 'unknown') {
      desired.tpm_hardware_state_code = value.tpm.presence;
      if (value.tpm.presence === 'absent') {
        desired.tpm_version = null;
        desired.tpm_enabled_state_code = 'disabled';
        desired.tpm_activated_state_code = 'disabled';
      } else if (value.tpm.presence !== 'unknown') {
        desired.tpm_version = mergeDefined(current.tpm_version, value.tpm.version);
        desired.tpm_enabled_state_code = mergeDefined(current.tpm_enabled_state_code, value.tpm.enabled);
        desired.tpm_activated_state_code = mergeDefined(current.tpm_activated_state_code, value.tpm.activated);
      }
    }
  }

  const power = resolved.power;
  if (power?.state === 'known') {
    const value = power.value;
    desired.keyboard_backlight_state_code = mergeDefined(current.keyboard_backlight_state_code, value.keyboard_backlight_state_code);
    desired.ac_adapter_wattage = mergeDefined(current.ac_adapter_wattage, value.ac_adapter_wattage);
    if (value.bios_adapter_warning) {
      desired.bios_adapter_warning_state_code = value.bios_adapter_warning.state;
      if (value.bios_adapter_warning.state === 'none') desired.bios_adapter_warning_message = null;
      else if (value.bios_adapter_warning.state !== 'unknown') {
        desired.bios_adapter_warning_message = mergeDefined(current.bios_adapter_warning_message, value.bios_adapter_warning.message);
      }
    }
  }
  return desired;
}

function buildFormFieldPlan({ fieldKey, currentValue, resolution, manualSources, latestToolValues }) {
  if (!resolution || resolution.status === 'unknown') return null;
  if (resolution.status !== 'resolved') {
    return { fieldKey, currentValue, desiredValue: currentValue, status: 'ignored_unknown', reason: resolution.status === 'ambiguous' ? 'catalog_value_ambiguous' : 'catalog_value_unmapped', storedValue: resolution };
  }
  const sourceCode = manualSources.get(fieldKey) || '';
  const hasLatestTool = latestToolValues.has(fieldKey);
  const ownership = assessFieldOwnership({ currentValue, sourceCode, hasLatestAppliedToolObservation: hasLatestTool, latestAppliedToolValue: hasLatestTool ? latestToolValues.get(fieldKey) : null });
  if (ownership === 'manual') return { fieldKey, currentValue, desiredValue: currentValue, status: 'blocked_manual', reason: 'active_cycle_manual_override', storedValue: resolution };
  if (ownership === 'protected_legacy') return { fieldKey, currentValue, desiredValue: currentValue, status: 'blocked_manual', reason: 'existing_value_not_tool_owned', storedValue: resolution };
  const desiredValue = resolution.resolvedId;
  if (valuesEquivalent(currentValue, desiredValue)) return { fieldKey, currentValue, desiredValue, status: 'unchanged', reason: 'already_current', storedValue: resolution };
  return { fieldKey, currentValue, desiredValue, status: 'applied', reason: 'latest_valid_tool_observation', storedValue: resolution };
}

function buildConnectivitySecurityPowerPlan({ resolved, currentState, manualSources, latestToolValues }) {
  const desiredState = buildToolOnlyDesiredState(currentState, resolved);
  const wifiPlan = resolved.wifiResolution ? buildFormFieldPlan({
    fieldKey: WIFI_FORM_FIELD_KEY,
    currentValue: currentState.wifi_card_present_config_value_id,
    resolution: resolved.wifiResolution,
    manualSources,
    latestToolValues
  }) : null;
  const absolutePlan = resolved.absoluteResolution ? buildFormFieldPlan({
    fieldKey: ABSOLUTE_FORM_FIELD_KEY,
    currentValue: currentState.absolute_status_config_value_id,
    resolution: resolved.absoluteResolution,
    manualSources,
    latestToolValues
  }) : null;
  return { desiredState, wifiPlan, absolutePlan };
}

const TOOL_COLUMNS = Object.freeze([
  'wifi_hardware_state_code', 'wifi_technology', 'wifi_adapter_model',
  'lte_hardware_state_code', 'lte_technology', 'lte_module_model', 'lte_imei',
  'secure_boot_state_code', 'tpm_hardware_state_code', 'tpm_version',
  'tpm_enabled_state_code', 'tpm_activated_state_code', 'keyboard_backlight_state_code',
  'ac_adapter_wattage', 'bios_adapter_warning_state_code', 'bios_adapter_warning_message'
]);

function currentToolSnapshot(state) {
  return Object.fromEntries(TOOL_COLUMNS.map((key) => [key, state[key] ?? null]));
}

async function applyConnectivitySecurityPowerPlan(connection, unitId, plan) {
  const desired = plan.desiredState;
  const assignments = TOOL_COLUMNS.map((column) => `${column} = ?`).join(', ');
  await connection.query(
    `UPDATE unit_specifications SET ${assignments}, wifi_card_present_config_value_id = ?, absolute_status_config_value_id = ? WHERE unit_id = ?`,
    [
      ...TOOL_COLUMNS.map((column) => desired[column] ?? null),
      plan.wifiPlan?.status === 'applied' ? plan.wifiPlan.desiredValue : desired.wifi_card_present_config_value_id,
      plan.absolutePlan?.status === 'applied' ? plan.absolutePlan.desiredValue : desired.absolute_status_config_value_id,
      unitId
    ]
  );
}

function sectionToolSnapshot(state = {}, fieldKey) {
  const groups = {
    [CONNECTIVITY_FIELD_KEY]: ['wifi_hardware_state_code', 'wifi_technology', 'wifi_adapter_model', 'lte_hardware_state_code', 'lte_technology', 'lte_module_model', 'lte_imei'],
    [SECURITY_FIELD_KEY]: ['secure_boot_state_code', 'tpm_hardware_state_code', 'tpm_version', 'tpm_enabled_state_code', 'tpm_activated_state_code'],
    [POWER_FIELD_KEY]: ['keyboard_backlight_state_code', 'ac_adapter_wattage', 'bios_adapter_warning_state_code', 'bios_adapter_warning_message']
  };
  return Object.fromEntries((groups[fieldKey] || []).map((key) => [key, state[key] ?? null]));
}

function summary(state = {}) {
  const parts = [];
  const wifi = state.wifi_hardware_state_code || 'unknown';
  if (wifi !== 'unknown') parts.push(`Wi-Fi ${wifi}${state.wifi_technology ? ` (${state.wifi_technology})` : ''}`);
  const lte = state.lte_hardware_state_code || 'unknown';
  if (lte !== 'unknown') parts.push(`LTE/WWAN ${lte}${state.lte_technology ? ` (${state.lte_technology})` : ''}${state.lte_imei ? `, IMEI ${state.lte_imei}` : ''}`);
  if (state.secure_boot_state_code && state.secure_boot_state_code !== 'unknown') parts.push(`Secure Boot ${state.secure_boot_state_code}`);
  if (state.tpm_hardware_state_code && state.tpm_hardware_state_code !== 'unknown') parts.push(`TPM ${state.tpm_hardware_state_code}${state.tpm_version ? ` ${state.tpm_version}` : ''}`);
  if (state.keyboard_backlight_state_code && state.keyboard_backlight_state_code !== 'unknown') parts.push(`Keyboard Backlight ${state.keyboard_backlight_state_code}`);
  if (state.ac_adapter_wattage) parts.push(`Observed Adapter ${state.ac_adapter_wattage}W`);
  if (state.bios_adapter_warning_state_code === 'warning') parts.push(`BIOS Adapter Warning${state.bios_adapter_warning_message ? `: ${state.bios_adapter_warning_message}` : ''}`);
  return parts.join('; ') || 'Unknown';
}

module.exports = {
  CONNECTIVITY_FIELD_KEY,
  SECURITY_FIELD_KEY,
  POWER_FIELD_KEY,
  WIFI_FORM_FIELD_KEY,
  ABSOLUTE_FORM_FIELD_KEY,
  TOOL_COLUMNS,
  normalizeConnectivityObservation,
  normalizeSecurityObservation,
  normalizePowerObservation,
  resolveConnectivitySecurityPowerObservation,
  loadCurrentConnectivitySecurityPowerState,
  buildConnectivitySecurityPowerPlan,
  applyConnectivitySecurityPowerPlan,
  currentToolSnapshot,
  sectionToolSnapshot,
  summary
};
