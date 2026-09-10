'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('API exposes one authenticated idempotent scalar inventory route', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.put\('\/units\/:unitId\/inventory\/:reportId', requireApiAuth, requireUnitApiAccess, apiUnitController\.ingestScalarInventory\)/);
});

test('Stage 10W79C scalar foundation remains present while later stages may add safe scalar fields', () => {
  const policy = read('services/apiScalarInventoryPolicy.js');
  assert.match(policy, /processor_speed_ghz/);
  assert.match(policy, /bios_version/);
  assert.match(policy, /os_build/);
  assert.doesNotMatch(policy, /memory_modules|storage_devices|graphics_adapters/);
});

test('manual Tech edits and unknown observations are protected before any scalar write', () => {
  const policy = read('services/apiScalarInventoryPolicy.js');
  const service = read('services/apiScalarInventory.js');
  assert.match(policy, /sourceCode[\s\S]*tech_edit|tech_edit[\s\S]*sourceCode/);
  assert.match(policy, /unknown_does_not_overwrite/);
  assert.match(service, /loadManualSources/);
  assert.match(service, /loadLatestAppliedToolValues/);
});

test('tool runs and immutable per-field observations are stored transactionally and idempotently', () => {
  const service = read('services/apiScalarInventory.js');
  const migration = read('scripts/migrateApiScalarInventory.js');
  assert.match(service, /await connection\.beginTransaction\(\)/);
  assert.match(service, /INSERT INTO unit_tool_runs/);
  assert.match(service, /INSERT INTO unit_tool_observations/);
  assert.match(service, /tool_source = \? AND report_id = \?/);
  assert.match(service, /await connection\.commit\(\)/);
  assert.match(service, /await connection\.rollback\(\)/);
  assert.match(migration, /UNIQUE KEY uq_unit_tool_observations_run_field \(tool_run_id, field_key\)/);
});

test('tool changes use the existing Unit audit event pipeline and do not touch production workflows', () => {
  const service = read('services/apiScalarInventory.js');
  assert.match(service, /buildUnitFormAuditEvent/);
  assert.match(service, /source: `api_\$\{toolSource\}`/);
  assert.match(service, /unitAuditEventModel\.createUnitAuditEvent/);
  assert.doesNotMatch(service, /production_cycle|production_weight|unit_work_completions|start_new_production_cycle_on_move/);
});
