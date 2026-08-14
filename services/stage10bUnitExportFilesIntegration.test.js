'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('CSV and XLSX download routes are restricted to Admin and Management', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(routes, /'\/tech\/units\/export\/csv'[\s\S]*?requireRole\(managementRoles\)[\s\S]*?downloadTechUnitsCsv/);
  assert.match(routes, /'\/tech\/units\/export\/xlsx'[\s\S]*?requireRole\(managementRoles\)[\s\S]*?downloadTechUnitsXlsx/);
  assert.match(controller, /async function downloadTechUnitsExport[\s\S]*?if \(!canExportTechUnits\(req\)\)[\s\S]*?status\(403\)/);
});

test('both file formats reuse the exact filtered all-row dataset and set download headers', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /unitExportService\.buildFilteredUnitExportDataset\(filters\)/);
  assert.match(controller, /buildCsvBuffer\(dataset\)/);
  assert.match(controller, /buildXlsxWorkbookBuffer\(dataset\)/);
  assert.match(controller, /Content-Disposition'[\s\S]*?attachment; filename/);
  assert.match(controller, /Content-Length/);
  assert.match(controller, /Cache-Control'[\s\S]*?no-store/);
});

test('Lot Export Preview exposes CSV and XLSX actions while retaining the complete preview table', () => {
  const controller = read('controllers/lotController.js');
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const page = read('views/pages/management-lot-detail.ejs');

  assert.match(controller, /csvDownloadUrl: buildLotExportUrl\(lotId, 'csv', exportContext\.selection\)/);
  assert.match(controller, /xlsxDownloadUrl: buildLotExportUrl\(lotId, 'xlsx', exportContext\.selection\)/);
  assert.match(modal, /Download CSV/);
  assert.match(modal, /Download XLSX/);
  assert.match(modal, /safePreviewRows\.forEach/);
  assert.match(page, />Export Units<\/button>/);
  assert.doesNotMatch(page, />Export Direct Units<\/button>/);
  assert.doesNotMatch(page, />Export Lot \+ Descendants<\/button>/);
});

test('XLSX is generated without adding a heavyweight spreadsheet dependency', () => {
  const packageJson = JSON.parse(read('package.json'));
  const fileService = read('services/unitExportFileService.js');

  assert.equal(packageJson.dependencies.exceljs, undefined);
  assert.equal(packageJson.dependencies.xlsx, undefined);
  assert.match(fileService, /createZipArchive/);
  assert.match(fileService, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});

test('Stage 10B adds a dedicated validation command', () => {
  const packageJson = JSON.parse(read('package.json'));
  const runner = read('scripts/runStage10bUnitExportFilesValidation.sh');

  assert.equal(packageJson.scripts['validate:unit-export-files'], 'bash scripts/runStage10bUnitExportFilesValidation.sh');
  assert.match(runner, /unitExportFileService\.test\.js/);
  assert.match(runner, /stage10bUnitExportFilesIntegration\.test\.js/);
});
