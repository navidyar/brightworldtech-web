'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildLotScopedUnitExportDataset } = require('./unitExportService');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot Details owns one Export Units action and Tech Units no longer exposes Export Preview', () => {
  const lotPage = read('views/pages/management-lot-detail.ejs');
  const techPage = read('views/pages/tech-units.ejs');

  assert.match(lotPage, /export\/preview\?scope=direct/);
  assert.match(lotPage, />Export Units<\/button>/);
  assert.doesNotMatch(lotPage, />Export Direct Units<\/button>/);
  assert.doesNotMatch(lotPage, />Export Lot \+ Descendants<\/button>/);
  assert.match(lotPage, /\/js\/unit-export\.js\?v=20260921-cleanup-stage2b/);
  assert.doesNotMatch(techPage, /Export Preview/);
});

test('Lot export preview and downloads require granular export permission', () => {
  const routes = read('routes/lots.js');

  for (const suffix of ['preview', 'csv', 'xlsx']) {
    const route = `/management/lots/:lotId/export/${suffix}`;
    const routeIndex = routes.indexOf(`'${route}'`);
    const blockStart = routes.lastIndexOf('router.get(', routeIndex);
    const blockEnd = routes.indexOf(');', routeIndex) + 2;
    const block = routes.slice(blockStart, blockEnd);
    assert.ok(block.includes("requirePermission('lots.view')"), suffix);
    assert.ok(block.includes("requirePermission('lots.export')"), suffix);
  }
});

test('Lot export scope is resolved from the full hierarchy and passed to the export service', () => {
  const lotModel = read('models/lotModel.js');
  const lotController = read('controllers/lotController.js');
  const techUnitModel = read('models/techUnitModel.js');

  assert.match(lotModel, /async function getLotExportScope\(lotId, mode = 'direct'\)[\s\S]*?FROM lots l[\s\S]*?buildLotExportScope/);
  assert.match(lotController, /resolveLotExportContext\(lotId, req\)/);
  assert.match(lotController, /unitExportService\.buildLotScopedUnitExportDataset\(exportContext\.dataScope,/);
  assert.match(lotController, /BWT_LOT_EXPORT_SELECTION_INVALID/);
  assert.match(techUnitModel, /requestedLotIds\.length > 0[\s\S]*?u\.lot_id IN/);
});

test('parent Lot + descendants export queries the selected Lot and every descendant without browser filters', async () => {
  let receivedFilters = null;
  const lotScope = {
    mode: 'descendants',
    selectedLot: { lot_id: 10, lot_name: 'Parent Lot' },
    includedLots: [
      { lot_id: 10, lot_name: 'Parent Lot' },
      { lot_id: 11, lot_name: 'Child A' },
      { lot_id: 12, lot_name: 'Child B' },
      { lot_id: 13, lot_name: 'Grandchild' }
    ],
    includedLotIds: [10, 11, 12, 13]
  };

  const dataset = await buildLotScopedUnitExportDataset(lotScope, {
    techUnitModel: {
      async listTechUnits(filters) {
        receivedFilters = filters;
        return {
          supported: true,
          units: [],
          pagination: { totalRows: 0 },
          filters
        };
      }
    },
    unitExpandedDetailModel: {
      async listExpandedDetailsForUnits() {
        return new Map();
      }
    }
  });

  assert.deepEqual(receivedFilters.lotIds, [10, 11, 12, 13]);
  assert.equal(receivedFilters.unitState, 'active');
  assert.equal(receivedFilters.perPage, 'all');
  assert.equal(receivedFilters.restrictToCurrentAssignment, false);
  assert.equal(receivedFilters.search, undefined);
  assert.equal(dataset.totalRows, 0);
  assert.equal(dataset.scope.find((entry) => entry.label === 'Lot Scope').value, 'Parent Lot + descendants');
  assert.match(dataset.scope.find((entry) => entry.label === 'Included Lots').value, /^4:/);
});

test('leaf Lot export queries only that Lot', async () => {
  let receivedFilters = null;
  const lotScope = {
    mode: 'direct',
    selectedLot: { lot_id: 21, lot_name: 'Leaf Lot' },
    includedLots: [{ lot_id: 21, lot_name: 'Leaf Lot' }],
    includedLotIds: [21]
  };

  await buildLotScopedUnitExportDataset(lotScope, {
    techUnitModel: {
      async listTechUnits(filters) {
        receivedFilters = filters;
        return { supported: true, units: [], pagination: { totalRows: 0 }, filters };
      }
    },
    unitExpandedDetailModel: {
      async listExpandedDetailsForUnits() {
        return new Map();
      }
    }
  });

  assert.deepEqual(receivedFilters.lotIds, [21]);
});

test('shared export modal describes Lot scope without changing existing column-selection controls', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const exportScript = read('public/js/unit-export.js');

  assert.match(modal, /safeExportPresentation/);
  assert.match(modal, /exportSummaryText/);
  assert.match(modal, /Export Scope/);
  assert.match(modal, /safeExportScopeOptions/);
  assert.match(modal, /name="lotIds"/);
  assert.match(modal, /data-unit-export-column/);
  assert.match(modal, /Download CSV/);
  assert.match(modal, /Download XLSX/);
  assert.match(exportScript, /data-unit-export-select-all/);
  assert.match(exportScript, /url\.searchParams\.set\('columns', selectedColumnKeys\.join\(','\)\)/);
  assert.match(exportScript, /initializeUnitExportTableScroll/);
});
