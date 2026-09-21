'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79G extends the existing idempotent inventory transaction with graphics and display', () => {
  const service = read('services/apiScalarInventory.js');
  assert.match(service, /normalizeGraphicsObservation\(body\.graphics\)/);
  assert.match(service, /normalizeDisplayObservation\(body\.display\)/);
  assert.match(service, /graphicsObservation: graphicsResult/);
  assert.match(service, /displayObservation: displayResult/);
});

test('Graphics completes the dormant tool-managed foundation instead of adding graphics fields to the Unit form', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.match(graphics, /unit_graphics_adapters/);
  assert.match(graphics, /gpu_vendor/);
  assert.match(graphics, /gpu_model/);
  assert.match(graphics, /vram_mb/);
  assert.match(graphics, /gpu_role_code/);
  assert.match(graphics, /vram_source/);
  assert.doesNotMatch(graphics, /tech-unit-form|views\/fragments/);
});

test('Graphics accepts top-level customer capability only and excludes driver/PnP/display-mode noise', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.doesNotMatch(graphics, /installedDisplayDrivers|pnpDeviceId|colorDepth|dacType|videoMode|configManagerErrorCode/);
});

test('VRAM provenance is preserved because ScanTools VRAM can be measured or inferred', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.match(graphics, /vram_source/);
  assert.match(graphics, /memory_source/);
});

test('built-in screen values update existing form-backed fields only when the panel is confirmed internal', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.match(graphics, /panel\.confidence === 'confirmed'/);
  assert.match(graphics, /screen_size_config_value_id/);
  assert.match(graphics, /native_screen_resolution_config_value_id/);
  assert.match(graphics, /manual_screen_size_override/);
  assert.match(graphics, /manual_native_resolution_override/);
});

test('touchscreen hardware presence stays separate from the functional test while confirmed absence may map to Physically Not Present', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  const diagnostics = read('services/apiHardwareDiagnosticsInventory.js');
  const migration = read('scripts/migrateApiGraphicsDisplayInventory.js');
  assert.match(graphics, /touchscreen_hardware_state_code/);
  assert.match(migration, /touchscreen_hardware_state_code/);
  assert.doesNotMatch(graphics, /touchscreen_status_config_value_id/);
  assert.match(diagnostics, /touchscreen_status_config_value_id/);
  assert.match(diagnostics, /confirmed_touchscreen_hardware_absent/);
});

test('possible touchscreen evidence stays possible instead of becoming Pass, Fail, Yes, or No', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.match(graphics, /possible_hardware_evidence/);
  assert.match(graphics, /\['present', 'absent', 'possible', 'unknown'\]/);
});

test('migration is audit-first and only evolves the dormant graphics/detail schema plus hardware-state storage', () => {
  const migration = read('scripts/migrateApiGraphicsDisplayInventory.js');
  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /No database changes were made/);
  assert.match(migration, /unit_graphics_adapters/);
  assert.match(migration, /unit_specifications/);
  assert.doesNotMatch(migration, /CREATE TRIGGER|production_cycle|unit_work_completions/);
});

test('Stage 10W79G remains isolated from connectivity, power, tests, wipe certificates, production credit and weighting', () => {
  const graphics = read('services/apiGraphicsDisplayInventory.js');
  assert.doesNotMatch(graphics, /imei|secure_boot|tpm|adapter_wattage|wipe_certificate|production_weight|production_cycle|unit_work_completions/);
});
