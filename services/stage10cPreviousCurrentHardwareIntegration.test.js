'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildUnitAuditSnapshot } = require('./unitAuditSnapshot');
const { buildCapacityTotals, buildUnitExportRow } = require('./unitExportService');
const { DEFAULT_UNIT_EXPORT_COLUMNS, UNIT_EXPORT_COLUMN_LABELS } = require('../config/unitExportContract');
const { getLotRequirementField } = require('../config/lotRequirementRegistry');
const { getUnitFormFieldDefinition } = require('../config/unitFormFieldRegistry');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('previous hardware fields are persisted, validated, audited, and visible in Add/Edit', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const details = read('views/fragments/tech-units-table.ejs');
  const duplicateModal = read('views/fragments/tech-unit-duplicate-modal.ejs');

  assert.match(controller, /previousRamGb: getComponentCapacityTotalGb\(previousMemoryModules, req\.body\.previousRamGb\)/);
  assert.match(controller, /previousStorageGb: getComponentCapacityTotalGb\(previousStorageDevices, req\.body\.previousStorageGb\)/);
  assert.match(controller, /Previous memory size must be a non-negative whole number/);
  assert.match(controller, /Previous storage size must be a non-negative whole number/);
  assert.match(model, /addColumn\('previous_ram_gb'/);
  assert.match(model, /addColumn\('previous_storage_gb'/);
  assert.match(form, /type="hidden"[\s\S]*?name="previousRamGb"[\s\S]*?data-previous-memory-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="previousStorageGb"[\s\S]*?data-previous-storage-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="ramGb"[\s\S]*?data-memory-total-input/);
  assert.match(form, /type="hidden"[\s\S]*?name="storageGb"[\s\S]*?data-storage-total-input/);
  assert.match(details, /<dt>Previous Memory<\/dt>/);
  assert.match(details, /<dt>Current Storage<\/dt>/);
  assert.match(duplicateModal, /'previousRamGb'/);
  assert.match(duplicateModal, /'previousStorageGb'/);
});

test('Lot Requirements remain current-only while Previous sections support visibility and optional/required form configuration', () => {
  const previousMemory = getUnitFormFieldDefinition('previous_memory_size');
  const previousStorage = getUnitFormFieldDefinition('previous_storage_size');

  assert.equal(previousMemory.visibilityConfigurable, true);
  assert.equal(previousMemory.requirementConfigurable, true);
  assert.equal(previousStorage.visibilityConfigurable, true);
  assert.equal(previousStorage.requirementConfigurable, true);
  assert.equal(getLotRequirementField('ram_gb').label, 'Current Memory Size');
  assert.equal(getLotRequirementField('storage_gb').label, 'Current Storage Size');
  assert.equal(getLotRequirementField('previous_memory_size'), null);
  assert.equal(getLotRequirementField('previous_storage_size'), null);
});

test('Unit History records previous and current values separately', () => {
  const snapshot = buildUnitAuditSnapshot({
    previousRamGb: '8',
    ramGb: '16',
    previousStorageGb: '256',
    storageGb: '512',
    memoryModules: [],
    storageDevices: []
  }, {});

  assert.equal(snapshot.previous_memory_size.text, '8GB');
  assert.equal(snapshot.current_memory_size.text, '16GB');
  assert.equal(snapshot.previous_storage_size.text, '256GB');
  assert.equal(snapshot.current_storage_size.text, '512GB');
});

test('export contract preserves four hardware capacity columns and defaults component detail to selected', () => {
  assert.deepEqual(UNIT_EXPORT_COLUMN_LABELS.slice(8, 12), [
    'Previous Memory Size',
    'Current Memory Size',
    'Previous Storage Size',
    'Current Storage Size'
  ]);
  assert.equal(UNIT_EXPORT_COLUMN_LABELS.length, 24);
  assert.equal(DEFAULT_UNIT_EXPORT_COLUMNS.length, 24);
  assert.deepEqual(UNIT_EXPORT_COLUMN_LABELS.slice(12, 18), [
    'Previous Memory Modules',
    'Current Memory Modules',
    'Memory Module Changes',
    'Previous Storage Devices',
    'Current Storage Devices',
    'Storage Device Changes'
  ]);

  const row = buildUnitExportRow({
    previousRamGb: 8,
    ramGb: 16,
    previousStorageGb: 256,
    storageGb: 512
  }, { identifiers: [], memoryTotalGb: 16, storageTotalGb: 512 });

  assert.equal(row.previousMemorySize, '8GB');
  assert.equal(row.currentMemorySize, '16GB');
  assert.equal(row.previousStorageSize, '256GB');
  assert.equal(row.currentStorageSize, '512GB');
});

test('previous and current totals are calculated independently and never combined', () => {
  const totals = buildCapacityTotals([
    { unitId: 1, previousRamGb: 8, ramGb: 16, previousStorageGb: 256, storageGb: 512 },
    { unitId: 2, previousRamGb: 16, ramGb: 16, previousStorageGb: '', storageGb: 256 }
  ], new Map([
    [1, { memoryTotalGb: 16, storageTotalGb: 512 }],
    [2, { memoryTotalGb: 16, storageTotalGb: 256 }]
  ]));

  assert.deepEqual(totals, {
    previousMemoryGb: 24,
    currentMemoryGb: 32,
    previousStorageGb: 256,
    currentStorageGb: 768,
    previousMemoryRecordedUnits: 2,
    currentMemoryRecordedUnits: 2,
    previousStorageRecordedUnits: 1,
    currentStorageRecordedUnits: 2
  });
  assert.equal(Object.prototype.hasOwnProperty.call(totals, 'combinedMemoryGb'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(totals, 'combinedStorageGb'), false);
});

test('migration derives previous column types from live current columns and refuses destructive rollback', () => {
  const sql = read('sql/2026-07-stage-10c-previous-current-hardware.sql');
  const applyScript = read('scripts/apply-stage-10c-previous-current-hardware.sh');
  const rollbackScript = read('scripts/rollback-stage-10c-previous-current-hardware.sh');

  assert.match(sql, /SELECT COLUMN_TYPE INTO ram_type/);
  assert.match(sql, /SELECT COLUMN_TYPE INTO storage_type/);
  assert.match(sql, /previous_ram_gb/);
  assert.match(sql, /previous_storage_gb/);
  assert.match(sql, /chk_units_previous_ram_gb/);
  assert.match(sql, /chk_units_previous_storage_gb/);
  assert.match(applyScript, /previous_column\.COLUMN_TYPE = current_column\.COLUMN_TYPE/);
  assert.doesNotMatch(applyScript, /MYSQL_ROOT_PASSWORD|-u root/);
  assert.match(rollbackScript, /rollback refused/);
});

test('export preview keeps separate previous/current columns without aggregate modal totals', () => {
  const preview = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const contract = read('config/unitExportContract.js');
  const fileService = read('services/unitExportFileService.js');

  assert.doesNotMatch(preview, /unit-export-capacity-totals/);
  assert.match(contract, /previousMemorySize/);
  assert.match(contract, /currentMemorySize/);
  assert.match(contract, /previousStorageSize/);
  assert.match(contract, /currentStorageSize/);
  assert.match(fileService, /Previous Memory Total/);
  assert.match(fileService, /Current Storage Total/);
});
