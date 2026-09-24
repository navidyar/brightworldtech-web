'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79F extends the existing inventory transaction with storage instead of adding another endpoint', () => {
  const routes = read('routes/api.js');
  const service = read('services/apiScalarInventory.js');
  assert.match(routes, /router\.post\('\/units\/commit'/);
  assert.doesNotMatch(routes, /\/units\/:unitId\/inventory\/:reportId/);
  assert.match(service, /normalizeStorageObservation/);
  assert.match(service, /resolveStorageObservation/);
  assert.match(service, /storageObservation/);
});

test('storage ingestion reuses current BWTDallas storage rows and existing configured Storage Types', () => {
  const storage = read('services/apiStorageInventory.js');
  assert.match(storage, /FROM unit_storage_devices/);
  assert.match(storage, /SYSTEM_CONFIG_CATEGORY_IDS\.STORAGE_TYPES/);
  assert.match(storage, /is_current = 1/);
  assert.doesNotMatch(storage, /INSERT\s+INTO\s+config_values/i);
});

test('storage accepts only the selected top-level device evidence and excludes partitions, volumes, networking, and PnP payloads', () => {
  const storage = read('services/apiStorageInventory.js');
  for (const field of ['raw_size_bytes', 'storage_interface', 'media_type', 'model_number', 'serial_number', 'firmware_version', 'health_status', 'storage_install_type_code']) {
    assert.match(storage, new RegExp(field));
  }
  assert.doesNotMatch(storage, /partitions|volumes|free_bytes|mac_address|pnp_device_id/i);
});

test('current storage is Tool-authoritative and TechTools has final authority over ScanTools', () => {
  const storage = read('services/apiStorageInventory.js');
  assert.match(storage, /tool_authoritative_storage_configuration/);
  assert.match(storage, /techtools_current_storage_is_final/);
  assert.match(storage, /unchanged/);
  assert.match(storage, /details_only/);
});

test('physical drive identity change preserves the old row as history and does not carry wipe status to the replacement', () => {
  const storage = read('services/apiStorageInventory.js');
  assert.match(storage, /physicalIdentityChanged/);
  assert.match(storage, /SET is_current = 0/);
  assert.match(storage, /wipeStatusConfigValueId: null/);
  assert.doesNotMatch(storage, /DELETE FROM unit_storage_devices/);
});

test('manual Storage size/type edits receive a root-installed stale-detail safeguard without granting app-user trigger privileges', () => {
  const migration = read('scripts/migrateApiStorageInventory.js');
  assert.match(migration, /trg_storage_clear_stale_details_before_update/);
  assert.match(migration, /Root-only safeguard still required/);
  assert.doesNotMatch(migration, /CREATE TRIGGER/);
  assert.doesNotMatch(migration, /log_bin_trust_function_creators|SUPER privilege/i);
});

test('storage Tool rows synchronize the shared Unit summary consumed by downstream presentation surfaces', () => {
  const service = read('services/apiScalarInventory.js');
  const storage = read('services/apiStorageInventory.js');
  assert.match(storage, /async function syncStorageSummary/);
  assert.match(storage, /storage_gb = \?, storage_type_config_value_id = \?/);
  assert.match(service, /syncStorageSummary\(connection, safeUnitId, afterStorageRows/);
});

test('storage observations are immutable run observations and Unknown never erases current data', () => {
  const service = read('services/apiScalarInventory.js');
  const storage = read('services/apiStorageInventory.js');
  assert.match(service, /resolvedStorageObservation\.fieldKey/);
  assert.match(service, /INSERT INTO unit_tool_observations/);
  assert.match(storage, /unknown_does_not_overwrite/);
});

test('Stage 10W79F remains isolated from production credit, weighting, Lot movement, completion, Graphics, and wipe certificates', () => {
  const storage = read('services/apiStorageInventory.js');
  assert.doesNotMatch(storage, /production_cycle|production_weight|unit_work_completions|start_new_production_cycle_on_move/);
  assert.doesNotMatch(storage, /unit_graphics_adapters|wipe_certificates/);
});
