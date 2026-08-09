'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLotExportScope } = require('./lotExportScope');

const lots = [
  { lot_id: 1, parent_lot_id: null, lot_name: 'Parent' },
  { lot_id: 2, parent_lot_id: 1, lot_name: 'Child B' },
  { lot_id: 3, parent_lot_id: 1, lot_name: 'Child A' },
  { lot_id: 4, parent_lot_id: 2, lot_name: 'Grandchild' },
  { lot_id: 5, parent_lot_id: null, lot_name: 'Leaf' }
];

test('parent Lot export contains descendants at every level but not the selected parent itself', () => {
  const scope = buildLotExportScope(1, lots);

  assert.equal(scope.mode, 'descendants');
  assert.deepEqual(scope.includedLotIds.sort((a, b) => a - b), [2, 3, 4]);
  assert.equal(scope.includedLotIds.includes(1), false);
});

test('leaf Lot export contains only the selected Lot', () => {
  const scope = buildLotExportScope(5, lots);

  assert.equal(scope.mode, 'single');
  assert.deepEqual(scope.includedLotIds, [5]);
});

test('a child Lot exports only itself even when it also has a grandchild below it', () => {
  const scope = buildLotExportScope(2, lots);

  assert.equal(scope.mode, 'single');
  assert.deepEqual(scope.includedLotIds, [2]);
});

test('invalid or missing Lot selections return no export scope', () => {
  assert.equal(buildLotExportScope('', lots), null);
  assert.equal(buildLotExportScope(999, lots), null);
});
