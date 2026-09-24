'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const {
  normalizeBatteryObservation,
  normalizeCameraHardwareObservation,
  normalizeFingerprintHardwareObservation,
  normalizeDiagnosticsObservation,
  normalizeDiagnosticState,
  buildHardwareDiagnosticsPlan,
  syncBatteryHealthSummary,
  KEYBOARD_TEST_FIELD_KEY,
  BIOS_LOCK_FIELD_KEY,
  MDM_LOCK_FIELD_KEY,
  CAMERA_TEST_FIELD_KEY,
  BATTERY_HEALTH_FIELD_KEY,
  TOUCHSCREEN_TEST_FIELD_KEY,
  COMPLETE_DIAGNOSTICS_FIELD_KEY
} = require('./apiHardwareDiagnosticsInventory');

function configRows(categoryId) {
  const rows = new Map([
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS), [
      { id: 301, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 302, label: 'Fail', code: 'fail', value: 'Fail' },
      { id: 303, label: 'Physically Not Present', code: 'physically_not_present', value: 'Physically Not Present' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES), [
      { id: 901, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 902, label: 'Fail', code: 'fail', value: 'Fail' },
      { id: 903, label: 'Physically Not Present', code: 'physically_not_present', value: 'Physically Not Present' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES), [
      { id: 911, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 912, label: 'Fail', code: 'fail', value: 'Fail' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS), [
      { id: 401, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 402, label: 'Fail', code: 'fail', value: 'Fail' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES), [
      { id: 601, label: 'Locked', code: 'locked', value: 'Locked' },
      { id: 602, label: 'Unlocked', code: 'unlocked', value: 'Unlocked' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.BIOMETRIC_HARDWARE), [
      { id: 501, label: 'Fingerprint Reader', code: 'fingerprint', value: 'Fingerprint Reader' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES), [
      { id: 701, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 702, label: 'Fail', code: 'fail', value: 'Fail' }
    ]],
    [Number(SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES), [
      { id: 801, label: 'Pass', code: 'pass', value: 'Pass' },
      { id: 802, label: 'Fail', code: 'fail', value: 'Fail' }
    ]]
  ]);
  return rows.get(Number(categoryId)) || [];
}

function connection() {
  return {
    async query(sql, params = []) {
      if (String(sql).includes('system_config_categories')) return [configRows(params[0])];
      throw new Error(`Unexpected query in unit test: ${sql}`);
    }
  };
}

function currentState(overrides = {}) {
  return {
    specifications: {
      keyboard_test_result_config_value_id: null,
      microphone_check_result_config_value_id: null,
      audio_output_check_result_config_value_id: null,
      bios_lock_config_value_id: null,
      mdm_lock_config_value_id: null,
      driver_check_status_config_value_id: null,
      virus_check_status_config_value_id: null,
      touchscreen_status_config_value_id: null,
      complete_diagnostics_status_config_value_id: null,
      battery_hardware_state_code: 'unknown',
      battery_health_percent_observed: null,
      camera_hardware_state_code: 'unknown',
      fingerprint_hardware_state_code: 'unknown',
      ...(overrides.specifications || {})
    },
    batteries: overrides.batteries || [],
    cameras: overrides.cameras || [],
    biometrics: overrides.biometrics || []
  };
}

test('tool battery reconciliation synchronizes the Unit battery health summary used outside the repeatable form rows', async () => {
  const queries = [];
  const fakeConnection = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return [{ affectedRows: 1 }];
    }
  };

  await syncBatteryHealthSummary(fakeConnection, 42);

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE units[\s\S]*battery_health_percent = \(\s*SELECT MIN\(health_percent\)[\s\S]*FROM unit_batteries/);
  assert.deepEqual(queries[0].params, [42, 42]);
});

test('battery keeps presence and health while ignoring transient charge/capacity noise', () => {
  const observation = normalizeBatteryObservation({ detected: true, overallHealth: 87.43, currentCharge: 20, designCapacity: 50000 });
  assert.deepEqual(observation.value, { presence: 'present', health_percent: 87.43 });
});

test('unknown battery does not pretend a desktop has no battery', () => {
  assert.equal(normalizeBatteryObservation({ state: 'unknown' }).state, 'unknown');
  assert.equal(normalizeBatteryObservation({ state: 'confirmed_absent' }).value.presence, 'absent');
});

test('camera and fingerprint hardware presence stay separate from functional tests', () => {
  assert.equal(normalizeCameraHardwareObservation([{ name: 'Camera' }]).value.presence, 'present');
  assert.equal(normalizeFingerprintHardwareObservation([]).state, 'unknown');
});

test('hardware absence requires explicit confirmation instead of false or not-detected evidence', () => {
  assert.equal(normalizeBatteryObservation({ detected: false }).value.presence, 'unknown');
  assert.equal(normalizeCameraHardwareObservation({ detected: false }).value.presence, 'unknown');
  assert.equal(normalizeFingerprintHardwareObservation({ state: 'known', status: 'not_detected' }).value.presence, 'unknown');
  assert.equal(normalizeCameraHardwareObservation({ state: 'confirmed_absent' }).value.presence, 'absent');
  assert.equal(normalizeFingerprintHardwareObservation({ state: 'confirmed_absent' }).value.presence, 'absent');
});

test('TechTools final diagnostic states are Pass, Fail, or confirmed physical absence', () => {
  assert.equal(normalizeDiagnosticState('Pass'), 'pass');
  assert.equal(normalizeDiagnosticState('Fail'), 'fail');
  assert.equal(normalizeDiagnosticState('Physically Not Present'), 'physically_not_present');
  assert.equal(normalizeDiagnosticState('Ready'), 'ready');
  assert.equal(normalizeDiagnosticState('Running'), 'running');
  assert.equal(normalizeDiagnosticState('Locked'), 'locked');
  assert.equal(normalizeDiagnosticState('Unlocked'), 'unlocked');
});

test('retired uncertainty and non-applicability states are rejected so Tools omit them instead', () => {
  for (const state of ['Could Not Determine', 'Not Tested', 'Not Applicable', 'Test Not Available', 'Not Available']) {
    assert.equal(normalizeDiagnosticState(state), '');
  }
  assert.throws(
    () => normalizeDiagnosticsObservation({ items: [{ key: 'keyboard', state: 'Not Tested' }] }),
    /unsupported state/
  );
});

test('diagnostics preserve individual results and override-used flag but never retain an override code', () => {
  const observation = normalizeDiagnosticsObservation({
    unit_result: 'REVIEW REQUIRED',
    override_used: true,
    override_code: 'DO-NOT-STORE',
    items: [{ key: 'camera', state: 'Pass', detail: 'Visual confirmation complete.' }]
  });
  assert.equal(observation.value.override_used, true);
  assert.equal(observation.value.items[0].state, 'pass');
  assert.equal('override_code' in observation.value, false);
});

test('BIOS and MDM lock diagnostics store only explicit Locked and Unlocked states', async () => {
  const diagnostics = normalizeDiagnosticsObservation({
    items: [
      { key: 'bios-lock', state: 'Locked' },
      { key: 'mdm_lock', state: 'Unlocked' }
    ]
  });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  const byField = new Map(plan.formPlans.map((entry) => [entry.fieldKey, entry]));
  assert.equal(byField.get(BIOS_LOCK_FIELD_KEY).status, 'applied');
  assert.equal(byField.get(BIOS_LOCK_FIELD_KEY).desiredValue, 601);
  assert.equal(byField.get(MDM_LOCK_FIELD_KEY).status, 'applied');
  assert.equal(byField.get(MDM_LOCK_FIELD_KEY).desiredValue, 602);
});

test('final keyboard diagnostic can populate the existing test field when it is not manually owned', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'keyboard', state: 'Pass' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  const keyboard = plan.formPlans.find((entry) => entry.fieldKey === KEYBOARD_TEST_FIELD_KEY);
  assert.equal(keyboard.status, 'applied');
  assert.equal(keyboard.desiredValue, 301);
});

test('confirmed physical absence can populate the shared test result without fabricating a failure', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'keyboard', state: 'Physically Not Present' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  const keyboard = plan.formPlans.find((entry) => entry.fieldKey === KEYBOARD_TEST_FIELD_KEY);
  assert.equal(keyboard.status, 'applied');
  assert.equal(keyboard.desiredValue, 303);
});

test('manual keyboard result blocks a later TechTools result', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'keyboard', state: 'Fail' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState({ specifications: { keyboard_test_result_config_value_id: 301 } }),
    manualSources: new Map([[KEYBOARD_TEST_FIELD_KEY, 'manual_override']]), latestToolValues: new Map()
  });
  assert.equal(plan.formPlans[0].status, 'blocked_manual');
  assert.equal(plan.formPlans[0].desiredValue, 301);
});

test('Ready and Running diagnostics remain historical only and do not populate form results', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'keyboard', state: 'Running' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.formPlans.length, 0);
});



test('explicit touchscreen diagnostics populate Pass, Fail, or Physically Not Present', async () => {
  for (const [state, expectedId] of [['Pass', 901], ['Fail', 902], ['Physically Not Present', 903]]) {
    const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'touchscreen', state }] });
    const plan = await buildHardwareDiagnosticsPlan(connection(), {
      battery: null, camera: null, fingerprint: null, diagnostics,
      currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
    });
    const touchscreen = plan.formPlans.find((entry) => entry.fieldKey === TOUCHSCREEN_TEST_FIELD_KEY);
    assert.equal(touchscreen.status, 'applied');
    assert.equal(touchscreen.desiredValue, expectedId);
  }
});

test('confirmed touchscreen hardware absence populates Physically Not Present when no functional result was submitted', async () => {
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics: null,
    display: { state: 'known', value: { touchscreen_hardware_state_code: 'absent' } },
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  const touchscreen = plan.formPlans.find((entry) => entry.fieldKey === TOUCHSCREEN_TEST_FIELD_KEY);
  assert.equal(touchscreen.status, 'applied');
  assert.equal(touchscreen.desiredValue, 903);
  assert.equal(touchscreen.reason, 'confirmed_touchscreen_hardware_absent');
});

test('touchscreen hardware presence never fabricates a passing functional test', async () => {
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics: null,
    display: { state: 'known', value: { touchscreen_hardware_state_code: 'present' } },
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.formPlans.some((entry) => entry.fieldKey === TOUCHSCREEN_TEST_FIELD_KEY), false);
});

test('final overall diagnostics Pass or Fail populates Diagnostics Test while review states remain evidence only', async () => {
  for (const [unitResult, expectedId] of [['Pass', 911], ['Fail', 912]]) {
    const diagnostics = normalizeDiagnosticsObservation({ unit_result: unitResult });
    const plan = await buildHardwareDiagnosticsPlan(connection(), {
      battery: null, camera: null, fingerprint: null, diagnostics,
      currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
    });
    const overall = plan.formPlans.find((entry) => entry.fieldKey === COMPLETE_DIAGNOSTICS_FIELD_KEY);
    assert.equal(overall.status, 'applied');
    assert.equal(overall.desiredValue, expectedId);
  }

  const camelCase = normalizeDiagnosticsObservation({ unitResult: 'Pass' });
  assert.equal(camelCase.value.unit_result, 'Pass');

  const review = normalizeDiagnosticsObservation({ unit_result: 'REVIEW REQUIRED' });
  const reviewPlan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics: review,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(reviewPlan.formPlans.some((entry) => entry.fieldKey === COMPLETE_DIAGNOSTICS_FIELD_KEY), false);
});

test('camera diagnostic updates only one unambiguous configured camera row', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'camera', state: 'Pass' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState({ cameras: [{ unit_camera_id: 10, test_result_config_value_id: null }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.cameraTestPlan.status, 'applied');
  assert.equal(plan.cameraTestPlan.rowId, 10);
  assert.equal(plan.cameraTestPlan.fieldKey, CAMERA_TEST_FIELD_KEY);
});

test('multiple camera rows keep one generic TechTools camera result in provenance instead of guessing a row', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'camera', state: 'Pass' }] });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState({ cameras: [{ unit_camera_id: 10 }, { unit_camera_id: 11 }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.cameraTestPlan.status, 'ignored_unknown');
  assert.equal(plan.cameraTestPlan.reason, 'multiple_camera_rows_ambiguous');
});

test('single battery health populates a blank form row but manual battery health wins', async () => {
  const battery = normalizeBatteryObservation({ detected: true, health_percent: 91 });
  const editable = await buildHardwareDiagnosticsPlan(connection(), {
    battery, camera: null, fingerprint: null, diagnostics: null,
    currentState: currentState({ batteries: [{ unit_battery_id: 7, health_percent: null }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(editable.batteryHealthPlan.status, 'applied');
  assert.equal(editable.batteryHealthPlan.rowId, 7);

  const manual = await buildHardwareDiagnosticsPlan(connection(), {
    battery, camera: null, fingerprint: null, diagnostics: null,
    currentState: currentState({ batteries: [{ unit_battery_id: 7, health_percent: 80 }] }),
    manualSources: new Map([[BATTERY_HEALTH_FIELD_KEY, 'manual_override']]), latestToolValues: new Map()
  });
  assert.equal(manual.batteryHealthPlan.status, 'blocked_manual');
});

test('multiple battery rows do not receive one overall health value indiscriminately', async () => {
  const battery = normalizeBatteryObservation({ detected: true, health_percent: 91 });
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery, camera: null, fingerprint: null, diagnostics: null,
    currentState: currentState({ batteries: [{ unit_battery_id: 1, health_percent: 90 }, { unit_battery_id: 2, health_percent: 92 }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.batteryHealthPlan.status, 'ignored_unknown');
  assert.equal(plan.batteryHealthPlan.reason, 'multiple_battery_rows_ambiguous');
});

test('fingerprint presence can create the existing fingerprint hardware form row without converting detection into Pass', async () => {
  const fingerprint = normalizeFingerprintHardwareObservation([{ name: 'Goodix Fingerprint' }]);
  const plan = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint, diagnostics: null,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(plan.fingerprintHardwarePlan.status, 'insert');
  assert.equal(plan.fingerprintHardwarePlan.resolution.resolvedId, 501);
  assert.equal(plan.fingerprintTestPlan, null);
});

test('reported battery health implies battery presence even when collector omits an explicit detected flag', () => {
  const observation = normalizeBatteryObservation({ overallHealth: 88 });
  assert.equal(observation.value.presence, 'present');
  assert.equal(observation.value.health_percent, 88);
});

test('confirmed absent battery can retire a single row only when that row is proven tool-owned', async () => {
  const battery = normalizeBatteryObservation({ state: 'confirmed_absent' });
  const toolOwned = await buildHardwareDiagnosticsPlan(connection(), {
    battery, camera: null, fingerprint: null, diagnostics: null,
    currentState: currentState({ batteries: [{ unit_battery_id: 9, health_percent: 90 }] }),
    manualSources: new Map(), latestToolValues: new Map([[BATTERY_HEALTH_FIELD_KEY, 90]])
  });
  assert.equal(toolOwned.batteryHealthPlan.status, 'delete');

  const legacy = await buildHardwareDiagnosticsPlan(connection(), {
    battery, camera: null, fingerprint: null, diagnostics: null,
    currentState: currentState({ batteries: [{ unit_battery_id: 9, health_percent: 90 }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(legacy.batteryHealthPlan.status, 'blocked_manual');
});

test('fingerprint diagnostic alone can target an existing fingerprint row but cannot invent one', async () => {
  const diagnostics = normalizeDiagnosticsObservation({ items: [{ key: 'fingerprint', state: 'Pass' }] });
  const existing = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState({ biometrics: [{ unit_biometric_id: 12, hardware_config_value_id: 501, test_result_config_value_id: null }] }),
    manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(existing.fingerprintTestPlan.status, 'applied');
  assert.equal(existing.fingerprintHardwarePlan.status, 'unchanged');

  const absentRow = await buildHardwareDiagnosticsPlan(connection(), {
    battery: null, camera: null, fingerprint: null, diagnostics,
    currentState: currentState(), manualSources: new Map(), latestToolValues: new Map()
  });
  assert.equal(absentRow.fingerprintHardwarePlan.status, 'none');
  assert.equal(absentRow.fingerprintTestPlan, null);
});
