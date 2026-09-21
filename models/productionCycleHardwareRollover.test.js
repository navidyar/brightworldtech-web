'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const productionCycleSource = fs.readFileSync(require.resolve('./productionCycleModel.js'), 'utf8');
const techUnitSource = fs.readFileSync(require.resolve('./techUnitModel.js'), 'utf8');

test('production-cycle rollover copies old Current Memory/Storage to Previous and resets Current', () => {
  assert.match(productionCycleSource, /async function rolloverCurrentHardwareToPrevious/);
  assert.match(productionCycleSource, /FROM unit_memory_modules[\s\S]*is_current = 1/);
  assert.match(productionCycleSource, /INSERT INTO unit_previous_memory_modules/);
  assert.match(productionCycleSource, /UPDATE unit_memory_modules SET \$\{memoryReset\.join\(', '\)\}/);
  assert.match(productionCycleSource, /FROM unit_storage_devices[\s\S]*is_current = 1/);
  assert.match(productionCycleSource, /INSERT INTO unit_previous_storage_devices/);
  assert.match(productionCycleSource, /previous_ram_gb = ram_gb/);
  assert.match(productionCycleSource, /ram_gb = NULL/);
  assert.match(productionCycleSource, /previous_storage_gb = storage_gb/);
  assert.match(productionCycleSource, /storage_gb = NULL/);
  assert.match(productionCycleSource, /DELETE FROM unit_field_sources[\s\S]*'memory_modules', 'storage_devices'/);
});

test('Tech Unit lot move performs rollover before submitted hardware can be written', () => {
  const rolloverIndex = techUnitSource.indexOf('rolloverCurrentHardwareToPrevious({');
  const payloadIndex = techUnitSource.indexOf("buildWritePayload(persistedFormData, currentUserId, 'update'");
  assert.ok(rolloverIndex > 0);
  assert.ok(payloadIndex > rolloverIndex);
  assert.match(techUnitSource, /excludedCycleHardwareFields = new Set\(\[[\s\S]*'previous_memory_size'[\s\S]*'memory_modules'[\s\S]*'previous_storage_size'[\s\S]*'storage_devices'/);
  assert.match(techUnitSource, /saveUnitModuleRows\(connection, unitId, persistedFormData, currentUserId\)/);
});

test('recordLotMove reuses a prepared cycle plan and does not roll hardware twice', () => {
  assert.match(productionCycleSource, /const plan = productionCyclePlan \|\| await planLotMoveProductionCycle/);
  assert.match(productionCycleSource, /plan\.startsNewProductionCycle && !hardwareRolloverPrepared/);
});
