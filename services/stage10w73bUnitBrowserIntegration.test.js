'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('selected Lot Browser rendering resolves the effective per-Lot layout while All Lots uses the application default', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /const lotUnitBrowserLayoutModel = require\('\.\.\/models\/lotUnitBrowserLayoutModel'\)/);
  assert.match(controller, /async function resolveUnitBrowserPresentation\(filters, \{ qcPortalMode = false \} = \{\}\)/);
  assert.match(controller, /if \(qcPortalMode\) \{[\s\S]*?buildApplicationDefaultUnitBrowserPresentation\(\)/);
  assert.match(controller, /if \(!selectedLotId\) \{[\s\S]*?buildApplicationDefaultUnitBrowserPresentation\(\)/);
  assert.match(controller, /lotUnitBrowserLayoutModel\.getEffectiveLayoutForLot\(selectedLotId\)/);
  assert.match(controller, /renderTechUnitsTable[\s\S]*?resolveUnitBrowserPresentation\(filters\)/);
});

test('QC Review is structurally updated but protected from per-Lot layout customization', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /renderQcPortalReviewTable[\s\S]*?resolveUnitBrowserPresentation\(filters, \{ qcPortalMode: true \}\)/);
  assert.match(controller, /unitBrowserBasePath: '\/qc\/review'[\s\S]*?qcPortalMode: true[\s\S]*?unitBrowserPresentation/);
});

test('Units Browser renders dynamic registry-backed columns, grouped Created and Assignment sorting, and dynamic colspans', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /browserColumns\.forEach\(\(column\) => \{/);
  assert.match(table, /tech-units-col--<%= column\.key %>/);
  assert.match(table, /table-sort-group--created-work/);
  assert.match(table, /Created[\s\S]*?date_desc[\s\S]*?Assignment[\s\S]*?tech_az/);
  assert.match(table, /colspan="<%= browserColumnCount %>"/);
  assert.match(table, /amazonDetails\.fnsku/);
  assert.match(table, /amazonDetails\.asin/);
  assert.match(table, /amazonDetails\.trackingNumber/);
  assert.match(table, /amazonDetails\.palletNumber/);
  assert.match(table, /column\.key === 'comments'/);
});

test('sort, pagination, and QC queue links retain Amazon search mode and pallet filters', () => {
  const sources = [
    read('views/fragments/tech-units-table.ejs'),
    read('views/partials/table-pagination.ejs'),
    read('views/fragments/tech-units-qc-review-queue.ejs')
  ];

  sources.forEach((source) => {
    assert.match(source, /'searchMode'/);
    assert.match(source, /'palletNumber'/);
  });
});

test('responsive width math derives table width and rendered column count from the presentation', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /--tu-table-base-width: <%= browserPresentation\.tableMinimumWidthPx %>px/);
  assert.match(table, /--tu-rendered-column-count: <%= browserColumnCount %>/);
  assert.match(table, /--tu-column-base-width: <%= column\.minimumWidthPx %>px/);
  assert.match(table, /--tu-secondary-growth-unit-count: <%= browserPresentation\.secondaryGrowthUnitCount %>/);
  assert.match(table, /tech-units-col--grow-<%= column\.growthUnits %>/);
  assert.match(css, /var\(--tu-rendered-column-count, 6\)/);
  assert.match(css, /var\(--tu-secondary-growth-unit-count, 1\)/);
  assert.match(css, /\.tech-units-col--grow-1/);
  assert.match(css, /\.tech-units-col--grow-2/);
  assert.match(css, /\.tech-units-col--unit_weight/);
  assert.doesNotMatch(css, /\.tech-units-col--date\s*\{/);
  assert.doesNotMatch(css, /\.tech-units-col--work\s*\{/);
});

test('background refresh replaces table structure only when the layout signature changes', () => {
  const script = read('public/js/tech-units.js');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /data-unit-browser-layout-signature/);
  assert.match(script, /data-unit-browser-layout-signature/);
  assert.match(script, /currentTable\.replaceWith\(replacement\)/);
  assert.match(script, /else \{[\s\S]*?reconcileTechUnitRecords\(currentTable, incomingTable\)/);
});

test('Export remains independent while Comments rendering is handled only by the Browser view', () => {
  const exportContract = read('config/unitExportContract.js');
  const exportService = read('services/unitExportService.js');
  const modal = read('views/fragments/lot-unit-browser-layout-modal.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.doesNotMatch(exportContract, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
  assert.doesNotMatch(exportService, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
  assert.doesNotMatch(modal, /configuration-only until the Stage 10W73C/);
  assert.match(table, /data-unit-browser-comment-link/);
});

test('modified Browser assets are cache-busted consistently', () => {
  const expectedCss = '/css/tech-units-clean.css?v=20260826-stage10w73e-browser-usability';
  const expectedJs = '/js/tech-units.js?v=20260826-stage10w73c-browser-refinement';

  for (const file of ['views/pages/tech-units.ejs', 'views/pages/tech-unit-detail.ejs']) {
    const page = read(file);
    assert.match(page, new RegExp(expectedCss.replace(/[?.]/g, '\\$&')));
    assert.match(page, new RegExp(expectedJs.replace(/[?.]/g, '\\$&')));
  }

  assert.match(read('views/pages/tech-unit-form.ejs'), new RegExp(expectedCss.replace(/[?.]/g, '\\$&')));
});
