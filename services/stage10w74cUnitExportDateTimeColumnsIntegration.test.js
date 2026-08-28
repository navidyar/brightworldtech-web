'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const { UNIT_EXPORT_COLUMNS, DEFAULT_UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { buildUnitExportRow } = require('./unitExportService');

const DATE_TIME_KEYS = ['createdDate', 'createdTime', 'completedDate', 'completedTime'];

test('Unit export exposes Created and Completed date/time as four independent optional columns', () => {
  const columnsByKey = new Map(UNIT_EXPORT_COLUMNS.map((column) => [column.key, column]));

  assert.deepEqual(DATE_TIME_KEYS.map((key) => columnsByKey.get(key)?.label), [
    'Created Date',
    'Created Time',
    'Completed Date',
    'Completed Time'
  ]);
  assert.deepEqual(DATE_TIME_KEYS.map((key) => columnsByKey.get(key)?.defaultSelected), [false, false, false, false]);
  assert.equal(DEFAULT_UNIT_EXPORT_COLUMNS.some((column) => DATE_TIME_KEYS.includes(column.key)), false);
  assert.equal(UNIT_EXPORT_COLUMNS.length, 72);
});

test('export timestamp values use the application display timezone and remain separate fields', () => {
  const row = buildUnitExportRow({
    unitId: 1,
    assetTag: 'BWT1',
    createdAt: '2026-08-27T19:34:00.000Z',
    completedAt: '2026-08-28T01:05:00.000Z'
  });

  assert.equal(row.createdDate, '08/27/2026');
  assert.equal(row.createdTime, '02:34 PM');
  assert.equal(row.completedDate, '08/27/2026');
  assert.equal(row.completedTime, '08:05 PM');

  const incomplete = buildUnitExportRow({ unitId: 2, assetTag: 'BWT2', createdAt: null, completedAt: null });
  assert.equal(incomplete.createdDate, '');
  assert.equal(incomplete.createdTime, '');
  assert.equal(incomplete.completedDate, '');
  assert.equal(incomplete.completedTime, '');
});

test('the Units Browser keeps its consolidated Created presentation independent from export columns', () => {
  const browser = read('views/fragments/tech-units-table.ejs');

  assert.match(browser, /const unitCreatedDate = formatUnitCreatedDate\(unit\.createdAt\);/);
  assert.match(browser, /const unitCreatedTime = formatUnitCreatedTime\(unit\.createdAt\);/);
  assert.match(browser, /tech-unit-summary-created-time/);
  assert.doesNotMatch(browser, /data-export-column-key="createdDate"/);
});

test('CSV/XLSX export widths recognize all four new timestamp columns without changing browser rendering', () => {
  const fileService = read('services/unitExportFileService.js');
  const exportService = read('services/unitExportService.js');

  assert.match(exportService, /createdDate:\s*formatExportDate\(unit\.createdAt\)/);
  assert.match(exportService, /createdTime:\s*formatExportTime\(unit\.createdAt\)/);
  assert.match(exportService, /completedDate:\s*formatExportDate\(unit\.completedAt\)/);
  assert.match(exportService, /completedTime:\s*formatExportTime\(unit\.completedAt\)/);
  assert.match(fileService, /createdDate:\s*14/);
  assert.match(fileService, /completedTime:\s*14/);
});
