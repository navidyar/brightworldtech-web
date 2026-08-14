'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Edit Lot parent choices exclude the current Lot and every descendant', () => {
  const model = read('models/lotModel.js');
  const controller = read('controllers/lotController.js');

  assert.match(model, /excludedParentLotIds[\s\S]*?\[currentLotId, \.\.\.await listDescendantLotIds\(currentLotId\)\]/);
  assert.match(model, /listParentLotOptions\(\{ includeLotIds: includeParentLotIds, excludeLotIds: excludedParentLotIds \}\)/);
  assert.match(model, /l\.lot_id NOT IN/);
  assert.match(controller, /getLotFormOptions\(\{\s*currentLotId: lotId,/);
  assert.match(controller, /selectedParentIsAllowed/);
  assert.match(controller, /one of its descendants/);
});

test('updateLot performs a transactional hierarchy guard before writing parent_lot_id', () => {
  const model = read('models/lotModel.js');
  const updateStart = model.indexOf('async function updateLot(');
  const updateEnd = model.indexOf('async function getLotVisibilitySummary', updateStart);
  const updateLot = model.slice(updateStart, updateEnd);
  const guardIndex = updateLot.indexOf('assertValidLotParentAssignment');
  const updateIndex = updateLot.indexOf('UPDATE lots');

  assert.ok(guardIndex >= 0, 'updateLot should assert the proposed hierarchy');
  assert.ok(updateIndex > guardIndex, 'hierarchy assertion must run before UPDATE lots');
  assert.match(updateLot, /listLotHierarchyRows\(connection, \{ forUpdate: true \}\)/);
  assert.match(updateLot, /await connection\.beginTransaction\(\)/);
  assert.match(updateLot, /await connection\.rollback\(\)/);
});

test('controller returns hierarchy race/bypass failures to the Edit Lot modal', () => {
  const controller = read('controllers/lotController.js');

  assert.match(controller, /String\(error\.code \|\| ''\)\.startsWith\('LOT_PARENT_'\)/);
  assert.match(controller, /status\(400\)\.render\('fragments\/lot-form-modal'/);
  assert.match(controller, /errorMessages: \[error\.message\]/);
});

test('Lot Browser keeps corrupted hierarchy rows visible and identifies them for repair', () => {
  const page = read('views/pages/management-lots.ejs');
  const browserScript = read('public/js/lot-browser-tree.js');
  const css = read('public/css/lots.css');

  assert.match(page, /hierarchyIssue/);
  assert.match(page, /data-hierarchy-error="<%= lot\.hierarchyIssue \? '1' : '0' %>"/);
  assert.match(page, /Hierarchy error · repair Parent Lot/);
  assert.match(browserScript, /row\.dataset\.hierarchyError === '1'/);
  assert.match(browserScript, /!row\.dataset\.parentLotId \|\| hasHierarchyError/);
  assert.match(css, /\.lot-hierarchy-error-note/);
});

test('a read-only Lot hierarchy audit and focused validation commands are available', () => {
  const packageJson = JSON.parse(read('package.json'));
  const auditScript = read('scripts/auditLotHierarchy.js');

  assert.equal(packageJson.scripts['audit:lot-hierarchy'], 'node scripts/auditLotHierarchy.js');
  assert.match(packageJson.scripts['validate:lot-hierarchy-integrity'], /lotHierarchyIntegrity\.test\.js/);
  assert.match(auditScript, /No database changes were made/);
  assert.match(auditScript, /Self-parent references/);
  assert.match(auditScript, /Hierarchy cycles/);
});

test('all Lots pages use the hierarchy-integrity cache-busted stylesheet', () => {
  const expected = '/css/lots.css?v=20260813-stage10w61-lot-ui-export';

  for (const relativePath of [
    'views/pages/management-lots.ejs',
    'views/pages/management-lot-detail.ejs',
    'views/pages/management-lot-new.ejs'
  ]) {
    assert.match(read(relativePath), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
