'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const contract = require('../config/unitExportContract');
const { applyUnitExportColumnSelection } = require('./unitExportService');
const { buildCsvBuffer, buildXlsxWorkbookBuffer } = require('./unitExportFileService');

test('Export Preview opens with every export column deliberately unselected', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');

  assert.equal(contract.UNIT_EXPORT_COLUMNS.length, 72);
  assert.deepEqual(contract.DEFAULT_UNIT_EXPORT_COLUMNS, []);
  assert.match(modal, /const selectedColumnKeys = new Set\(safeDataset \? safeDataset\.columns\.map/);
  assert.match(modal, /const hasSelectedExportColumns = selectedColumnKeys\.size > 0/);
  assert.match(modal, /selectedColumnKeys\.has\(column\.key\) \? 'checked' : ''/);
  assert.match(modal, /safeAvailableColumns\.forEach\(\(column\) => \{ %><th data-export-column-key/);
});

test('preview keeps all columns renderable while zero-selection state disables downloads', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const browserScript = read('public/js/unit-export.js');
  const unitBrowserScript = read('public/js/tech-units.js');

  assert.match(modal, /hasSelectedExportColumns \? '' : ' is-disabled'/);
  assert.match(modal, /hasSelectedExportColumns\) \{ %>href="<%= safeCsvDownloadUrl %>"<% \} else \{ %>aria-disabled="true" tabindex="-1"/);
  assert.match(modal, /Select at least one column to enable CSV or XLSX downloads\./);

  for (const script of [browserScript, unitBrowserScript]) {
    assert.match(script, /const hasSelection = selectedKeys\.length > 0/);
    assert.match(script, /Select at least one column before downloading an export\./);
    assert.match(script, /link\.removeAttribute\('href'\)/);
    assert.match(script, /setAllUnitExportColumns\(getUnitExportModal\(clearAllExportColumns\), false\)/);
  }
});

test('missing selection yields zero preview columns but explicit empty selection remains invalid', () => {
  const dataset = {
    columns: contract.UNIT_EXPORT_COLUMNS,
    rows: [{ assetTag: 'BWT1' }],
    totalRows: 1,
    scope: []
  };
  const preview = applyUnitExportColumnSelection(dataset, undefined, { selectionProvided: false });

  assert.deepEqual(preview.columns, []);
  assert.equal(preview.rows, dataset.rows);
  assert.throws(
    () => applyUnitExportColumnSelection(dataset, '', { selectionProvided: true }),
    (error) => error && error.code === 'BWT_UNIT_EXPORT_COLUMNS_REQUIRED'
  );
});

test('CSV and XLSX generation refuse a zero-column dataset instead of silently exporting everything', () => {
  const dataset = { columns: [], rows: [{ assetTag: 'BWT1' }], totalRows: 1, scope: [] };

  for (const build of [buildCsvBuffer, buildXlsxWorkbookBuffer]) {
    assert.throws(
      () => build(dataset),
      (error) => error && error.code === 'BWT_UNIT_EXPORT_COLUMNS_REQUIRED'
    );
  }
});
