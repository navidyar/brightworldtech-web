'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const zlib = require('node:zlib');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const {
  buildCsvBuffer,
  buildUnitExportFilename,
  buildXlsxWorkbookBuffer,
  parseBatteryHealthPercentage
} = require('./unitExportFileService');

function sampleDataset(overrides = {}) {
  return {
    columns: UNIT_EXPORT_COLUMNS,
    rows: [
      {
        assetTag: 'BWT2300001',
        unitSerialNumber: '0012345',
        biosSerialNumber: '=unsafe',
        unitType: 'Laptop',
        manufacturer: 'Dell',
        model: 'Latitude 5440',
        cpu: 'Intel Core i5-1355U',
        shortForm: 'i5-13th',
        previousMemorySize: '8 GB',
        currentMemorySize: '16 GB',
        previousStorageSize: '256 GB',
        currentStorageSize: '512 GB',
        previousMemoryModules: 'Slot 1: 8GB · DDR4',
        currentMemoryModules: 'Slot 1: 16GB · DDR4\nSlot 2: 0GB · Empty slot',
        memoryModuleChanges: 'Slot 1 — Changed: 8GB · DDR4 → 16GB · DDR4',
        previousStorageDevices: 'Bay 1: 256GB · SATA SSD',
        currentStorageDevices: 'Bay 1: 512GB · NVMe SSD',
        storageDeviceChanges: 'Bay 1 — Changed: 256GB · SATA SSD → 512GB · NVMe SSD',
        techName: 'Anna Radnaeva',
        batteryHealth: '87.5%',
        cosmeticGrade: 'B',
        passFail: 'Pass',
        hardwareRemarks: 'Keyboard: Missing key, requires repair',
        cosmeticRemarks: 'Line one\nLine two'
      }
    ],
    totalRows: 1,
    browserTotalRows: 1,
    filters: { unitState: 'active', sort: 'date_desc' },
    capacityTotals: {
      previousMemoryGb: 8, currentMemoryGb: 16,
      previousStorageGb: 256, currentStorageGb: 512,
      previousMemoryRecordedUnits: 1, currentMemoryRecordedUnits: 1,
      previousStorageRecordedUnits: 1, currentStorageRecordedUnits: 1
    },
    scope: [
      { label: 'Unit State', value: 'Active Units' },
      { label: 'Search', value: 'BWT2300001' }
    ],
    ...overrides
  };
}

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;

  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 8 ? zlib.inflateRawSync(compressedData) : compressedData;

    entries.set(name, content);
    offset = dataStart + compressedSize;
  }

  return entries;
}

test('CSV exports UTF-8 BOM, all approved columns, quoted multiline values, and formula-safe text', () => {
  const csv = buildCsvBuffer(sampleDataset()).toString('utf8');

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^\ufeff"Asset Tag","Unit Serial Number","BIOS Serial Number"/);
  assert.match(csv, /"BWT2300001","0012345","'=unsafe"/);
  assert.match(csv, /"Keyboard: Missing key, requires repair"/);
  assert.match(csv, /"Line one\nLine two"/);
  assert.ok(csv.endsWith('\r\n'));
});

test('XLSX contains the Units and Export Scope sheets with frozen headers, filters, and typed battery percentage', () => {
  const workbook = buildXlsxWorkbookBuffer(sampleDataset(), {
    now: new Date('2026-07-31T15:30:00.000Z')
  });
  const entries = readZipEntries(workbook);

  assert.equal(workbook.subarray(0, 2).toString('ascii'), 'PK');
  assert.deepEqual([...entries.keys()].sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/app.xml',
    'docProps/core.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml'
  ]);

  const workbookXml = entries.get('xl/workbook.xml').toString('utf8');
  const unitsXml = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const scopeXml = entries.get('xl/worksheets/sheet2.xml').toString('utf8');
  const stylesXml = entries.get('xl/styles.xml').toString('utf8');

  assert.match(workbookXml, /sheet name="Units"/);
  assert.match(workbookXml, /sheet name="Export Scope"/);
  assert.match(unitsXml, /pane ySplit="1"/);
  assert.match(unitsXml, /autoFilter ref="A1:X2"/);
  assert.match(unitsXml, /<c r="T2" s="4"><v>0\.875<\/v><\/c>/);
  assert.match(unitsXml, />=unsafe<\/t>/);
  assert.match(unitsXml, /Line one\nLine two/);
  assert.match(unitsXml, /<col min="13" max="13" width="36" customWidth="1"\/>/);
  assert.match(unitsXml, /<col min="15" max="15" width="42" customWidth="1"\/>/);
  assert.match(unitsXml, /<c r="M2" s="3" t="inlineStr">/);
  assert.match(unitsXml, /Slot 2: 0GB · Empty slot/);
  assert.match(scopeXml, /Matching Units/);
  assert.match(scopeXml, /Previous Memory Total/);
  assert.match(scopeXml, /Current Storage Total/);
  assert.match(scopeXml, /BWT2300001/);
  assert.match(stylesXml, /formatCode="0\.0%"/);
});

test('XLSX exports one worksheet row for every matching Unit plus the header', () => {
  const rows = Array.from({ length: 73 }, (_, index) => ({
    ...sampleDataset().rows[0],
    assetTag: `BWT${String(index + 1).padStart(7, '0')}`
  }));
  const entries = readZipEntries(buildXlsxWorkbookBuffer(sampleDataset({ rows, totalRows: rows.length })));
  const unitsXml = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
  const worksheetRows = unitsXml.match(/<row\b/g) || [];

  assert.equal(worksheetRows.length, 74);
  assert.match(unitsXml, /dimension ref="A1:X74"/);
});

test('filenames use the Dallas export date and distinguish parked exports', () => {
  const now = new Date('2026-08-01T02:30:00.000Z');

  assert.equal(buildUnitExportFilename('csv', { unitState: 'active' }, now), 'bwtdallas-units-2026-07-31.csv');
  assert.equal(buildUnitExportFilename('xlsx', { unitState: 'parked' }, now), 'bwtdallas-units-parked-2026-07-31.xlsx');
});

test('Battery Health is converted to an Excel numeric percentage only when valid', () => {
  assert.equal(parseBatteryHealthPercentage('87.5%'), 0.875);
  assert.equal(parseBatteryHealthPercentage('100.0%'), 1);
  assert.equal(parseBatteryHealthPercentage(''), null);
  assert.equal(parseBatteryHealthPercentage('Not recorded'), null);
});

test('CSV and XLSX include only the selected columns while preserving approved order and column-specific formatting', () => {
  const selectedColumns = UNIT_EXPORT_COLUMNS.filter((column) => (
    ['assetTag', 'batteryHealth', 'hardwareRemarks'].includes(column.key)
  ));
  const dataset = sampleDataset({ columns: selectedColumns });
  const csv = buildCsvBuffer(dataset).toString('utf8');
  const entries = readZipEntries(buildXlsxWorkbookBuffer(dataset));
  const unitsXml = entries.get('xl/worksheets/sheet1.xml').toString('utf8');

  assert.match(csv, /^\ufeff"Asset Tag","Battery Health","Hardware Remarks"/);
  assert.doesNotMatch(csv, /Unit Serial Number/);
  assert.match(unitsXml, /dimension ref="A1:C2"/);
  assert.match(unitsXml, /autoFilter ref="A1:C2"/);
  assert.match(unitsXml, /<c r="B2" s="4"><v>0\.875<\/v><\/c>/);
  assert.match(unitsXml, /<col min="2" max="2" width="15" customWidth="1"\/>/);
  assert.match(unitsXml, /<col min="3" max="3" width="42" customWidth="1"\/>/);
});
