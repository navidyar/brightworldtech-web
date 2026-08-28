'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('central registry fixes core columns and exposes only stable optional display groups', () => {
  const registry = require('../config/unitBrowserColumnRegistry');
  const coreKeys = registry.listUnitBrowserCoreColumns().map((column) => column.key);
  const optional = registry.listUnitBrowserOptionalColumns();

  assert.deepEqual(coreKeys, ['unit_weight', 'created_work_assignment', 'identifiers', 'unit_actions']);
  assert.deepEqual(optional.map((column) => column.key), [
    'grade_pass_fail',
    'qc',
    'amazon_ids',
    'amazon_logistics',
    'completion',
    'system_bios',
    'display_power',
    'security_locks',
    'comments'
  ]);
  assert.ok(optional.every((column) => Number.isInteger(column.minimumWidthPx) && column.minimumWidthPx > 0));
});

test('migration is read-only by default, additive, normalized, and cascade-safe', () => {
  const migration = read('scripts/migrateLotUnitBrowserLayouts.js');

  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /No database changes were made/);
  assert.match(migration, /partial Unit Browser layout schema/i);
  assert.match(migration, /CREATE TABLE \$\{LAYOUT_TABLE\}/);
  assert.match(migration, /CREATE TABLE \$\{COLUMN_TABLE\}/);
  assert.match(migration, /UNIQUE KEY uq_lot_unit_browser_columns_lot_key \(lot_id, column_key\)/);
  assert.match(migration, /CHARACTER SET ascii COLLATE ascii_bin/);
  assert.match(migration, /DROP TABLE IF EXISTS \${COLUMN_TABLE}[\s\S]*DROP TABLE IF EXISTS \${LAYOUT_TABLE}/);
  assert.match(migration, /FOREIGN KEY \(lot_id\) REFERENCES lots\(lot_id\)[\s\S]*ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(migration, /FOREIGN KEY \(lot_id\) REFERENCES \$\{LAYOUT_TABLE\}\(lot_id\)[\s\S]*ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.doesNotMatch(migration, /UPDATE\s+lots\s+SET/i);
});

test('Lot Details exposes Configure Unit Browser only through Management Lot routes', () => {
  const routes = read('routes/lots.js');
  const detail = read('views/pages/management-lot-detail.ejs');

  assert.match(routes, /const lotManagementRoles = \['admin', 'management'\]/);
  assert.match(routes, /'\/management\/lots\/:lotId\/unit-browser\/modal'[\s\S]*requireRole\(lotManagementRoles\)[\s\S]*renderLotUnitBrowserLayoutModalPage/);
  assert.match(routes, /'\/management\/lots\/:lotId\/unit-browser\/modal'[\s\S]*requireRole\(lotManagementRoles\)[\s\S]*updateLotUnitBrowserLayout/);
  assert.match(detail, /Configure Unit Browser/);
});

test('Lot duplicate and delete lifecycle include Browser configuration inside existing semantics', () => {
  const model = read('models/lotModel.js');
  const duplicateModal = read('views/fragments/lot-duplicate-modal.ejs');

  assert.match(model, /'lot_unit_browser_columns'[\s\S]*'lot_unit_browser_layouts'/);
  assert.match(model, /lotUnitBrowserLayoutModel\.copyLayoutForDuplicate\([\s\S]*inheritanceMode[\s\S]*connection/);
  const copyIndex = model.indexOf('lotUnitBrowserLayoutModel.copyLayoutForDuplicate');
  const commitIndex = model.indexOf('await connection.commit()', copyIndex);
  assert.ok(copyIndex >= 0 && commitIndex > copyIndex, 'Browser duplicate validation must run before transaction commit.');
  assert.match(duplicateModal, /Unit Browser layout/);
  assert.match(duplicateModal, /data-lot-duplicate-parent-description/);
});

test('Stage 10W73A foundation keeps Browser configuration independent from Export', () => {
  const exportContract = read('config/unitExportContract.js');
  const exportService = read('services/unitExportService.js');
  const browserModal = read('views/fragments/lot-unit-browser-layout-modal.ejs');

  assert.doesNotMatch(exportContract, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
  assert.doesNotMatch(exportService, /unitBrowserColumnRegistry|lotUnitBrowserLayout/);
  assert.match(browserModal, /Export remains independent/);
});

test('modal uses compact keyboard-accessible arrow controls and reset-to-inherit behavior', () => {
  const modal = read('views/fragments/lot-unit-browser-layout-modal.ejs');
  const script = read('public/js/lot-unit-browser-layout.js');
  const controller = read('controllers/lotController.js');

  assert.match(modal, /aria-label="Move <%= column\.label %> up"/);
  assert.match(modal, /aria-label="Move <%= column\.label %> down"/);
  assert.match(modal, />↑<\/span>/);
  assert.match(modal, />↓<\/span>/);
  assert.match(modal, /name="layoutMode" value="inherit"/);
  assert.match(script, /insertBefore/);
  assert.match(script, /button\.focus\(\)/);
  assert.match(controller, /resetLayoutForLot\(lotId\)/);
  assert.match(controller, /normalizeSubmittedLotUnitBrowserLayout/);
});
