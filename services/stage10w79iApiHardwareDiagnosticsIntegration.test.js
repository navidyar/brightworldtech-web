'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79I extends the existing idempotent inventory transaction without a new route', () => {
  const scalar = read('services/apiScalarInventory.js');
  assert.match(scalar, /normalizeBatteryObservation\(body\.battery\)/);
  assert.match(scalar, /normalizeDiagnosticsObservation\(body\.diagnostics\)/);
  assert.match(scalar, /hardwareDiagnosticsObservation/);
  assert.doesNotMatch(read('routes/api.js'), /test-results/);
});

test('hardware detection remains separate from functional camera and fingerprint test results', () => {
  const service = read('services/apiHardwareDiagnosticsInventory.js');
  assert.match(service, /camera_hardware_state_code/);
  assert.match(service, /fingerprint_hardware_state_code/);
  assert.match(service, /cameraTestPlan/);
  assert.match(service, /fingerprintTestPlan/);
});

test('TechTools transient states remain historical-only while retired uncertainty states are not accepted as form results', () => {
  const service = read('services/apiHardwareDiagnosticsInventory.js');
  assert.match(service, /ready/);
  assert.match(service, /running/);
  assert.match(service, /non_final/);
  for (const retired of ['could_not_determine', 'not_tested', 'not_applicable', 'test_not_available', 'not_available']) {
    assert.doesNotMatch(service, new RegExp(`['\"]${retired}['\"]`));
  }
});

test('override use is retained but the actual override code is deliberately not stored', () => {
  const service = read('services/apiHardwareDiagnosticsInventory.js');
  assert.match(service, /override_used/);
  assert.doesNotMatch(service, /override_code/);
});

test('existing form-backed test fields are reused instead of adding duplicate API-only test columns', () => {
  const service = read('services/apiHardwareDiagnosticsInventory.js');
  for (const column of [
    'keyboard_test_result_config_value_id', 'microphone_check_result_config_value_id',
    'audio_output_check_result_config_value_id', 'bios_lock_config_value_id', 'mdm_lock_config_value_id', 'driver_check_status_config_value_id',
    'virus_check_status_config_value_id', 'test_result_config_value_id'
  ]) assert.match(service, new RegExp(column));
  assert.doesNotMatch(read('scripts/migrateApiHardwareDiagnosticsInventory.js'), /keyboard_test_result|camera_test_result|microphone_check_result/);
});

test('Stage 10W79I does not reintroduce retired Physical Camera Status and only maps explicit final overall diagnostics', () => {
  const service = read('services/apiHardwareDiagnosticsInventory.js');
  const migration = read('scripts/migrateApiHardwareDiagnosticsInventory.js');
  assert.doesNotMatch(service, /physical_camera_status/);
  assert.doesNotMatch(migration, /physical_camera_status/);
  assert.match(service, /complete_diagnostics_status_config_value_id/);
  assert.match(service, /normalizeDiagnosticState\(diagnostics\?\.value\?\.unit_result\)/);
  assert.match(service, /\['pass', 'fail'\]\.includes\(overallDiagnosticState\)/);
});

test('configuration resolution now uses numeric system category bindings rather than removed category codes', () => {
  const resolver = read('services/apiConfigValueResolver.js');
  const connectivity = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.match(resolver, /system_config_categories/);
  assert.match(resolver, /system_config_category_id = \?/);
  assert.doesNotMatch(connectivity, /config_categories cc/);
  assert.match(connectivity, /SYSTEM_CONFIG_CATEGORY_IDS\.YES_NO_OPTIONS/);
  assert.match(connectivity, /SYSTEM_CONFIG_CATEGORY_IDS\.ABSOLUTE_STATUSES/);
});

test('migration is audit-first and adds only four tool-current summary columns', () => {
  const migration = read('scripts/migrateApiHardwareDiagnosticsInventory.js');
  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /No database changes were made/);
  for (const column of ['battery_hardware_state_code', 'battery_health_percent_observed', 'camera_hardware_state_code', 'fingerprint_hardware_state_code']) {
    assert.match(migration, new RegExp(column));
  }
  assert.doesNotMatch(migration, /CREATE TRIGGER|DROP COLUMN/);
});

test('Stage 10W79I remains isolated from wipe evidence Unit Details Lot policy production cycles and weighting', () => {
  const combined = [
    read('services/apiHardwareDiagnosticsInventory.js'),
    read('scripts/migrateApiHardwareDiagnosticsInventory.js')
  ].join('\n');
  assert.doesNotMatch(combined, /wipe_certificate|unit_storage_wipe_certificates|lot_tool_policy|production_cycle|production_weight/);
  assert.doesNotMatch(combined, /views\/|tech-unit-details/);
});
