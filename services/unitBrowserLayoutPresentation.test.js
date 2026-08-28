'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildApplicationDefaultUnitBrowserPresentation,
  buildUnitBrowserLayoutPresentation
} = require('./unitBrowserLayoutPresentation');

test('application default keeps current Browser groups while consolidating Created and Assignment', () => {
  const presentation = buildApplicationDefaultUnitBrowserPresentation();

  assert.deepEqual(presentation.columns.map((column) => column.key), [
    'unit_weight',
    'created_work_assignment',
    'identifiers',
    'grade_pass_fail',
    'qc',
    'unit_actions'
  ]);
  assert.equal(presentation.tableMinimumWidthPx, 1154);
  assert.equal(presentation.renderedColumnCount, 6);
  assert.equal(presentation.secondaryColumnCount, 5);
  assert.equal(presentation.secondaryGrowthUnitCount, 3);
});

test('configured visible optional groups render in stored order between Identifiers and Unit Actions', () => {
  const presentation = buildUnitBrowserLayoutPresentation({
    columns: [
      { key: 'amazon_logistics', isVisible: true, sortOrder: 10 },
      { key: 'qc', isVisible: false, sortOrder: 20 },
      { key: 'amazon_ids', isVisible: true, sortOrder: 30 },
      { key: 'grade_pass_fail', isVisible: true, sortOrder: 40 },
      { key: 'comments', isVisible: false, sortOrder: 50 }
    ]
  });

  assert.deepEqual(presentation.columns.map((column) => column.key), [
    'unit_weight',
    'created_work_assignment',
    'identifiers',
    'amazon_logistics',
    'amazon_ids',
    'grade_pass_fail',
    'unit_actions'
  ]);
  assert.equal(presentation.tableMinimumWidthPx, 1455);
  assert.equal(presentation.secondaryGrowthUnitCount, 5);
  assert.equal(presentation.layoutSignature, 'unit_weight|created_work_assignment|identifiers|amazon_logistics|amazon_ids|grade_pass_fail|unit_actions');
});

test('Stage 10W73C renderable groups include Comments and additional compact views', () => {
  const presentation = buildUnitBrowserLayoutPresentation({
    columns: [
      { key: 'comments', isVisible: true, sortOrder: 10 },
      { key: 'system_bios', isVisible: true, sortOrder: 20 },
      { key: 'completion', isVisible: true, sortOrder: 30 },
      { key: 'grade_pass_fail', isVisible: false, sortOrder: 40 },
      { key: 'qc', isVisible: false, sortOrder: 50 }
    ]
  });

  assert.deepEqual(presentation.columns.map((column) => column.key), [
    'unit_weight',
    'created_work_assignment',
    'identifiers',
    'comments',
    'system_bios',
    'completion',
    'unit_actions'
  ]);
  assert.equal(presentation.tableMinimumWidthPx, 1470);
  assert.equal(presentation.secondaryGrowthUnitCount, 4);
  assert.equal(presentation.columns.find((column) => column.key === 'system_bios').valueWrapMode, 'copy_single_line');
});
