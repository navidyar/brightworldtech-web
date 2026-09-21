'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeConnectivityObservation,
  normalizeSecurityObservation,
  normalizePowerObservation,
  buildConnectivitySecurityPowerPlan,
  currentToolSnapshot,
  WIFI_FORM_FIELD_KEY,
  ABSOLUTE_FORM_FIELD_KEY
} = require('./apiConnectivitySecurityPowerInventory');

function current(overrides = {}) {
  return {
    wifi_card_present_config_value_id: null,
    absolute_status_config_value_id: null,
    wifi_hardware_state_code: 'unknown',
    wifi_technology: null,
    wifi_adapter_model: null,
    lte_hardware_state_code: 'unknown',
    lte_technology: null,
    lte_module_model: null,
    lte_imei: null,
    secure_boot_state_code: 'unknown',
    tpm_hardware_state_code: 'unknown',
    tpm_version: null,
    tpm_enabled_state_code: 'unknown',
    tpm_activated_state_code: 'unknown',
    keyboard_backlight_state_code: 'unknown',
    ac_adapter_wattage: null,
    bios_adapter_warning_state_code: 'unknown',
    bios_adapter_warning_message: null,
    ...overrides
  };
}

test('connectivity keeps only top-level Wi-Fi and cellular capability data', () => {
  const observation = normalizeConnectivityObservation({
    wifi: { present: true, technology: 'Wi-Fi 6E', model: 'Intel AX211', macAddress: 'noise' },
    cellular: { present: true, technology: '5G', model: 'Fibocom', imei: '123456789012345', carrier: 'noise' }
  });
  assert.deepEqual(observation.value.wifi, { state: 'known', presence: 'present', technology: 'Wi-Fi 6E', model: 'Intel AX211' });
  assert.deepEqual(observation.value.cellular, { state: 'known', presence: 'present', technology: '5G', model: 'Fibocom', imei: '123456789012345' });
  assert.equal('macAddress' in observation.value.wifi, false);
  assert.equal('carrier' in observation.value.cellular, false);
});

test('unknown Wi-Fi or cellular does not pretend hardware is absent', () => {
  const observation = normalizeConnectivityObservation({ wifi: { state: 'unknown' }, cellular: { state: 'unknown' } });
  assert.equal(observation.value.wifi.state, 'unknown');
  assert.equal(observation.value.cellular.state, 'unknown');
});


test('negative discovery evidence does not become physical absence without confirmed_absent', () => {
  const connectivity = normalizeConnectivityObservation({
    wifi: { present: false, status: 'not_detected' },
    cellular: { detected: false }
  });
  assert.equal(connectivity.value.wifi.presence, 'unknown');
  assert.equal(connectivity.value.cellular.presence, 'unknown');

  const security = normalizeSecurityObservation({ tpm: { present: false, status: 'not_detected' } });
  assert.equal(security.value.tpm.presence, 'unknown');

  const power = normalizePowerObservation({ keyboard_backlight: { present: false } });
  assert.equal(power, null);
});

test('confirmed absent cellular clears identity details in the desired current state', () => {
  const connectivity = normalizeConnectivityObservation({ cellular: { state: 'confirmed_absent' } });
  const resolved = { connectivity, security: null, power: null, wifiResolution: null, absoluteResolution: null };
  const plan = buildConnectivitySecurityPowerPlan({
    resolved,
    currentState: current({ lte_hardware_state_code: 'present', lte_technology: 'LTE', lte_module_model: 'Old modem', lte_imei: '999' }),
    manualSources: new Map(),
    latestToolValues: new Map()
  });
  assert.equal(plan.desiredState.lte_hardware_state_code, 'absent');
  assert.equal(plan.desiredState.lte_imei, null);
});

test('security distinguishes Secure Boot, TPM presence/version/state, UUID, and Absolute input', () => {
  const observation = normalizeSecurityObservation({
    system_uuid: 'A1B2-C3D4',
    secure_boot: true,
    tpm: { present: true, version: '2.0', enabled: true, activated: true },
    absolute_status: 'Enabled'
  });
  assert.equal(observation.value.system_uuid, 'A1B2-C3D4');
  assert.equal(observation.value.secure_boot_state_code, 'enabled');
  assert.equal(observation.value.tpm.presence, 'present');
  assert.equal(observation.value.tpm.version, '2.0');
  assert.equal(observation.value.absolute_status, 'Enabled');
});

test('absent TPM clears TPM-dependent current details', () => {
  const security = normalizeSecurityObservation({ tpm: { state: 'confirmed_absent' } });
  const plan = buildConnectivitySecurityPowerPlan({
    resolved: { connectivity: null, security, power: null, wifiResolution: null, absoluteResolution: null },
    currentState: current({ tpm_hardware_state_code: 'present', tpm_version: '2.0', tpm_enabled_state_code: 'enabled', tpm_activated_state_code: 'enabled' }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.desiredState.tpm_hardware_state_code, 'absent');
  assert.equal(plan.desiredState.tpm_version, null);
  assert.equal(plan.desiredState.tpm_enabled_state_code, 'disabled');
});

test('power accepts observed adapter wattage and BIOS warning without inferring required wattage', () => {
  const observation = normalizePowerObservation({
    keyboard_backlight: { present: true },
    ac_adapter_wattage: 65,
    bios_adapter_warning: { warning: true, message: 'Undersized adapter detected.' },
    required_adapter_wattage: 90
  });
  assert.equal(observation.value.keyboard_backlight_state_code, 'present');
  assert.equal(observation.value.ac_adapter_wattage, 65);
  assert.deepEqual(observation.value.bios_adapter_warning, { state: 'warning', message: 'Undersized adapter detected.' });
  assert.equal('required_adapter_wattage' in observation.value, false);
});

test('unknown power values preserve current observed data', () => {
  const power = normalizePowerObservation({ ac_adapter_wattage: { state: 'unknown' } });
  assert.equal(power, null);
});

test('manual Wi-Fi form choice blocks a tool from changing the existing form-backed value', () => {
  const plan = buildConnectivitySecurityPowerPlan({
    resolved: {
      connectivity: normalizeConnectivityObservation({ wifi: { present: true } }), security: null, power: null,
      wifiResolution: { status: 'resolved', submitted: 'Yes', resolvedId: 10, resolvedLabel: 'Yes' }, absoluteResolution: null
    },
    currentState: current({ wifi_card_present_config_value_id: 20 }),
    manualSources: new Map([[WIFI_FORM_FIELD_KEY, 'manual_override']]), latestToolValues: new Map()
  });
  assert.equal(plan.wifiPlan.status, 'blocked_manual');
  assert.equal(plan.wifiPlan.desiredValue, 20);
});

test('latest tool can replace a Wi-Fi form value previously proven tool-owned', () => {
  const plan = buildConnectivitySecurityPowerPlan({
    resolved: {
      connectivity: normalizeConnectivityObservation({ wifi: { state: 'confirmed_absent' } }), security: null, power: null,
      wifiResolution: { status: 'resolved', submitted: 'No', resolvedId: 20, resolvedLabel: 'No' }, absoluteResolution: null
    },
    currentState: current({ wifi_card_present_config_value_id: 10 }),
    manualSources: new Map(), latestToolValues: new Map([[WIFI_FORM_FIELD_KEY, 10]])
  });
  assert.equal(plan.wifiPlan.status, 'applied');
  assert.equal(plan.wifiPlan.desiredValue, 20);
});

test('manual Absolute Status blocks a later tool observation', () => {
  const plan = buildConnectivitySecurityPowerPlan({
    resolved: {
      connectivity: null, security: normalizeSecurityObservation({ absolute_status: 'Enabled' }), power: null,
      wifiResolution: null, absoluteResolution: { status: 'resolved', submitted: 'Enabled', resolvedId: 30, resolvedLabel: 'Enabled' }
    },
    currentState: current({ absolute_status_config_value_id: 40 }),
    manualSources: new Map([[ABSOLUTE_FORM_FIELD_KEY, 'manual_override']]), latestToolValues: new Map()
  });
  assert.equal(plan.absolutePlan.status, 'blocked_manual');
});

test('tool-only snapshots exclude the editable Wi-Fi and Absolute config IDs', () => {
  const snapshot = currentToolSnapshot(current({ wifi_card_present_config_value_id: 10, absolute_status_config_value_id: 30 }));
  assert.equal('system_uuid' in snapshot, false);
  assert.equal('wifi_card_present_config_value_id' in snapshot, false);
  assert.equal('absolute_status_config_value_id' in snapshot, false);
});

test('collector nulls are Unknown and do not erase prior IMEI, TPM state, or wattage', () => {
  const connectivity = normalizeConnectivityObservation({ cellular: { present: true, imei: null } });
  const security = normalizeSecurityObservation({ system_uuid: null, tpm: { present: true, version: null, enabled: null } });
  const power = normalizePowerObservation({ ac_adapter_wattage: null, keyboard_backlight: null });
  const plan = buildConnectivitySecurityPowerPlan({
    resolved: { connectivity, security, power, wifiResolution: null, absoluteResolution: null },
    currentState: current({
      lte_hardware_state_code: 'present', lte_imei: '12345',
      tpm_hardware_state_code: 'present', tpm_version: '2.0', tpm_enabled_state_code: 'enabled',
      ac_adapter_wattage: 65, keyboard_backlight_state_code: 'present'
    }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.desiredState.lte_imei, '12345');
  assert.equal('system_uuid' in plan.desiredState, false);
  assert.equal(plan.desiredState.tpm_version, '2.0');
  assert.equal(plan.desiredState.tpm_enabled_state_code, 'enabled');
  assert.equal(plan.desiredState.ac_adapter_wattage, 65);
  assert.equal(plan.desiredState.keyboard_backlight_state_code, 'present');
});

test('Absolute status canonicalizes confirmed unavailability while omitting uncertainty', () => {
  assert.equal(
    normalizeSecurityObservation({ absolute_status: 'Not Detected' }).value.absolute_status,
    'Unavailable'
  );
  assert.equal(
    normalizeSecurityObservation({ absolute_status: 'not_present' }).value.absolute_status,
    'Unavailable'
  );
  assert.equal(
    normalizeSecurityObservation({ absolute_status: 'Unavailable' }).value.absolute_status,
    'Unavailable'
  );
  assert.equal(
    normalizeSecurityObservation({ absolute_status: 'Not Available' }).value.absolute_status,
    'Unavailable'
  );
  assert.equal(normalizeSecurityObservation({ absolute_status: 'Unknown' }), null);
  assert.equal(normalizeSecurityObservation({ absolute_status: 'Not Applicable' }), null);
});
