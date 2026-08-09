'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Unit Details and History remain in the existing left-offset pop-under row', () => {
  const details = read('views/fragments/tech-units-table.ejs');

  assert.match(details, /<tr class="tech-detail-row"/);
  assert.match(details, /<div class="tech-detail-offset">/);
  assert.match(details, /<div class="tech-detail-panel" data-unit-detail-panel>/);
  assert.doesNotMatch(details, /modal-backdrop[\s\S]*?data-unit-detail-panel/);
});

test('History replaces the Details header inside the same pop-under instead of nesting another header', () => {
  const details = read('views/fragments/tech-units-table.ejs');
  const history = read('views/fragments/tech-unit-history-panel.ejs');
  const client = read('public/js/tech-units.js');

  assert.match(details, /data-unit-panel-header="details"/);
  assert.match(details, /data-unit-panel-header="history" hidden/);
  assert.match(details, /Unit History[\s\S]*?Back to Details/);
  assert.match(client, /querySelectorAll\('\[data-unit-panel-header\]'\)/);
  assert.match(client, /activeHeaderName = normalizedPanelName === 'history' \? 'history' : 'details'/);
  assert.doesNotMatch(history, /tech-detail-header/);
  assert.doesNotMatch(history, /Back to Details/);
});

test('Unit Details uses warm orange while History keeps the established purple treatment', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /\.tech-units-clean-page \.tech-detail-header--details\s*\{[\s\S]*?border-bottom-color:\s*#dcae78;[\s\S]*?background:\s*#fff2e2;/);
  assert.match(css, /\.tech-units-clean-page \.tech-detail-header--details \.tech-detail-title strong\s*\{[\s\S]*?color:\s*#704116;/);
  assert.match(css, /\.tech-units-clean-page \.tech-detail-header--history\s*\{[\s\S]*?border-bottom-color:\s*#cfc3e5;[\s\S]*?background:\s*#f7f3ff;/);
  assert.match(css, /\.tech-units-clean-page \.tech-detail-header--history \.tech-detail-title strong\s*\{[\s\S]*?color:\s*#4c3f73;/);
});

test('expanded Unit details load Previous and Current Memory and Storage rows together', () => {
  const model = read('models/unitExpandedDetailModel.js');

  assert.match(model, /'unit_previous_memory_modules'/);
  assert.match(model, /'unit_previous_storage_devices'/);
  assert.match(model, /async function attachPreviousMemoryModules/);
  assert.match(model, /async function attachPreviousStorageDevices/);
  assert.match(model, /details\.memoryComparisons = buildHardwareComponentComparisons/);
  assert.match(model, /details\.storageComparisons = buildHardwareComponentComparisons/);
});

test('Unit Details presents component comparisons and explicit zero-capacity slots and bays', () => {
  const details = read('views/fragments/tech-units-table.ejs');
  const helper = read('services/hardwareComponentComparison.js');

  assert.match(details, /<h3>Memory Modules<\/h3>/);
  assert.match(details, /<h3>Storage Devices<\/h3>/);
  assert.match(details, /comparison\.previousText/);
  assert.match(details, /comparison\.currentText/);
  assert.match(details, /tech-component-change-chip--<%= comparison\.statusCode %>/);
  assert.match(helper, /if \(component\.isEmpty\) return '0GB · Empty slot';/);
  assert.match(details, /formatGb\(previousMemoryModules\.length > 0 \? expanded\.previousMemoryTotalGb : unit\.previousRamGb\)/);
  assert.match(details, /formatGb\(storageDevices\.length > 0 \? expanded\.storageTotalGb : unit\.storageGb\)/);
});

test('History expands structured component snapshots into per-slot changes', () => {
  const timeline = read('services/unitHistoryTimeline.js');

  assert.match(timeline, /previous_memory_modules:\s*\{ kind: 'memory', label: 'Previous Memory' \}/);
  assert.match(timeline, /memory_modules:\s*\{ kind: 'memory', label: 'Current Memory' \}/);
  assert.match(timeline, /previous_storage_devices:\s*\{ kind: 'storage', label: 'Previous Storage' \}/);
  assert.match(timeline, /storage_devices:\s*\{ kind: 'storage', label: 'Current Storage' \}/);
  assert.match(timeline, /label: `\$\{definition\.label\} · \$\{comparison\.slotLabel\}`/);
  assert.match(timeline, /comparison\.statusCode === 'current_only'/);
  assert.match(timeline, /comparison\.statusCode === 'previous_only'/);
});

test('component export columns are selected by default with the complete export contract', () => {
  const contract = require('../config/unitExportContract');

  assert.equal(contract.UNIT_EXPORT_COLUMNS.length, 24);
  assert.equal(contract.DEFAULT_UNIT_EXPORT_COLUMNS.length, 24);
  assert.deepEqual(
    contract.UNIT_EXPORT_COLUMNS.slice(12, 18).map((column) => column.key),
    [
      'previousMemoryModules',
      'currentMemoryModules',
      'memoryModuleChanges',
      'previousStorageDevices',
      'currentStorageDevices',
      'storageDeviceChanges'
    ]
  );
  assert.deepEqual(contract.DEFAULT_UNIT_EXPORT_COLUMNS, contract.UNIT_EXPORT_COLUMNS);
});

test('CSV and XLSX component columns use multiline text, fixed widths, and wrapping', () => {
  const exportService = read('services/unitExportService.js');
  const fileService = read('services/unitExportFileService.js');
  const previewCss = read('public/css/app.css');

  assert.match(exportService, /previousMemoryModules:\s*formatHardwareComponentList/);
  assert.match(exportService, /memoryModuleChanges:\s*formatHardwareComparisonList/);
  assert.match(exportService, /storageDeviceChanges:\s*formatHardwareComparisonList/);
  assert.match(fileService, /previousMemoryModules:\s*36/);
  assert.match(fileService, /memoryModuleChanges:\s*42/);
  assert.match(fileService, /wrapText="1"/);
  assert.match(fileService, /Math\.min\(90, Math\.max\(20/);
  assert.match(previewCss, /data-export-column-key="memoryModuleChanges"/);
  assert.match(previewCss, /white-space:\s*pre-wrap/);
});

test('History body starts with content summary and no longer repeats a nested header', () => {
  const history = read('views/fragments/tech-unit-history-panel.ejs');

  assert.match(history, /tech-history-panel-summary/);
  assert.match(history, /safeTimeline\.totalEvents/);
  assert.match(history, /safeTimeline\.totalChanges/);
  assert.doesNotMatch(history, /<strong>Unit History<\/strong>/);
});

test('Stage 10V assets are cache-busted on Unit Browser and single-Unit entry points', () => {
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /stage10v6-custom-header-scrollbar/);
  }

  assert.match(read('views/partials/head.ejs'), /app\.css\?v=20260804-stage10w-ranking-administration/);
});
