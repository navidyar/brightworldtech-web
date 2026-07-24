'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const lotModelPath = require.resolve('./lotModel');
const validationModelPath = require.resolve('./lotValidationModel');

const storedRequirements = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: { query: async () => { throw new Error('Unexpected default pool query.'); } } }
};
require.cache[lotModelPath] = {
  id: lotModelPath,
  filename: lotModelPath,
  loaded: true,
  exports: { listLotRequirements: async () => storedRequirements }
};
delete require.cache[validationModelPath];

const {
  buildLotValidationReport,
  listUnitSnapshotsForLot
} = require('./lotValidationModel');

function createQueuedConnection(resultSets) {
  const queue = [...resultSets];
  const calls = [];

  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (queue.length === 0) {
        throw new Error('Unexpected query.');
      }

      return [queue.shift()];
    }
  };
}

function sampleBaseRow() {
  return {
    unit_id: 10,
    asset_number: 1234,
    lot_id: 7,
    created_at: '2026-06-01T12:00:00Z',
    unit_category_config_value_id: 7,
    unit_category_label: 'Laptop',
    manufacturer_id: 1,
    manufacturer_name: 'Dell',
    unit_model_id: 40,
    model_display_label: 'Dell · Latitude 5400',
    processor_model_id: 55,
    processor_display_label: 'Intel · Core i5 · i5-8365U',
    ram_gb: 8,
    ram_type_config_value_id: 70,
    ram_type_label: 'DDR4',
    storage_gb: 256,
    storage_type_config_value_id: 80,
    storage_type_label: 'NVMe'
  };
}


function noActiveOverrideQueryResults() {
  return [
    [{ config_value_id: 100 }],
    [{ config_value_id: 104 }],
    { affectedRows: 0 },
    [{ config_value_id: 100 }],
    [{ config_value_id: 104 }],
    { affectedRows: 0 },
    []
  ];
}

test('normalized reader loads identifiers, current memory, and current storage in batches', async () => {
  const connection = createQueuedConnection([
    [sampleBaseRow()],
    [{ unit_id: 10, identifier_type_code: 'unit_serial_number', identifier_value: 'SER-10', is_primary: 0 }],
    [{ unit_id: 10, size_gb: 16, ram_type_config_value_id: 70, ram_type_label: 'DDR4' }],
    [{ unit_id: 10, size_gb: 512, storage_type_config_value_id: 80, storage_type_label: 'NVMe' }],
    [{
      unit_id: 10,
      user_id: 4,
      first_name: 'Taylor',
      last_name: 'Tech',
      activity_type: 'completion',
      activity_at: '2026-07-01T12:00:00Z'
    }]
  ]);

  const snapshots = await listUnitSnapshotsForLot(7, connection);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].label, 'BWT1234');
  assert.equal(snapshots[0].valuesByKey.ram_gb.numberValue, 16);
  assert.equal(snapshots[0].valuesByKey.storage_gb.numberValue, 512);
  assert.equal(snapshots[0].technicianSummary, 'Taylor Tech');
  assert.equal(connection.calls.length, 5);
  assert.deepEqual(connection.calls[0].values, [7, 250]);
  assert.deepEqual(connection.calls[1].values, [10]);
  assert.deepEqual(connection.calls[4].values, [10, 10]);
});

test('validation report uses stored catalog IDs and returns accepted counts', async () => {
  storedRequirements.splice(0, storedRequirements.length, {
    lot_requirement_id: 1,
    requirement_key: 'model',
    requirement_label: 'Model',
    operator_code: 'equals',
    operator_label: 'Must equal',
    unit_model_id: 40,
    required_value: 'Dell · Latitude 5400',
    is_active: 1
  });
  const connection = createQueuedConnection([
    [sampleBaseRow()],
    [],
    [],
    [],
    [],
    ...noActiveOverrideQueryResults()
  ]);

  const report = await buildLotValidationReport(7, connection);

  assert.equal(report.unitsChecked, 1);
  assert.equal(report.acceptedCount, 1);
  assert.equal(report.needsReviewCount, 0);
  assert.equal(report.units[0].checks[0].sourceLabel, 'Unit model');
});

test('incomplete legacy requirement values remain visible as Needs Review', async () => {
  storedRequirements.splice(0, storedRequirements.length, {
    lot_requirement_id: 2,
    requirement_key: 'model',
    requirement_label: 'Model',
    operator_code: 'equals',
    operator_label: 'Must equal',
    unit_model_id: null,
    required_value: '',
    is_active: 1
  });
  const connection = createQueuedConnection([
    [sampleBaseRow()],
    [],
    [],
    [],
    [],
    ...noActiveOverrideQueryResults()
  ]);

  const report = await buildLotValidationReport(7, connection);

  assert.equal(report.needsReviewCount, 1);
  assert.equal(report.units[0].status, 'needs_review');
  assert.match(report.units[0].checks[0].message, /missing its configured catalog value/i);
});
