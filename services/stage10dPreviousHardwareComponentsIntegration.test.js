'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Stage 10D migration creates verified dedicated Previous component tables', () => {
  const sql = read('sql/2026-08-stage-10d-previous-hardware-components.sql');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS unit_previous_memory_modules/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS unit_previous_storage_devices/);
  assert.match(sql, /refusing destructive replacement/);
  assert.match(sql, /idx_unit_previous_memory_modules_unit_sort/);
  assert.match(sql, /idx_unit_previous_storage_devices_unit_sort/);
  assert.match(sql, /FOREIGN KEY \(unit_id\) REFERENCES units \(unit_id\) ON DELETE CASCADE/);
  assert.match(sql, /memory_install_type_code IN \(''removable_module'', ''integrated_soldered'', ''unknown''\)/);
  assert.match(sql, /latest retired Current snapshot/);
  assert.match(sql, /FROM unit_memory_modules WHERE is_current = 0/);
  assert.match(sql, /FROM unit_storage_devices WHERE is_current = 0/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM unit_previous_memory_modules/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM unit_previous_storage_devices/);
});

test('Previous component values are parsed, validated, loaded, and saved independently', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /getMemoryModulesFromRequest\(req, 'previousMemoryModules'\)/);
  assert.match(controller, /getStorageDevicesFromRequest\(req, 'previousStorageDevices'\)/);
  assert.match(controller, /validateMemoryModules\(validationFormData, 'previousMemoryModules'/);
  assert.match(controller, /validateStorageDevices\(validationFormData, 'previousStorageDevices'/);
  assert.match(model, /listPreviousMemoryModulesForUnit/);
  assert.match(model, /listPreviousStorageDevicesForUnit/);
  assert.match(model, /getNormalizedPreviousMemoryModules/);
  assert.match(model, /getNormalizedPreviousStorageDevices/);
  assert.match(model, /saveUnitPreviousMemoryModules/);
  assert.match(model, /saveUnitPreviousStorageDevices/);

  const allowedTablesMatch = model.match(/const allowedTables = \[(?<tables>[\s\S]*?)\];/);
  assert.ok(allowedTablesMatch, 'Runtime table-inspection allowlist must exist.');
  assert.match(allowedTablesMatch.groups.tables, /'unit_previous_memory_modules'/);
  assert.match(allowedTablesMatch.groups.tables, /'unit_previous_storage_devices'/);
});

test('Previous totals synchronize from Previous rows without entering Current requirement totals', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const script = read('public/js/tech-unit-form.js');

  assert.match(markup, /data-previous-memory-total-input/);
  assert.match(markup, /data-previous-storage-total-input/);
  assert.match(markup, /data-unit-form-follows-key="previous_memory_size"/);
  assert.match(markup, /data-unit-form-field-key="memory_modules" data-unit-form-repeatable-type="memory"/);
  assert.match(markup, /data-unit-form-field-key="storage_devices" data-unit-form-repeatable-type="storage"/);
  assert.match(script, /previousMemoryTotal/);
  assert.match(script, /previousStorageTotal/);
  assert.match(script, /sourceType: 'previousMemory',[\s\S]*targetType: 'memory'/);
  assert.match(script, /sourceType: 'previousStorage',[\s\S]*targetType: 'storage'/);
});

test('Stage 10D apply, check, and validation commands are wired', () => {
  const applyScript = read('scripts/apply-stage-10d-previous-hardware-components.sh');
  const checkScript = read('scripts/check-stage-10d-previous-hardware-components.sh');
  const validationRunner = read('scripts/runStage10dPreviousHardwareComponentsValidation.sh');
  const packageJson = read('package.json');
  const readme = read('README.md');

  assert.match(applyScript, /2026-08-stage-10d-previous-hardware-components\.sql/);
  assert.match(applyScript, /15:4:3:3:0:15:5:4:1:0/);
  assert.match(checkScript, /unit_previous_memory_modules/);
  assert.match(checkScript, /unit_previous_storage_devices/);
  assert.match(validationRunner, /stage10dPreviousHardwareComponentsIntegration\.test\.js/);
  assert.match(packageJson, /validate:previous-hardware-components/);
  assert.match(readme, /npm run validate:previous-hardware-components/);
  assert.match(readme, /Only after the dry run succeeds cleanly/);
});
