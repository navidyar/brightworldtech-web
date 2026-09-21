'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W79E extends the existing inventory transaction with memory rather than adding a parallel endpoint', () => {
  const routes = read('routes/api.js');
  const service = read('services/apiScalarInventory.js');
  assert.match(routes, /router\.post\('\/units\/commit'/);
  assert.doesNotMatch(routes, /\/units\/:unitId\/inventory\/:reportId/);
  assert.match(service, /normalizeMemoryObservation/);
  assert.match(service, /resolveMemoryObservation/);
  assert.match(service, /memoryObservation/);
});

test('memory ingestion uses current BWTDallas module rows and existing RAM type configuration', () => {
  const memory = read('services/apiMemoryInventory.js');
  assert.match(memory, /FROM unit_memory_modules/);
  assert.match(memory, /SYSTEM_CONFIG_CATEGORY_IDS\.RAM_TYPES/);
  assert.match(memory, /INSERT INTO unit_memory_modules/);
  assert.doesNotMatch(memory, /INSERT\s+INTO\s+config_values/i);
});

test('current memory is Tool-authoritative and TechTools has final authority over ScanTools', () => {
  const memory = read('services/apiMemoryInventory.js');
  assert.match(memory, /tool_authoritative_memory_configuration/);
  assert.match(memory, /techtools_current_memory_is_final/);
  assert.match(memory, /unchanged/);
  assert.match(memory, /details_only/);
  assert.match(memory, /speed_mhz/);
});

test('manual memory component changes immediately invalidate unchanged stale speed in the database safeguard', () => {
  const migration = read('scripts/migrateApiMemoryInventory.js');
  assert.match(migration, /BEFORE UPDATE ON unit_memory_modules/);
  assert.match(migration, /NEW\.speed_mhz <=> OLD\.speed_mhz/);
  assert.match(migration, /SET NEW\.speed_mhz = NULL/);
  assert.match(migration, /ram_type_config_value_id/);
  assert.match(migration, /memory_install_type_code/);
});

test('memory observations remain one immutable run observation and unknown never erases current data', () => {
  const service = read('services/apiScalarInventory.js');
  const memory = read('services/apiMemoryInventory.js');
  assert.match(service, /resolvedMemoryObservation\.fieldKey/);
  assert.match(service, /INSERT INTO unit_tool_observations/);
  assert.match(memory, /unknown_does_not_overwrite/);
  assert.match(service, /unit_tool_observations/);
});

test('Stage 10W79E remains isolated from production credit, weighting, Lot movement, completion, and Storage', () => {
  const service = read('services/apiMemoryInventory.js');
  assert.doesNotMatch(service, /production_cycle|production_weight|unit_work_completions|start_new_production_cycle_on_move/);
  assert.doesNotMatch(service, /unit_storage_devices|unit_graphics_adapters/);
});
