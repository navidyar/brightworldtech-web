'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LotUnitBrowserLayoutEditorError,
  normalizeSubmittedLotUnitBrowserLayout
} = require('./lotUnitBrowserLayoutEditor');
const { listUnitBrowserOptionalColumns } = require('../config/unitBrowserColumnRegistry');

const ALL_KEYS = listUnitBrowserOptionalColumns().map((column) => column.key);

test('normalizes the submitted optional display-group order and visibility', () => {
  const rows = normalizeSubmittedLotUnitBrowserLayout({
    columnOrder: ['qc', 'grade_pass_fail', 'amazon_ids', 'comments', 'amazon_logistics', 'completion', 'system_bios', 'display_power', 'security_locks'],
    visibleColumns: ['qc', 'amazon_ids', 'comments']
  });

  assert.deepEqual(rows, [
    { columnKey: 'qc', isVisible: true, sortOrder: 10 },
    { columnKey: 'grade_pass_fail', isVisible: false, sortOrder: 20 },
    { columnKey: 'amazon_ids', isVisible: true, sortOrder: 30 },
    { columnKey: 'comments', isVisible: true, sortOrder: 40 },
    { columnKey: 'amazon_logistics', isVisible: false, sortOrder: 50 },
    { columnKey: 'completion', isVisible: false, sortOrder: 60 },
    { columnKey: 'system_bios', isVisible: false, sortOrder: 70 },
    { columnKey: 'display_power', isVisible: false, sortOrder: 80 },
    { columnKey: 'security_locks', isVisible: false, sortOrder: 90 }
  ]);
});

test('rejects incomplete, duplicate, or unknown registry keys', () => {
  assert.throws(
    () => normalizeSubmittedLotUnitBrowserLayout({
      columnOrder: ['qc', 'qc', 'amazon_ids'],
      visibleColumns: ['not_registered']
    }),
    (error) => error instanceof LotUnitBrowserLayoutEditorError
      && error.messages.length >= 3
  );
});


test('rejects more than four visible optional display groups', () => {
  assert.throws(
    () => normalizeSubmittedLotUnitBrowserLayout({
      columnOrder: ALL_KEYS,
      visibleColumns: ALL_KEYS.slice(0, 5)
    }),
    (error) => error instanceof LotUnitBrowserLayoutEditorError
      && error.messages.some((message) => /no more than 4 optional/i.test(message))
  );
});
