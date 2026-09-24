'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Export Scope uses independent checkboxes for the parent and each direct child branch', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const controller = read('controllers/lotController.js');

  assert.match(modal, /type="checkbox"/);
  assert.match(modal, /name="lotIds"/);
  assert.match(modal, /data-lot-export-scope-option/);
  assert.doesNotMatch(modal, /type="radio"[\s\S]*?name="lotExportScope"/);
  assert.match(controller, /label: 'This Lot'/);
  assert.match(controller, /directChildLots\.forEach/);
  assert.match(controller, /description: `Includes \$\{childLot\.lot_name\} and anything below that child Lot\.`/);
});


test('Lot Details loads the shared export client before Lot-specific export behavior', () => {
  const detailPage = read('views/pages/management-lot-detail.ejs');
  const sharedClientIndex = detailPage.indexOf('/js/unit-export-shared.js?v=20260921-cleanup-stage2b');
  const lotClientIndex = detailPage.indexOf('/js/unit-export.js?v=20260921-cleanup-stage2b');

  assert.ok(sharedClientIndex > 0);
  assert.ok(lotClientIndex > sharedClientIndex);
});

test('scope refresh submits every checked Lot and preserves selected export columns', () => {
  const exportScript = read('public/js/unit-export.js');

  assert.match(exportScript, /querySelectorAll\('\[data-lot-export-scope-option\]:checked'\)/);
  assert.match(exportScript, /selectedLotIds\.forEach\(\(lotId\) => url\.searchParams\.append\('lotIds'/);
  assert.match(exportScript, /getSelectedUnitExportColumnKeys\(modal\)/);
  assert.match(exportScript, /url\.searchParams\.set\('columns', selectedColumnKeys\.join\(','\)\)/);
  assert.match(exportScript, /Select at least one Lot or child branch for the export/);
});

test('preview and download URLs encode a repeatable Lot selection instead of one radio scope', () => {
  const controller = read('controllers/lotController.js');

  assert.match(controller, /function normalizeLotExportSelectionIds/);
  assert.match(controller, /params\.append\('lotIds', String\(selectedLotId\)\)/);
  assert.match(controller, /buildSelectedLotExportScope\(rootScope, selection\.selectedLotIds\)/);
  assert.match(controller, /csvDownloadUrl: buildLotExportUrl\(lotId, 'csv', exportContext\.selection\)/);
  assert.match(controller, /xlsxDownloadUrl: buildLotExportUrl\(lotId, 'xlsx', exportContext\.selection\)/);
});
