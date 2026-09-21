'use strict';

const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const { resolveSystemConfigValue } = require('./apiConfigValueResolver');
const { assessFieldOwnership, valuesEquivalent } = require('./apiScalarInventoryPolicy');

const BATTERY_FIELD_KEY = 'battery_hardware';
const BATTERY_HEALTH_FIELD_KEY = 'battery_health';
const CAMERA_HARDWARE_FIELD_KEY = 'camera_hardware';
const FINGERPRINT_HARDWARE_FIELD_KEY = 'fingerprint_hardware';
const DIAGNOSTICS_FIELD_KEY = 'techtools_diagnostics';

const KEYBOARD_TEST_FIELD_KEY = 'keyboard_test';
const MICROPHONE_TEST_FIELD_KEY = 'microphone_check';
const AUDIO_TEST_FIELD_KEY = 'audio_output_check';
const BIOS_LOCK_FIELD_KEY = 'bios_lock';
const MDM_LOCK_FIELD_KEY = 'mdm_lock';
const DRIVER_CHECK_FIELD_KEY = 'driver_check';
const THREAT_PROTECTION_FIELD_KEY = 'virus_check';
const CAMERA_TEST_FIELD_KEY = 'camera_test';
const BIOMETRIC_HARDWARE_FIELD_KEY = 'biometric_hardware';
const BIOMETRICS_TEST_FIELD_KEY = 'biometrics_test';
const TOUCHSCREEN_TEST_FIELD_KEY = 'touchscreen_status';
const COMPLETE_DIAGNOSTICS_FIELD_KEY = 'complete_diagnostics';

const DIAGNOSTIC_STATES = new Set(['ready', 'running', 'pass', 'fail', 'warning', 'physically_not_present', 'locked', 'unlocked']);
const PRESENCE_STATES = new Set(['present', 'absent', 'unknown']);

function normalizeText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizePresence(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (typeof value === 'boolean') return value ? 'present' : 'unknown';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const explicit = normalizeText(value.state, 40).toLowerCase().replace(/[\s-]+/g, '_');
    if (explicit === 'unknown') return 'unknown';
    if (explicit === 'confirmed_absent') return 'absent';
    if (value.present === true || value.detected === true) return 'present';
    if (value.present === false || value.detected === false) return 'unknown';
    return normalizePresence(value.status ?? value.value ?? value.state);
  }
  const token = normalizeText(value, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (['present', 'yes', 'detected', 'installed', 'available', 'healthy'].includes(token)) return 'present';
  return 'unknown';
}

function normalizeHealthPercent(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('battery health_percent must be between 0 and 100.');
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function normalizeBatteryObservation(rawBattery) {
  if (rawBattery === undefined) return null;
  if (!rawBattery || typeof rawBattery !== 'object' || Array.isArray(rawBattery)) throw new Error('battery must be an object.');
  const state = normalizeText(rawBattery.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown', 'confirmed_absent'].includes(state)) throw new Error('battery.state must be known, confirmed_absent, or unknown.');
  if (state === 'unknown') return { fieldKey: BATTERY_FIELD_KEY, state, value: null };
  let presence = state === 'confirmed_absent' ? 'absent' : normalizePresence(rawBattery.detected ?? rawBattery.present ?? rawBattery);
  const healthPercent = presence === 'absent' ? null : normalizeHealthPercent(rawBattery.health_percent ?? rawBattery.healthPercent ?? rawBattery.overallHealth);
  if (presence === 'unknown' && healthPercent !== undefined) presence = 'present';
  return { fieldKey: BATTERY_FIELD_KEY, state: 'known', value: { presence, health_percent: healthPercent } };
}

function normalizeHardwarePresenceObservation(raw, fieldKey, label) {
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.length
      ? { fieldKey, state: 'known', value: { presence: 'present' } }
      : { fieldKey, state: 'unknown', value: null };
  }
  if (!raw || typeof raw !== 'object') {
    const presence = normalizePresence(raw);
    return presence === 'unknown' ? { fieldKey, state: 'unknown', value: null } : { fieldKey, state: 'known', value: { presence } };
  }
  const state = normalizeText(raw.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown', 'confirmed_absent'].includes(state)) throw new Error(`${label}.state must be known, confirmed_absent, or unknown.`);
  if (state === 'unknown') return { fieldKey, state, value: null };
  const presence = state === 'confirmed_absent' ? 'absent' : normalizePresence(raw);
  return { fieldKey, state: 'known', value: { presence } };
}

function normalizeCameraHardwareObservation(rawCamera) {
  return normalizeHardwarePresenceObservation(rawCamera, CAMERA_HARDWARE_FIELD_KEY, 'camera_hardware');
}

function normalizeFingerprintHardwareObservation(rawFingerprint) {
  return normalizeHardwarePresenceObservation(rawFingerprint, FINGERPRINT_HARDWARE_FIELD_KEY, 'fingerprint_hardware');
}

function normalizeDiagnosticState(value) {
  const token = normalizeText(value, 80).toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_');
  const aliases = {
    passed: 'pass',
    failed: 'fail'
  };
  const mapped = aliases[token] || token;
  return DIAGNOSTIC_STATES.has(mapped) ? mapped : '';
}

function normalizeDiagnosticItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Each diagnostics item must be an object.');
  const key = normalizeText(item.key, 80).toLowerCase();
  const state = normalizeDiagnosticState(item.state);
  if (!key) throw new Error('Each diagnostics item requires a key.');
  if (!state) throw new Error(`Diagnostic ${key} has an unsupported state.`);
  return {
    key,
    title: normalizeText(item.title, 160) || null,
    state,
    detail: normalizeText(item.detail, 2000) || null,
    devices: Array.isArray(item.devices) ? item.devices.slice(0, 20).map((device) => normalizeText(device?.name ?? device, 255)).filter(Boolean) : []
  };
}

function normalizeDiagnosticsObservation(rawDiagnostics) {
  if (rawDiagnostics === undefined) return null;
  const envelope = Array.isArray(rawDiagnostics) ? { items: rawDiagnostics } : rawDiagnostics;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('diagnostics must be an object or array.');
  const state = normalizeText(envelope.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('diagnostics.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: DIAGNOSTICS_FIELD_KEY, state, value: null };
  const items = Array.isArray(envelope.items) ? envelope.items.map(normalizeDiagnosticItem) : [];
  const unitResult = envelope.unit_result ?? envelope.unitResult;
  const overrideUsed = envelope.override_used ?? envelope.overrideUsed;
  if (!items.length && !unitResult && overrideUsed === undefined) return null;
  return {
    fieldKey: DIAGNOSTICS_FIELD_KEY,
    state: 'known',
    value: {
      unit_result: normalizeText(unitResult, 120) || null,
      override_used: Boolean(overrideUsed),
      items
    }
  };
}

function diagnosticCandidates(state, semantic) {
  if (state === 'pass') {
    if (semantic === 'driver') return ['Pass', 'Passed', 'No Issues', 'Clear', 'Good'];
    if (semantic === 'threat') return ['Pass', 'Passed', 'Clean', 'No Threats Found', 'Completed'];
    return ['Pass', 'Passed', 'Working', 'Good'];
  }
  if (state === 'fail') {
    if (semantic === 'driver') return ['Fail', 'Failed', 'Issues Found', 'Problems Found', 'Attention Required'];
    if (semantic === 'threat') return ['Fail', 'Failed', 'Threat Found', 'Threats Found'];
    return ['Fail', 'Failed', 'Not Working'];
  }
  if (semantic === 'lock' && state === 'locked') return ['Locked'];
  if (semantic === 'lock' && state === 'unlocked') return ['Unlocked'];
  if (state === 'physically_not_present') return ['Physically Not Present'];
  if (state === 'warning') return ['Warning'];
  return [];
}

async function resolveDiagnosticState(connection, item, systemConfigCategoryId, semantic = 'test') {
  if (!item || ['ready', 'running'].includes(item.state)) return { status: 'non_final', submitted: item?.state || null };
  const candidates = diagnosticCandidates(item.state, semantic);
  return resolveSystemConfigValue(connection, {
    systemConfigCategoryId,
    submitted: item.state,
    candidates
  });
}

function formPlan({ fieldKey, currentValue, resolution, manualSources, latestToolValues }) {
  if (!resolution || ['unknown', 'non_final'].includes(resolution.status)) return null;
  if (resolution.status !== 'resolved') {
    return { fieldKey, currentValue, desiredValue: currentValue, status: 'ignored_unknown', reason: resolution.status === 'ambiguous' ? 'catalog_value_ambiguous' : 'catalog_value_unmapped', storedValue: resolution };
  }
  const ownership = assessFieldOwnership({
    currentValue,
    sourceCode: manualSources.get(fieldKey) || '',
    hasLatestAppliedToolObservation: latestToolValues.has(fieldKey),
    latestAppliedToolValue: latestToolValues.get(fieldKey)
  });
  if (ownership === 'manual') return { fieldKey, currentValue, desiredValue: currentValue, status: 'blocked_manual', reason: 'active_cycle_manual_override', storedValue: resolution };
  if (ownership === 'protected_legacy') return { fieldKey, currentValue, desiredValue: currentValue, status: 'blocked_manual', reason: 'existing_value_not_tool_owned', storedValue: resolution };
  if (valuesEquivalent(currentValue, resolution.resolvedId)) return { fieldKey, currentValue, desiredValue: currentValue, status: 'unchanged', reason: 'already_current', storedValue: resolution };
  return { fieldKey, currentValue, desiredValue: resolution.resolvedId, status: 'applied', reason: 'latest_valid_tool_observation', storedValue: resolution };
}

async function loadCurrentHardwareDiagnosticsState(connection, unitId, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [specRows] = await connection.query(
    `SELECT us.unit_id,
            us.keyboard_test_result_config_value_id,
            us.microphone_check_result_config_value_id,
            us.audio_output_check_result_config_value_id,
            us.bios_lock_config_value_id,
            us.mdm_lock_config_value_id,
            us.driver_check_status_config_value_id,
            us.virus_check_status_config_value_id,
            us.touchscreen_status_config_value_id,
            us.complete_diagnostics_status_config_value_id,
            us.battery_hardware_state_code,
            us.battery_health_percent_observed,
            us.camera_hardware_state_code,
            us.fingerprint_hardware_state_code
       FROM unit_specifications us
      WHERE us.unit_id = ? LIMIT 1${suffix}`,
    [unitId]
  );
  if (!specRows[0]) return null;
  const [batteryRows] = await connection.query(`SELECT * FROM unit_batteries WHERE unit_id = ? ORDER BY unit_battery_id${suffix}`, [unitId]);
  const [cameraRows] = await connection.query(`SELECT * FROM unit_cameras WHERE unit_id = ? ORDER BY unit_camera_id${suffix}`, [unitId]);
  const [biometricRows] = await connection.query(`SELECT * FROM unit_biometrics WHERE unit_id = ? ORDER BY unit_biometric_id${suffix}`, [unitId]);
  return { specifications: specRows[0], batteries: batteryRows, cameras: cameraRows, biometrics: biometricRows };
}

function toolOnlyDesired(currentSpec, { battery, camera, fingerprint }) {
  const desired = { ...currentSpec };
  if (battery?.state === 'known' && battery.value.presence !== 'unknown') {
    desired.battery_hardware_state_code = battery.value.presence;
    if (battery.value.health_percent !== undefined) desired.battery_health_percent_observed = battery.value.health_percent;
    if (battery.value.presence === 'absent') desired.battery_health_percent_observed = null;
  }
  if (camera?.state === 'known' && camera.value.presence !== 'unknown') desired.camera_hardware_state_code = camera.value.presence;
  if (fingerprint?.state === 'known' && fingerprint.value.presence !== 'unknown') desired.fingerprint_hardware_state_code = fingerprint.value.presence;
  return desired;
}

function buildBatteryHealthPlan({ battery, currentRows, manualSources, latestToolValues }) {
  if (!battery || battery.state === 'unknown') return null;
  if (currentRows.length > 1) return { status: 'ignored_unknown', reason: 'multiple_battery_rows_ambiguous', desiredValue: null, currentValue: null, rowId: null };
  const currentValue = currentRows.length === 1 ? currentRows[0].health_percent : null;
  const rowId = currentRows.length === 1 ? Number(currentRows[0].unit_battery_id) : null;
  const ownership = assessFieldOwnership({
    currentValue,
    sourceCode: manualSources.get(BATTERY_HEALTH_FIELD_KEY) || '',
    hasLatestAppliedToolObservation: latestToolValues.has(BATTERY_HEALTH_FIELD_KEY),
    latestAppliedToolValue: latestToolValues.get(BATTERY_HEALTH_FIELD_KEY)
  });

  if (battery.value.presence === 'absent') {
    if (!currentRows.length) return { status: 'unchanged', reason: 'already_absent', desiredValue: null, currentValue, rowId };
    if (ownership === 'manual') return { status: 'blocked_manual', reason: 'active_cycle_manual_override', desiredValue: currentValue, currentValue, rowId };
    if (ownership === 'tool') return { status: 'delete', reason: 'tool_confirmed_battery_absent', desiredValue: null, currentValue, rowId };
    return { status: 'blocked_manual', reason: 'existing_value_not_tool_owned', desiredValue: currentValue, currentValue, rowId };
  }

  if (battery.value.health_percent === undefined || battery.value.health_percent === null) return null;
  if (ownership === 'manual') return { status: 'blocked_manual', reason: 'active_cycle_manual_override', desiredValue: currentValue, currentValue, rowId };
  if (ownership === 'protected_legacy') return { status: 'blocked_manual', reason: 'existing_value_not_tool_owned', desiredValue: currentValue, currentValue, rowId };
  const desiredValue = battery.value.health_percent;
  if (valuesEquivalent(currentValue, desiredValue)) return { status: 'unchanged', reason: 'already_current', desiredValue, currentValue, rowId };
  return { status: currentRows.length ? 'applied' : 'insert', reason: 'latest_valid_tool_observation', desiredValue, currentValue, rowId };
}

async function tableColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows;
}

async function insertMinimalRepeatableRow(connection, tableName, unitId, values) {
  const columns = await tableColumns(connection, tableName);
  const columnNames = new Set(columns.map((row) => row.COLUMN_NAME));
  const payload = { unit_id: unitId };
  for (const [key, value] of Object.entries(values)) if (columnNames.has(key)) payload[key] = value;
  if (columnNames.has('sort_order') && payload.sort_order === undefined) {
    const [rows] = await connection.query(`SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort FROM ${tableName} WHERE unit_id = ?`, [unitId]);
    payload.sort_order = Number(rows[0]?.next_sort || 10);
  }
  const requiredMissing = columns.filter((row) => (
    String(row.EXTRA || '').toLowerCase().indexOf('auto_increment') === -1
    && row.IS_NULLABLE === 'NO'
    && row.COLUMN_DEFAULT === null
    && payload[row.COLUMN_NAME] === undefined
  ));
  if (requiredMissing.length) return { inserted: false, reason: `required_columns:${requiredMissing.map((row) => row.COLUMN_NAME).join(',')}` };
  const names = Object.keys(payload);
  const placeholders = names.map(() => '?').join(', ');
  const [result] = await connection.query(`INSERT INTO ${tableName} (${names.join(', ')}) VALUES (${placeholders})`, names.map((name) => payload[name]));
  return { inserted: true, insertId: Number(result.insertId) || null };
}

async function resolveFingerprintHardware(connection) {
  return resolveSystemConfigValue(connection, {
    systemConfigCategoryId: SYSTEM_CONFIG_CATEGORY_IDS.BIOMETRIC_HARDWARE,
    submitted: 'Fingerprint Reader',
    candidates: ['Fingerprint', 'Fingerprint Reader', 'Fingerprint Sensor']
  });
}

async function buildHardwareDiagnosticsPlan(connection, {
  battery, camera, fingerprint, diagnostics, display = null, currentState, manualSources, latestToolValues
}) {
  const desiredSpec = toolOnlyDesired(currentState.specifications, { battery, camera, fingerprint });
  const formPlans = [];
  const diagnosticByKey = new Map((diagnostics?.value?.items || []).map((item) => [item.key, item]));
  const simple = [
    ['keyboard', KEYBOARD_TEST_FIELD_KEY, 'keyboard_test_result_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS, 'test'],
    ['sound', AUDIO_TEST_FIELD_KEY, 'audio_output_check_result_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS, 'test'],
    ['microphone', MICROPHONE_TEST_FIELD_KEY, 'microphone_check_result_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS, 'test'],
    ['bios-lock', BIOS_LOCK_FIELD_KEY, 'bios_lock_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES, 'lock'],
    ['mdm-lock', MDM_LOCK_FIELD_KEY, 'mdm_lock_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES, 'lock'],
    ['device-manager', DRIVER_CHECK_FIELD_KEY, 'driver_check_status_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES, 'driver'],
    ['antivirus', THREAT_PROTECTION_FIELD_KEY, 'virus_check_status_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES, 'threat'],
    ['touchscreen', TOUCHSCREEN_TEST_FIELD_KEY, 'touchscreen_status_config_value_id', SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES, 'test']
  ];
  for (const [diagnosticKey, fieldKey, columnName, categoryId, semantic] of simple) {
    const item = diagnosticByKey.get(diagnosticKey) || diagnosticByKey.get(diagnosticKey.replace(/-/g, '_'));
    if (!item) continue;
    const resolution = await resolveDiagnosticState(connection, item, categoryId, semantic);
    const plan = formPlan({ fieldKey, currentValue: currentState.specifications[columnName], resolution, manualSources, latestToolValues });
    if (plan) formPlans.push({ ...plan, columnName, diagnosticKey, diagnosticState: item.state });
  }

  const touchscreenDiagnostic = diagnosticByKey.get('touchscreen') || diagnosticByKey.get('touch_screen');
  const touchHardwareState = display?.state === 'known'
    ? display.value?.touchscreen_hardware_state_code
    : 'unknown';
  if (!touchscreenDiagnostic && touchHardwareState === 'absent') {
    const resolution = await resolveDiagnosticState(
      connection,
      { state: 'physically_not_present' },
      SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES,
      'test'
    );
    const plan = formPlan({
      fieldKey: TOUCHSCREEN_TEST_FIELD_KEY,
      currentValue: currentState.specifications.touchscreen_status_config_value_id,
      resolution,
      manualSources,
      latestToolValues
    });
    if (plan) {
      formPlans.push({
        ...plan,
        columnName: 'touchscreen_status_config_value_id',
        diagnosticKey: 'touchscreen',
        diagnosticState: 'physically_not_present',
        reason: plan.status === 'applied' ? 'confirmed_touchscreen_hardware_absent' : plan.reason
      });
    }
  }

  const overallDiagnosticState = normalizeDiagnosticState(diagnostics?.value?.unit_result);
  if (['pass', 'fail'].includes(overallDiagnosticState)) {
    const resolution = await resolveDiagnosticState(
      connection,
      { state: overallDiagnosticState },
      SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES,
      'test'
    );
    const plan = formPlan({
      fieldKey: COMPLETE_DIAGNOSTICS_FIELD_KEY,
      currentValue: currentState.specifications.complete_diagnostics_status_config_value_id,
      resolution,
      manualSources,
      latestToolValues
    });
    if (plan) {
      formPlans.push({
        ...plan,
        columnName: 'complete_diagnostics_status_config_value_id',
        diagnosticKey: 'unit_result',
        diagnosticState: overallDiagnosticState
      });
    }
  }

  let fingerprintResolution = null;
  const fingerprintDiagnostic = diagnosticByKey.get('fingerprint');
  const fingerprintPresence = fingerprint?.state === 'known' ? fingerprint.value.presence : 'unknown';
  if (['present', 'absent'].includes(fingerprintPresence) || fingerprintDiagnostic) {
    fingerprintResolution = await resolveFingerprintHardware(connection);
  }
  const fingerprintHardwarePlan = { status: 'none', reason: 'not_submitted', resolution: fingerprintResolution };
  if (fingerprintResolution?.status === 'resolved') {
    const matching = currentState.biometrics.filter((row) => Number(row.hardware_config_value_id) === Number(fingerprintResolution.resolvedId));
    fingerprintHardwarePlan.matchingRows = matching;
    const manualHardware = (manualSources.get(BIOMETRIC_HARDWARE_FIELD_KEY) || '') === 'manual_override';
    if (fingerprintPresence === 'present') {
      if (matching.length) {
        fingerprintHardwarePlan.status = 'unchanged'; fingerprintHardwarePlan.reason = 'fingerprint_row_present'; fingerprintHardwarePlan.row = matching[0];
      } else if (manualHardware) {
        fingerprintHardwarePlan.status = 'blocked_manual'; fingerprintHardwarePlan.reason = 'active_cycle_manual_override';
      } else {
        fingerprintHardwarePlan.status = 'insert'; fingerprintHardwarePlan.reason = 'tool_confirmed_fingerprint_present';
      }
    } else if (fingerprintPresence === 'absent' && matching.length) {
      const latestFingerprintId = Number(latestToolValues.get(BIOMETRIC_HARDWARE_FIELD_KEY));
      if (manualHardware) {
        fingerprintHardwarePlan.status = 'blocked_manual'; fingerprintHardwarePlan.reason = 'active_cycle_manual_override';
      } else if (Number.isSafeInteger(latestFingerprintId) && latestFingerprintId === Number(fingerprintResolution.resolvedId)) {
        fingerprintHardwarePlan.status = 'delete'; fingerprintHardwarePlan.reason = 'tool_confirmed_fingerprint_absent';
      } else {
        fingerprintHardwarePlan.status = 'blocked_manual'; fingerprintHardwarePlan.reason = 'existing_value_not_tool_owned';
      }
    } else if (fingerprintPresence === 'absent') {
      fingerprintHardwarePlan.status = 'unchanged'; fingerprintHardwarePlan.reason = 'already_absent';
    } else if (matching.length) {
      fingerprintHardwarePlan.status = 'unchanged'; fingerprintHardwarePlan.reason = 'fingerprint_row_present'; fingerprintHardwarePlan.row = matching[0];
    }
  }

  let cameraTestPlan = null;
  const cameraDiagnostic = diagnosticByKey.get('camera');
  if (cameraDiagnostic) {
    if (currentState.cameras.length === 1) {
      const resolution = await resolveDiagnosticState(connection, cameraDiagnostic, SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS, 'component');
      cameraTestPlan = formPlan({ fieldKey: CAMERA_TEST_FIELD_KEY, currentValue: currentState.cameras[0].test_result_config_value_id, resolution, manualSources, latestToolValues });
      if (cameraTestPlan) cameraTestPlan.rowId = Number(currentState.cameras[0].unit_camera_id);
    } else {
      cameraTestPlan = { status: 'ignored_unknown', reason: currentState.cameras.length ? 'multiple_camera_rows_ambiguous' : 'camera_row_not_configured' };
    }
  }

  let fingerprintTestPlan = null;
  if (fingerprintDiagnostic && fingerprintResolution?.status === 'resolved') {
    const matching = currentState.biometrics.filter((row) => Number(row.hardware_config_value_id) === Number(fingerprintResolution.resolvedId));
    if (matching.length === 1 || (matching.length === 0 && fingerprintHardwarePlan.status === 'insert')) {
      const resolution = await resolveDiagnosticState(connection, fingerprintDiagnostic, SYSTEM_CONFIG_CATEGORY_IDS.COMPONENT_TEST_RESULTS, 'component');
      const currentValue = matching.length === 1 ? matching[0].test_result_config_value_id : null;
      fingerprintTestPlan = formPlan({ fieldKey: BIOMETRICS_TEST_FIELD_KEY, currentValue, resolution, manualSources, latestToolValues });
      if (fingerprintTestPlan) {
        fingerprintTestPlan.rowId = matching.length === 1 ? Number(matching[0].unit_biometric_id) : null;
        fingerprintTestPlan.pendingFingerprintInsert = matching.length === 0;
      }
    }
  }

  return {
    desiredSpec,
    formPlans,
    batteryHealthPlan: buildBatteryHealthPlan({ battery, currentRows: currentState.batteries, manualSources, latestToolValues }),
    fingerprintHardwarePlan,
    cameraTestPlan,
    fingerprintTestPlan,
    diagnosticByKey
  };
}

async function applyHardwareDiagnosticsPlan(connection, unitId, plan) {
  const spec = plan.desiredSpec;
  const assignments = [
    ['battery_hardware_state_code', spec.battery_hardware_state_code],
    ['battery_health_percent_observed', spec.battery_health_percent_observed],
    ['camera_hardware_state_code', spec.camera_hardware_state_code],
    ['fingerprint_hardware_state_code', spec.fingerprint_hardware_state_code]
  ];
  await connection.query(
    `UPDATE unit_specifications SET ${assignments.map(([column]) => `${column} = ?`).join(', ')} WHERE unit_id = ?`,
    [...assignments.map(([, value]) => value ?? null), unitId]
  );

  for (const formField of plan.formPlans) {
    if (formField.status === 'applied') await connection.query(`UPDATE unit_specifications SET ${formField.columnName} = ? WHERE unit_id = ?`, [formField.desiredValue, unitId]);
  }

  if (plan.batteryHealthPlan?.status === 'applied') {
    await connection.query('UPDATE unit_batteries SET health_percent = ? WHERE unit_id = ? AND unit_battery_id = ?', [plan.batteryHealthPlan.desiredValue, unitId, plan.batteryHealthPlan.rowId || null]);
  } else if (plan.batteryHealthPlan?.status === 'delete' && plan.batteryHealthPlan.rowId) {
    await connection.query('DELETE FROM unit_batteries WHERE unit_id = ? AND unit_battery_id = ?', [unitId, plan.batteryHealthPlan.rowId]);
    plan.batteryHealthPlan.status = 'applied';
  } else if (plan.batteryHealthPlan?.status === 'insert') {
    plan.batteryHealthPlan.insertResult = await insertMinimalRepeatableRow(connection, 'unit_batteries', unitId, { health_percent: plan.batteryHealthPlan.desiredValue });
    if (!plan.batteryHealthPlan.insertResult.inserted) {
      plan.batteryHealthPlan.status = 'ignored_unknown';
      plan.batteryHealthPlan.reason = 'battery_form_row_not_created';
    } else {
      plan.batteryHealthPlan.status = 'applied';
      plan.batteryHealthPlan.reason = 'tool_created_single_battery_row';
    }
  }

  if (plan.fingerprintHardwarePlan.status === 'insert' && plan.fingerprintHardwarePlan.resolution?.status === 'resolved') {
    const result = await insertMinimalRepeatableRow(connection, 'unit_biometrics', unitId, { hardware_config_value_id: plan.fingerprintHardwarePlan.resolution.resolvedId });
    plan.fingerprintHardwarePlan.insertResult = result;
    plan.fingerprintHardwarePlan.status = result.inserted ? 'applied' : 'ignored_unknown';
    plan.fingerprintHardwarePlan.reason = result.inserted ? 'tool_created_fingerprint_row' : 'fingerprint_form_row_not_created';
    if (result.inserted) {
      plan.fingerprintHardwarePlan.rowId = result.insertId;
      if (plan.fingerprintTestPlan?.pendingFingerprintInsert) plan.fingerprintTestPlan.rowId = result.insertId;
    }
  }
  if (plan.fingerprintHardwarePlan.status === 'delete' && Array.isArray(plan.fingerprintHardwarePlan.matchingRows)) {
    const rowIds = plan.fingerprintHardwarePlan.matchingRows.map((row) => Number(row.unit_biometric_id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (rowIds.length) {
      await connection.query(`DELETE FROM unit_biometrics WHERE unit_id = ? AND unit_biometric_id IN (${rowIds.map(() => '?').join(', ')})`, [unitId, ...rowIds]);
      plan.fingerprintHardwarePlan.status = 'applied';
    }
  }

  if (plan.cameraTestPlan?.status === 'applied' && plan.cameraTestPlan.rowId) {
    await connection.query('UPDATE unit_cameras SET test_result_config_value_id = ? WHERE unit_id = ? AND unit_camera_id = ?', [plan.cameraTestPlan.desiredValue, unitId, plan.cameraTestPlan.rowId]);
  }

  if (plan.fingerprintTestPlan?.status === 'applied' && plan.fingerprintTestPlan.rowId) {
    await connection.query('UPDATE unit_biometrics SET test_result_config_value_id = ? WHERE unit_id = ? AND unit_biometric_id = ?', [plan.fingerprintTestPlan.desiredValue, unitId, plan.fingerprintTestPlan.rowId]);
  }
}

function currentToolSnapshot(state) {
  const spec = state?.specifications || {};
  return {
    battery_hardware_state_code: spec.battery_hardware_state_code ?? 'unknown',
    battery_health_percent_observed: spec.battery_health_percent_observed ?? null,
    camera_hardware_state_code: spec.camera_hardware_state_code ?? 'unknown',
    fingerprint_hardware_state_code: spec.fingerprint_hardware_state_code ?? 'unknown'
  };
}

function sectionToolSnapshot(state, fieldKey) {
  const tool = currentToolSnapshot(state);
  if (fieldKey === BATTERY_FIELD_KEY) return {
    battery_hardware_state_code: tool.battery_hardware_state_code,
    battery_health_percent_observed: tool.battery_health_percent_observed
  };
  if (fieldKey === CAMERA_HARDWARE_FIELD_KEY) return { camera_hardware_state_code: tool.camera_hardware_state_code };
  if (fieldKey === FINGERPRINT_HARDWARE_FIELD_KEY) return { fingerprint_hardware_state_code: tool.fingerprint_hardware_state_code };
  return {};
}

function summary(state) {
  const tool = currentToolSnapshot(state);
  const parts = [];
  if (tool.battery_hardware_state_code !== 'unknown') parts.push(`Battery ${tool.battery_hardware_state_code}${tool.battery_health_percent_observed !== null ? ` (${tool.battery_health_percent_observed}% health)` : ''}`);
  if (tool.camera_hardware_state_code !== 'unknown') parts.push(`Camera ${tool.camera_hardware_state_code}`);
  if (tool.fingerprint_hardware_state_code !== 'unknown') parts.push(`Fingerprint ${tool.fingerprint_hardware_state_code}`);
  return parts.join('; ') || 'Unknown';
}

module.exports = {
  BATTERY_FIELD_KEY,
  BATTERY_HEALTH_FIELD_KEY,
  CAMERA_HARDWARE_FIELD_KEY,
  FINGERPRINT_HARDWARE_FIELD_KEY,
  DIAGNOSTICS_FIELD_KEY,
  KEYBOARD_TEST_FIELD_KEY,
  MICROPHONE_TEST_FIELD_KEY,
  AUDIO_TEST_FIELD_KEY,
  BIOS_LOCK_FIELD_KEY,
  MDM_LOCK_FIELD_KEY,
  DRIVER_CHECK_FIELD_KEY,
  THREAT_PROTECTION_FIELD_KEY,
  CAMERA_TEST_FIELD_KEY,
  BIOMETRIC_HARDWARE_FIELD_KEY,
  BIOMETRICS_TEST_FIELD_KEY,
  TOUCHSCREEN_TEST_FIELD_KEY,
  COMPLETE_DIAGNOSTICS_FIELD_KEY,
  normalizeBatteryObservation,
  normalizeCameraHardwareObservation,
  normalizeFingerprintHardwareObservation,
  normalizeDiagnosticsObservation,
  normalizeDiagnosticState,
  resolveDiagnosticState,
  loadCurrentHardwareDiagnosticsState,
  buildHardwareDiagnosticsPlan,
  applyHardwareDiagnosticsPlan,
  currentToolSnapshot,
  sectionToolSnapshot,
  summary
};
