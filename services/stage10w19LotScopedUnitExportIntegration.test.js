'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildLotScopedUnitExportDataset } = require('./unitExportService');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot Details owns the export button and Tech Units no longer exposes Export Preview', () => {
  const lotPage = read('views/pages/management-lot-detail.ejs');
  const techPage = read('views/pages/tech-units.ejs');

  assert.match(lotPage, /hx-get="\/management\/lots\/<%= lot\.lot_id %>\/export\/preview"/);
  assert.match(lotPage, />Export Units<\/button>/);
  assert.match(lotPage, /\/js\/unit-export\.js\?v=20260807-stage10w19-lot-scoped-export/);
  assert.doesNotMatch(techPage, /Export Preview/);
});

test('Lot export preview and downloads remain Admin/Management-only routes', () => {
  const routes = read('routes/lots.js');

  for (const suffix of ['preview', 'csv', 'xlsx']) {
    assert.match(
      routes,
      new RegExp(`'/management/lots/:lotId/export/${suffix}'[\\s\\S]*?requireRole\\(lotManagementRoles\\)`)
    );
  }
});

test('Lot export scope is resolved from the full hierarchy and passed to the export service', () => {
  const lotModel = read('models/lotModel.js');
  const lotController = read('controllers/lotController.js');
  const techUnitModel = read('models/techUnitModel.js');

  assert.match(lotModel, /async function getLotExportScope\(lotId\)[\s\S]*?FROM lots l[\s\S]*?buildLotExportScope/);
  assert.match(lotController, /lotModel\.getLotExportScope\(lotId\)/);
  assert.match(lotController, /unitExportService\.buildLotScopedUnitExportDataset\(lotScope\)/);
  assert.match(techUnitModel, /requestedLotIds\.length > 0[\s\S]*?u\.lot_id IN/);
});

test('parent Lot export queries every descendant Lot id and does not inherit browser filters', async () => {
  let receivedFilters = null;
  const lotScope = {
    mode: 'descendants',
    selectedLot: { lot_id: 10, lot_name: 'Parent Lot' },
    includedLots: [
      { lot_id: 11, lot_name: 'Child A' },
      { lot_id: 12, lot_name: 'Child B' },
      { lot_id: 13, lot_name: 'Grandchild' }
    ],
    includedLotIds: [11, 12, 13]
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

  assert.deepEqual(receivedFilters.lotIds, [11, 12, 13]);
  assert.equal(receivedFilters.unitState, 'active');
  assert.equal(receivedFilters.perPage, 'all');
  assert.equal(receivedFilters.restrictToCurrentAssignment, false);
  assert.equal(receivedFilters.search, undefined);
  assert.equal(dataset.totalRows, 0);
  assert.equal(dataset.scope.find((entry) => entry.label === 'Lot Scope').value, 'Parent Lot — descendant Lots');
  assert.match(dataset.scope.find((entry) => entry.label === 'Included Lots').value, /^3:/);
});

test('leaf Lot export queries only that Lot', async () => {
  let receivedFilters = null;
  const lotScope = {
    mode: 'single',
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
  assert.match(modal, /data-unit-export-column/);
  assert.match(modal, /Download CSV/);
  assert.match(modal, /Download XLSX/);
  assert.match(exportScript, /data-unit-export-select-all/);
  assert.match(exportScript, /searchParams\.set\('columns', selectedKeys\.join\(','\)\)/);
  assert.match(exportScript, /initializeUnitExportTableScroll/);
});
