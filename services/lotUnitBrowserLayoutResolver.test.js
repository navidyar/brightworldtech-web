'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectiveLotUnitBrowserLayout
} = require('./lotUnitBrowserLayoutResolver');

test('application default preserves current Grade/Pass-Fail and QC visibility only', () => {
  const layout = resolveEffectiveLotUnitBrowserLayout({
    lineage: [{ lotId: 10, parentLotId: null, name: 'Root' }],
    layouts: []
  });
  const visibility = Object.fromEntries(layout.columns.map((column) => [column.key, column.isVisible]));

  assert.equal(layout.source.type, 'application_default');
  assert.equal(layout.hasDirectCustomization, false);
  assert.deepEqual(visibility, {
    grade_pass_fail: true,
    qc: true,
    amazon_ids: false,
    amazon_logistics: false,
    completion: false,
    system_bios: false,
    display_power: false,
    security_locks: false,
    comments: false
  });
});

test('nearest configured ancestor controls the effective layout', () => {
  const layout = resolveEffectiveLotUnitBrowserLayout({
    lineage: [
      { lotId: 10, parentLotId: null, name: 'Root' },
      { lotId: 20, parentLotId: 10, name: 'Child' },
      { lotId: 30, parentLotId: 20, name: 'Leaf' }
    ],
    layouts: [
      {
        lotId: 10,
        columns: [
          { columnKey: 'grade_pass_fail', isVisible: 1, sortOrder: 10 },
          { columnKey: 'qc', isVisible: 0, sortOrder: 20 }
        ]
      },
      {
        lotId: 20,
        columns: [
          { columnKey: 'amazon_ids', isVisible: 1, sortOrder: 10 },
          { columnKey: 'grade_pass_fail', isVisible: 0, sortOrder: 20 },
          { columnKey: 'qc', isVisible: 1, sortOrder: 30 },
          { columnKey: 'amazon_logistics', isVisible: 0, sortOrder: 40 },
          { columnKey: 'comments', isVisible: 0, sortOrder: 50 }
        ]
      }
    ]
  });

  assert.equal(layout.source.lotId, 20);
  assert.equal(layout.source.lotName, 'Child');
  assert.equal(layout.hasDirectCustomization, false);
  assert.deepEqual(layout.columns.map((column) => column.key), [
    'amazon_ids',
    'grade_pass_fail',
    'qc',
    'amazon_logistics',
    'comments',
    'completion',
    'system_bios',
    'display_power',
    'security_locks'
  ]);
  assert.equal(layout.columns[0].isVisible, true);
});

test('a direct layout is independent and missing future registry groups remain hidden', () => {
  const layout = resolveEffectiveLotUnitBrowserLayout({
    lineage: [
      { lotId: 10, parentLotId: null, name: 'Root' },
      { lotId: 20, parentLotId: 10, name: 'Child' }
    ],
    layouts: [{
      lotId: 20,
      columns: [{ columnKey: 'comments', isVisible: 1, sortOrder: 10 }]
    }]
  });
  const visibility = Object.fromEntries(layout.columns.map((column) => [column.key, column.isVisible]));

  assert.equal(layout.hasDirectCustomization, true);
  assert.equal(layout.source.lotId, 20);
  assert.equal(visibility.comments, true);
  assert.equal(visibility.grade_pass_fail, false);
  assert.equal(visibility.qc, false);
  assert.equal(visibility.amazon_ids, false);
  assert.equal(visibility.amazon_logistics, false);
  assert.equal(visibility.completion, false);
  assert.equal(visibility.system_bios, false);
  assert.equal(visibility.display_power, false);
  assert.equal(visibility.security_locks, false);
});
