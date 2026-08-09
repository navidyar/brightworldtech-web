'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectDescendantLotIds,
  validateLotParentAssignment,
  assertValidLotParentAssignment,
  auditLotHierarchy
} = require('./lotHierarchyIntegrity');

const HEALTHY_LOTS = [
  { lot_id: 1, parent_lot_id: null, lot_name: 'Root A' },
  { lot_id: 2, parent_lot_id: 1, lot_name: 'Child B' },
  { lot_id: 3, parent_lot_id: 2, lot_name: 'Grandchild C' },
  { lot_id: 4, parent_lot_id: 1, lot_name: 'Child D' },
  { lot_id: 5, parent_lot_id: null, lot_name: 'Root E' }
];

test('collectDescendantLotIds returns children, grandchildren, and deeper descendants without the selected Lot', () => {
  assert.deepEqual(new Set(collectDescendantLotIds(HEALTHY_LOTS, 1)), new Set([2, 3, 4]));
  assert.deepEqual(collectDescendantLotIds(HEALTHY_LOTS, 3), []);
});

test('parent assignment rejects self-parenting and descendant-as-parent cycles', () => {
  assert.deepEqual(validateLotParentAssignment(HEALTHY_LOTS, 1, 1), {
    valid: false,
    code: 'LOT_PARENT_SELF',
    message: 'A Lot cannot be its own Parent Lot.'
  });

  const childResult = validateLotParentAssignment(HEALTHY_LOTS, 1, 2);
  assert.equal(childResult.valid, false);
  assert.equal(childResult.code, 'LOT_PARENT_DESCENDANT');

  const grandchildResult = validateLotParentAssignment(HEALTHY_LOTS, 1, 3);
  assert.equal(grandchildResult.valid, false);
  assert.equal(grandchildResult.code, 'LOT_PARENT_DESCENDANT');
});

test('parent assignment allows ancestors, unrelated Lots, and clearing the parent', () => {
  assert.equal(validateLotParentAssignment(HEALTHY_LOTS, 3, 1).valid, true);
  assert.equal(validateLotParentAssignment(HEALTHY_LOTS, 2, 5).valid, true);
  assert.equal(validateLotParentAssignment(HEALTHY_LOTS, 2, '').valid, true);
});

test('model assertion refuses a proposed parent whose existing chain is already cyclic', () => {
  const corrupted = [
    { lot_id: 1, parent_lot_id: null, lot_name: 'Healthy' },
    { lot_id: 6, parent_lot_id: 7, lot_name: 'Cycle A' },
    { lot_id: 7, parent_lot_id: 6, lot_name: 'Cycle B' },
    { lot_id: 8, parent_lot_id: null, lot_name: 'Candidate' }
  ];

  assert.throws(
    () => assertValidLotParentAssignment(corrupted, 8, 6),
    (error) => error.code === 'LOT_PARENT_CHAIN_CYCLE' && error.statusCode === 400
  );
});

test('audit reports self references, missing parents, and each multi-Lot cycle once', () => {
  const report = auditLotHierarchy([
    { lot_id: 1, parent_lot_id: 1, lot_name: 'Self' },
    { lot_id: 2, parent_lot_id: 99, lot_name: 'Missing' },
    { lot_id: 3, parent_lot_id: 4, lot_name: 'Cycle A' },
    { lot_id: 4, parent_lot_id: 3, lot_name: 'Cycle B' },
    { lot_id: 5, parent_lot_id: null, lot_name: 'Healthy' }
  ]);

  assert.equal(report.hasIssues, true);
  assert.equal(report.selfReferences.length, 1);
  assert.equal(report.missingParents.length, 1);
  assert.equal(report.cycles.length, 1);
  assert.deepEqual(new Set(report.cycles[0].lotIds), new Set([3, 4]));
  assert.deepEqual(report.affectedLotIds, [1, 2, 3, 4]);
});

test('audit passes a healthy hierarchy', () => {
  const report = auditLotHierarchy(HEALTHY_LOTS);
  assert.equal(report.hasIssues, false);
  assert.deepEqual(report.selfReferences, []);
  assert.deepEqual(report.missingParents, []);
  assert.deepEqual(report.cycles, []);
});
