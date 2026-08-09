'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergePreservedMemoryDetails,
  mergePreservedStorageDetails
} = require('./componentDetailPreservation');

test('memory optional details are preserved only for a matching positive-size row', () => {
  const stored = new Map([[12, {
    speed_mhz: 3200,
    manufacturer_name: 'Example Memory',
    part_number: 'PN-1',
    serial_number: 'SN-1',
    change_notes: 'Legacy note'
  }]]);
  const row = {
    componentRowId: 12,
    slotLabel: 'Slot 1',
    sizeGb: 16,
    ramTypeConfigValueId: 4,
    memoryInstallTypeCode: 'removable_module'
  };

  assert.deepEqual(mergePreservedMemoryDetails(row, stored), {
    ...row,
    speedMhz: 3200,
    manufacturerName: 'Example Memory',
    partNumber: 'PN-1',
    serialNumber: 'SN-1',
    changeNotes: 'Legacy note'
  });
  assert.equal(mergePreservedMemoryDetails({ ...row, componentRowId: 99 }, stored).manufacturerName, undefined);
  assert.equal(mergePreservedMemoryDetails({ ...row, sizeGb: 0 }, stored).manufacturerName, undefined);
});

test('current storage keeps submitted wipe status while preserving unsupported details', () => {
  const stored = new Map([[31, {
    manufacturer_name: 'Example Storage',
    model_number: 'MODEL-1',
    serial_number: 'DRIVE-1',
    firmware_version: 'FW1',
    wipe_status_config_value_id: 8,
    change_notes: 'Legacy storage note'
  }]]);
  const row = {
    componentRowId: 31,
    slotLabel: 'Drive 1',
    sizeGb: 512,
    storageTypeConfigValueId: 7,
    wipeStatusConfigValueId: 10
  };
  const result = mergePreservedStorageDetails(row, stored, { includeWipeStatus: true });

  assert.equal(result.manufacturerName, 'Example Storage');
  assert.equal(result.modelNumber, 'MODEL-1');
  assert.equal(result.wipeStatusConfigValueId, 10);
});

test('previous storage preserves its existing hidden wipe status without submitting it', () => {
  const stored = new Map([[44, {
    manufacturer_name: null,
    model_number: null,
    serial_number: null,
    firmware_version: null,
    wipe_status_config_value_id: 6,
    change_notes: null
  }]]);
  const row = {
    componentRowId: 44,
    slotLabel: 'Drive 1',
    sizeGb: 256,
    storageTypeConfigValueId: 3,
    wipeStatusConfigValueId: null
  };

  assert.equal(mergePreservedStorageDetails(row, stored).wipeStatusConfigValueId, 6);
  assert.equal(mergePreservedStorageDetails({ ...row, sizeGb: 0 }, stored).wipeStatusConfigValueId, null);
});
