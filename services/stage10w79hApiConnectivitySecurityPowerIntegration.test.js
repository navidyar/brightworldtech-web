'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79H extends the existing idempotent inventory transaction without a new API route', () => {
  const service = read('services/apiScalarInventory.js');
  assert.match(service, /normalizeConnectivityObservation\(body\.connectivity\)/);
  assert.match(service, /normalizeSecurityObservation\(body\.security\)/);
  assert.match(service, /normalizePowerObservation\(body\.power\)/);
  assert.match(service, /connectivitySecurityPowerObservation/);
});

test('Wi-Fi and Absolute reuse existing form-backed Unit Specification fields with manual precedence', () => {
  const service = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.match(service, /wifi_card_present_config_value_id/);
  assert.match(service, /absolute_status_config_value_id/);
  assert.match(service, /assessFieldOwnership/);
  assert.match(service, /active_cycle_manual_override/);
});

test('tool-only connectivity excludes network-address and transient network configuration noise', () => {
  const service = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.doesNotMatch(service, /mac_address|ip_addresses|dns_servers|gateways|connection_name/);
});

test('LTE IMEI, TPM, Secure Boot, keyboard backlight and observed adapter wattage remain backend-only fields while UUID routes to first-class identity', () => {
  const migration = read('scripts/migrateApiConnectivitySecurityPowerInventory.js');
  const inventory = read('services/apiScalarInventory.js');
  for (const name of ['lte_imei', 'secure_boot_state_code', 'tpm_version', 'keyboard_backlight_state_code', 'ac_adapter_wattage']) {
    assert.match(migration, new RegExp(name));
  }
  assert.doesNotMatch(migration, /system_uuid/);
  assert.match(inventory, /applyToolSystemUuidIdentifier/);
});

test('adapter warning foundation is optional and required adapter wattage is deliberately not inferred or stored', () => {
  const service = read('services/apiConnectivitySecurityPowerInventory.js');
  const migration = read('scripts/migrateApiConnectivitySecurityPowerInventory.js');
  assert.match(service, /bios_adapter_warning/);
  assert.match(migration, /bios_adapter_warning_message/);
  assert.doesNotMatch(migration, /required_adapter_wattage/);
});

test('keyboard backlight remains hardware evidence and does not alter Keyboard Test', () => {
  const service = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.match(service, /keyboard_backlight_state_code/);
  assert.doesNotMatch(service, /keyboard_test_result_config_value_id/);
});

test('migration is audit-first, additive only, and does not touch production or weighting', () => {
  const migration = read('scripts/migrateApiConnectivitySecurityPowerInventory.js');
  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /No database changes were made/);
  assert.doesNotMatch(migration, /DROP COLUMN|CREATE TRIGGER|production_cycle|unit_work_completions|production_weight/);
});

test('Stage 10W79H remains isolated from TechTools functional tests and wipe certificates', () => {
  const service = read('services/apiConnectivitySecurityPowerInventory.js');
  assert.doesNotMatch(service, /microphone_check|audio_output_check|camera_test|wipe_certificate|threat_protection/);
});
