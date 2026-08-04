'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Export Preview replaces the static contract list with checked selectable columns', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');

  assert.match(modal, /<h3 id="unit-export-columns-title">Export Columns<\/h3>/);
  assert.match(modal, /data-unit-export-column/);
  assert.match(modal, /type="checkbox"/);
  assert.match(modal, /data-unit-export-select-all/);
  assert.match(modal, /data-unit-export-clear-all/);
  assert.doesNotMatch(modal, /unit-export-column-list/);
});

test('download actions appear near the top of the modal and the footer retains only Close', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const toolbarIndex = modal.indexOf('data-unit-export-action-toolbar');
  const columnsIndex = modal.indexOf('unit-export-column-selection');
  const tableIndex = modal.indexOf('unit-export-preview-table-title');
  const footerIndex = modal.indexOf('unit-export-modal-footer');

  assert.ok(toolbarIndex > 0 && toolbarIndex < columnsIndex && columnsIndex < tableIndex && tableIndex < footerIndex);
  assert.match(modal.slice(toolbarIndex, columnsIndex), /Download CSV/);
  assert.match(modal.slice(toolbarIndex, columnsIndex), /Download XLSX/);
  assert.doesNotMatch(modal.slice(footerIndex), /Download CSV|Download XLSX/);
});

test('preview cells are keyed so checkbox changes can hide unselected columns immediately', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const browser = read('public/js/tech-units.js');

  assert.match(modal, /data-export-column-key="<%= column\.key %>"/);
  assert.match(browser, /querySelectorAll\('\[data-export-column-key\]'\)/);
  assert.match(browser, /cell\.hidden = !selectedKeySet\.has/);
  assert.match(browser, /searchParams\.set\('columns', selectedKeys\.join\(','\)\)/);
  assert.match(browser, /Select at least one column before downloading/);
});

test('preview and both download formats apply the same validated column selection', () => {
  const controller = read('controllers/techController.js');
  const service = read('services/unitExportService.js');
  const contract = read('config/unitExportContract.js');

  assert.equal((controller.match(/applyUnitExportColumnSelection\(/g) || []).length, 2);
  assert.match(controller, /Object\.prototype\.hasOwnProperty\.call\(query, 'columns'\)/);
  assert.match(controller, /availableColumns: UNIT_EXPORT_COLUMNS/);
  assert.match(service, /resolveUnitExportColumns\(value, \{ selectionProvided \}\)/);
  assert.match(contract, /BWT_UNIT_EXPORT_COLUMNS_REQUIRED/);
  assert.match(contract, /UNIT_EXPORT_COLUMNS\.filter\(\(column\) => selectedKeys\.has\(column\.key\)\)/);
});

test('XLSX widths follow column keys after optional columns are removed', () => {
  const fileService = read('services/unitExportFileService.js');

  assert.match(fileService, /const XLSX_COLUMN_WIDTHS = Object\.freeze\(\{/);
  assert.match(fileService, /batteryHealth: 15/);
  assert.match(fileService, /hardwareRemarks: 42/);
  assert.match(fileService, /XLSX_COLUMN_WIDTHS\[column\.key\]/);
});

test('export modal uses an internal scroll area, a sticky top action bar, and padded footer', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.unit-export-preview-modal \{[\s\S]*?max-height: calc\(100dvh - 48px\);[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.unit-export-preview-modal > \.modal-body \{[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.unit-export-action-toolbar \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(css, /\.unit-export-modal-footer \{[\s\S]*?padding: 14px 18px 18px;/);
});

test('Stage 10B validation runner includes selectable-column regression coverage', () => {
  const runner = read('scripts/runStage10bUnitExportFilesValidation.sh');

  assert.match(runner, /stage10bUnitExportColumnSelectionIntegration\.test\.js/);
});
