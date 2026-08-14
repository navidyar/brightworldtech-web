'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildLotExportScope, buildSelectedLotExportScope } = require('./lotExportScope');

const lots = [
  { lot_id: 1, parent_lot_id: null, lot_name: 'Parent' },
  { lot_id: 2, parent_lot_id: 1, lot_name: 'Child B' },
  { lot_id: 3, parent_lot_id: 1, lot_name: 'Child A' },
  { lot_id: 4, parent_lot_id: 2, lot_name: 'Grandchild' },
  { lot_id: 5, parent_lot_id: null, lot_name: 'Leaf' }
];

test('direct scope always contains only the selected Lot, including a parent Lot', () => {
  const scope = buildLotExportScope(1, lots, 'direct');

  assert.equal(scope.mode, 'direct');
  assert.deepEqual(scope.includedLotIds, [1]);
  assert.equal(scope.descendantLots.length, 3);
});

test('descendant scope contains the selected Lot plus descendants at every level', () => {
  const scope = buildLotExportScope(1, lots, 'descendants');

  assert.equal(scope.mode, 'descendants');
  assert.deepEqual(scope.includedLotIds.slice().sort((a, b) => a - b), [1, 2, 3, 4]);
});

test('descendant scope works from an intermediate child and includes that child', () => {
  const scope = buildLotExportScope(2, lots, 'descendants');

  assert.equal(scope.mode, 'descendants');
  assert.deepEqual(scope.includedLotIds.slice().sort((a, b) => a - b), [2, 4]);
});

test('leaf descendant scope still contains the selected Lot', () => {
  const scope = buildLotExportScope(5, lots, 'descendants');

  assert.deepEqual(scope.includedLotIds, [5]);
});

test('selected scope can combine the parent with more than one direct child branch', () => {
  const rootScope = buildLotExportScope(1, lots, 'descendants');
  const scope = buildSelectedLotExportScope(rootScope, [1, 2, 3]);

  assert.equal(scope.mode, 'selected');
  assert.deepEqual(scope.selectedScopeLotIds, [1, 2, 3]);
  assert.deepEqual(scope.includedLotIds.slice().sort((a, b) => a - b), [1, 2, 3, 4]);
});

test('selected scope can export multiple child branches without the parent Lot', () => {
  const rootScope = buildLotExportScope(1, lots, 'descendants');
  const scope = buildSelectedLotExportScope(rootScope, [2, 3]);

  assert.deepEqual(scope.selectedScopeLotIds, [2, 3]);
  assert.deepEqual(scope.includedLotIds.slice().sort((a, b) => a - b), [2, 3, 4]);
});

test('selected child branch automatically includes its descendants', () => {
  const rootScope = buildLotExportScope(1, lots, 'descendants');
  const scope = buildSelectedLotExportScope(rootScope, [2]);

  assert.deepEqual(scope.includedLotIds.slice().sort((a, b) => a - b), [2, 4]);
});

test('selected scope rejects Lots outside the root or its direct child choices', () => {
  const rootScope = buildLotExportScope(1, lots, 'descendants');

  assert.throws(
    () => buildSelectedLotExportScope(rootScope, [4]),
    (error) => error && error.code === 'BWT_LOT_EXPORT_SELECTION_INVALID'
  );
});

test('invalid or missing Lot selections return no export scope', () => {
  assert.equal(buildLotExportScope('', lots), null);
  assert.equal(buildLotExportScope(999, lots), null);
});
