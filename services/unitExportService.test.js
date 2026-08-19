'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyUnitExportColumnSelection,
  buildFilteredUnitExportDataset,
  buildUnitExportRow,
  combineRemarks
} = require('./unitExportService');
const { DEFAULT_UNIT_EXPORT_COLUMNS, UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');

function sampleUnit(overrides = {}) {
  return {
    unitId: 101,
    assetTag: 'BWT12345',
    categoryLabel: 'Laptop',
    manufacturerLabel: 'Dell',
    modelLabel: 'Latitude 5440',
    screenSizeLabel: '14-inch',
    modelYear: 2023,
    processorLabel: 'Intel Core i5-1355U',
    processorShortForm: 'i5-13th',
    previousRamGb: 8,
    ramGb: 16,
    previousStorageGb: 256,
    storageGb: 512,
    assignedToName: 'Anna Radnaeva',
    batteryHealthPercent: 87.5,
    hardwareNotes: 'Legacy hardware note',
    cosmeticNotes: '',
    ...overrides
  };
}

function sampleDetails() {
  return {
    identifiers: [
      { typeCode: 'unit_serial_number', value: 'UNIT-SERIAL-1' },
      { typeCode: 'bios_serial_number', value: 'BIOS-SERIAL-1' }
    ],
    previousMemoryModules: [
      { slotLabel: 'Slot 1', sizeGb: 8, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' }
    ],
    memoryModules: [
      { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
      { slotLabel: 'Slot 2', sizeGb: 0 }
    ],
    previousStorageDevices: [
      { slotLabel: 'Bay 1', sizeGb: 256, storageTypeLabel: 'SATA SSD' }
    ],
    storageDevices: [
      { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD', wipeStatusLabel: 'Passed' }
    ],
    memoryTotalGb: 16,
    storageTotalGb: 512,
    currentGrade: { gradeLabel: 'B' },
    currentOutcome: { outcomeLabel: 'Pass' },
    hardwareIssues: [{ issueLabel: 'Keyboard', severityLabel: 'Minor', locationLabel: 'Top', issueRemark: 'Missing key cap' }],
    cosmeticIssues: [{ issueLabel: 'Scratch', locationLabel: 'Lid', issueRemark: 'Two-inch scratch' }],
    latestTech: { name: 'Fallback Tech' }
  };
}

test('the established 24 export columns remain selected by default while new Specs / Tests columns stay optional', () => {
  assert.equal(UNIT_EXPORT_COLUMNS.length, 57);
  assert.deepEqual(DEFAULT_UNIT_EXPORT_COLUMNS.map((column) => column.label), [
    'Asset Tag', 'Unit Serial Number', 'BIOS Serial / Recovery Number', 'Unit Type',
    'Manufacturer', 'Model', 'CPU', 'Short Form',
    'Previous Memory Size', 'Current Memory Size',
    'Previous Storage Size', 'Current Storage Size',
    'Previous Memory Modules', 'Current Memory Modules', 'Memory Module Changes',
    'Previous Storage Devices', 'Current Storage Devices', 'Storage Device Changes',
    'Tech Name', 'Battery Health', 'Cosmetic Grade', 'Pass / Fail',
    'Hardware Remarks', 'Cosmetic Remarks'
  ]);
  assert.equal(DEFAULT_UNIT_EXPORT_COLUMNS.length, 24);
  assert.equal(DEFAULT_UNIT_EXPORT_COLUMNS.some((column) => column.key === 'threatProtectionScan'), false);
  assert.equal(DEFAULT_UNIT_EXPORT_COLUMNS.some((column) => column.key === 'cameras'), false);
});

test('export row preserves established Unit data while adding optional Specs / Tests columns', () => {
  const row = buildUnitExportRow(sampleUnit(), sampleDetails());

  assert.deepEqual({
    assetTag: row.assetTag,
    unitSerialNumber: row.unitSerialNumber,
    biosSerialNumber: row.biosSerialNumber,
    unitType: row.unitType,
    manufacturer: row.manufacturer,
    model: row.model,
    screenSize: row.screenSize,
    modelYear: row.modelYear,
    cpu: row.cpu,
    shortForm: row.shortForm,
    currentMemorySize: row.currentMemorySize,
    currentStorageSize: row.currentStorageSize,
    techName: row.techName,
    batteryHealth: row.batteryHealth,
    cosmeticGrade: row.cosmeticGrade,
    passFail: row.passFail,
    hardwareRemarks: row.hardwareRemarks,
    cosmeticRemarks: row.cosmeticRemarks
  }, {
    assetTag: 'BWT12345',
    unitSerialNumber: 'UNIT-SERIAL-1',
    biosSerialNumber: 'BIOS-SERIAL-1',
    unitType: 'Laptop',
    manufacturer: 'Dell',
    model: 'Latitude 5440',
    screenSize: '14-inch',
    modelYear: '',
    cpu: 'Intel Core i5-1355U',
    shortForm: 'i5-13th',
    currentMemorySize: '16GB',
    currentStorageSize: '512GB',
    techName: 'Anna Radnaeva',
    batteryHealth: '87.5%',
    cosmeticGrade: 'B',
    passFail: 'Pass',
    hardwareRemarks: 'Legacy hardware note | Keyboard · Minor · Top: Missing key cap',
    cosmeticRemarks: 'Scratch · Lid: Two-inch scratch'
  });
  assert.equal(row.threatProtectionScan, '');
  assert.equal(row.cameras, '');
  assert.equal(row.portsExpansion, '');
});

test('Model Year exports only for Apple units', () => {
  const row = buildUnitExportRow(sampleUnit({ manufacturerLabel: 'Apple', modelYear: 2023 }), sampleDetails());
  assert.equal(row.modelYear, '2023');
});

test('filtered export reuses Unit Browser permissions and filters while forcing all matching rows', async () => {
  let receivedFilters = null;
  const dataset = await buildFilteredUnitExportDataset({
    search: 'BWT12345', techUserId: '77', restrictToCurrentAssignment: true,
    currentUserId: 77, qcReviewFilter: 'accepted', page: '4', perPage: '10'
  }, {
    techUnitModel: {
      async listTechUnits(filters) {
        receivedFilters = filters;
        return { supported: true, units: [sampleUnit()], pagination: { totalRows: 1 }, filters };
      }
    },
    unitExpandedDetailModel: {
      async listExpandedDetailsForUnits(unitIds) {
        assert.deepEqual(unitIds, [101]);
        return new Map([[101, sampleDetails()]]);
      }
    }
  });

  assert.equal(receivedFilters.search, 'BWT12345');
  assert.equal(receivedFilters.techUserId, '77');
  assert.equal(receivedFilters.restrictToCurrentAssignment, true);
  assert.equal(receivedFilters.currentUserId, 77);
  assert.equal(receivedFilters.qcReviewFilter, 'accepted');
  assert.equal(receivedFilters.page, '1');
  assert.equal(receivedFilters.perPage, 'all');
  assert.equal(dataset.totalRows, 1);
  assert.equal(dataset.rows[0].shortForm, 'i5-13th');
  assert.deepEqual(dataset.capacityTotals, {
    previousMemoryGb: 8,
    currentMemoryGb: 16,
    previousStorageGb: 256,
    currentStorageGb: 512,
    previousMemoryRecordedUnits: 1,
    currentMemoryRecordedUnits: 1,
    previousStorageRecordedUnits: 1,
    currentStorageRecordedUnits: 1
  });
});

test('filtered export stops when browser count and loaded row count disagree', async () => {
  await assert.rejects(() => buildFilteredUnitExportDataset({}, {
    techUnitModel: {
      async listTechUnits() {
        return { supported: true, units: [sampleUnit()], pagination: { totalRows: 2 } };
      }
    },
    unitExpandedDetailModel: { async listExpandedDetailsForUnits() { return new Map(); } }
  }), (error) => error && error.code === 'BWT_UNIT_EXPORT_COUNT_MISMATCH');
});

test('duplicate remark text is exported only once', () => {
  assert.equal(combineRemarks('Battery failed', [
    { issueRemark: 'Battery failed' },
    { issueLabel: 'Port', issueRemark: 'Loose USB-C port' }
  ]), 'Battery failed | Port: Loose USB-C port');
});

test('filtered export records readable scope labels for the XLSX Export Scope sheet', async () => {
  const dataset = await buildFilteredUnitExportDataset({
    lotId: '9', categoryId: '12', gradeFilter: 'grade:21', qcReviewFilter: 'accepted',
    techUserId: '77', createdStartDate: '2026-07-01', createdEndDate: '2026-07-31',
    unitState: 'active', sort: 'qc_status_desc'
  }, {
    techUnitModel: {
      async listTechUnits(filters) {
        return {
          supported: true,
          units: [],
          pagination: { totalRows: 0 },
          filters,
          lots: [{ lot_id: 9, name: 'July Laptops' }],
          unitCategories: [{ id: 12, label: 'Laptop' }],
          gradeFilterOptions: [{ id: 21, filterValue: 'grade:21', label: 'B' }],
          techUserOptions: [{ id: 77, label: 'Anna Radnaeva' }]
        };
      }
    },
    unitExpandedDetailModel: { async listExpandedDetailsForUnits() { return new Map(); } }
  });
  const scope = Object.fromEntries(dataset.scope.map((entry) => [entry.label, entry.value]));

  assert.equal(scope.Lot, 'July Laptops');
  assert.equal(scope['Unit Type'], 'Laptop');
  assert.equal(scope['Cosmetic Grade'], 'B');
  assert.equal(scope['QC Status'], 'Accepted First Pass');
  assert.equal(scope['Tech Name'], 'Anna Radnaeva');
  assert.equal(scope.Sort, 'QC Priority First');
});


test('selected export columns preserve the approved contract order and add the selection to scope', () => {
  const dataset = {
    columns: require('../config/unitExportContract').UNIT_EXPORT_COLUMNS,
    rows: [{ assetTag: 'BWT1', cpu: 'Intel Core i5-1355U', batteryHealth: '87.5%' }],
    totalRows: 1,
    scope: [{ label: 'Unit State', value: 'Active Units' }]
  };
  const selected = applyUnitExportColumnSelection(dataset, 'batteryHealth,assetTag,cpu', { selectionProvided: true });

  assert.deepEqual(selected.columns.map((column) => column.key), ['assetTag', 'cpu', 'batteryHealth']);
  assert.equal(selected.rows, dataset.rows);
  assert.match(selected.scope.at(-1).value, new RegExp(`^3 of ${require('../config/unitExportContract').UNIT_EXPORT_COLUMNS.length}: Asset Tag, CPU, Battery Health$`));
});

test('missing column selection selects every available export column by default', () => {
  const dataset = { columns: [], rows: [], totalRows: 0, scope: [] };
  const selected = applyUnitExportColumnSelection(dataset, undefined, { selectionProvided: false });

  assert.equal(selected.columns.length, 24);
  assert.equal(selected.columns.some((column) => column.key === 'memoryModuleChanges'), true);
  assert.equal(selected.columns.some((column) => column.key === 'storageDeviceChanges'), true);
  assert.equal(selected.columns.some((column) => column.key === 'screenSize'), false);
  assert.equal(selected.columns.some((column) => column.key === 'modelYear'), false);
});

test('legacy Memory Size and Storage Size column keys map to the current values', () => {
  const dataset = {
    columns: require('../config/unitExportContract').UNIT_EXPORT_COLUMNS,
    rows: [],
    totalRows: 0,
    scope: []
  };
  const selected = applyUnitExportColumnSelection(dataset, 'memorySize,storageSize', { selectionProvided: true });

  assert.deepEqual(selected.columns.map((column) => column.key), ['currentMemorySize', 'currentStorageSize']);
});

test('an explicitly empty export selection is rejected', () => {
  const dataset = {
    columns: require('../config/unitExportContract').UNIT_EXPORT_COLUMNS,
    rows: [],
    totalRows: 0,
    scope: []
  };

  assert.throws(
    () => applyUnitExportColumnSelection(dataset, '', { selectionProvided: true }),
    (error) => error && error.code === 'BWT_UNIT_EXPORT_COLUMNS_REQUIRED'
  );
});
