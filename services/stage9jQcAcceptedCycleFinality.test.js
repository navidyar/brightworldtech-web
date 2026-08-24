'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

process.env.DB_HOST ||= 'test-db';
process.env.DB_PORT ||= '3306';
process.env.DB_NAME ||= 'test';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';

const requiredQcColumns = [
  'unit_qc_check_id',
  'unit_id',
  'unit_work_completion_id',
  'reviewed_by_user_id',
  'decision_code',
  'review_notes',
  'reviewed_at',
  'reverted_at',
  'reverted_by_user_id',
  'reversion_reason'
];

let insertAttempted = false;
let committed = false;
let rolledBack = false;

const connection = {
  async beginTransaction() {},
  async commit() {
    committed = true;
  },
  async rollback() {
    rolledBack = true;
  },
  release() {},
  async query(sql) {
    const statement = String(sql || '');

    if (statement.includes('information_schema.COLUMNS') && statement.includes("TABLE_NAME = 'unit_qc_checks'")) {
      return [requiredQcColumns.map((columnName) => ({ column_name: columnName })), []];
    }

    if (statement.includes('FROM units u') && statement.includes('FOR UPDATE')) {
      return [[{
        unit_id: 77,
        is_parked: 0,
        current_lot_id: 12,
        unit_created_at: '2026-07-01T10:00:00.000Z',
        unit_work_completion_id: 501,
        completion_lot_id: 12,
        credit_source: 'manual_completion',
        work_cycle_key: 'move:77:12:901',
        completed_at: '2026-07-29T12:00:00.000Z',
        reversed_at: null,
        current_lot_history_id: 901,
        current_lot_moved_at: '2026-07-29T10:00:00.000Z'
      }], []];
    }

    if (statement.includes('FROM unit_qc_checks qc') && statement.includes('latest_qc_check_id')) {
      return [[{
        unit_qc_check_id: 900,
        unit_id: 77,
        unit_work_completion_id: 501,
        reviewed_by_user_id: 19,
        decision_code: 'accepted',
        review_notes: '',
        reviewed_at: '2026-07-29T18:00:00.000Z',
        reverted_at: null,
        reverted_by_user_id: null,
        reversion_reason: null,
        reviewer_first_name: 'Quinn',
        reviewer_last_name: 'QC',
        reviewer_email: 'quinn@example.com'
      }], []];
    }

    if (statement.includes('INSERT INTO unit_qc_checks')) {
      insertAttempted = true;
      return [{ insertId: 901 }, []];
    }

    throw new Error(`Unexpected SQL in accepted-cycle finality test: ${statement}`);
  }
};

const originalModuleLoad = Module._load;
Module._load = function loadWithMysqlStub(request, parent, isMain) {
  if (request === 'mysql2/promise') {
    return {
      createPool: () => ({
        query: (...args) => connection.query(...args),
        getConnection: async () => connection
      })
    };
  }

  return originalModuleLoad(request, parent, isMain);
};

const unitQcCheckModel = require('../models/unitQcCheckModel');
Module._load = originalModuleLoad;

test('accepted completion cycles reject stale or later ordinary QC submissions before insert', async () => {
  insertAttempted = false;
  committed = false;
  rolledBack = false;

  await assert.rejects(
    () => unitQcCheckModel.recordQcReview({
      unitId: 77,
      unitWorkCompletionId: 501,
      reviewedByUserId: 20,
      decisionCode: 'rejected',
      reviewNotes: 'Stale modal submission.'
    }),
    (error) => {
      assert.equal(error.code, 'BWT_QC_REVIEW_FINAL');
      assert.match(error.message, /already been accepted by Quality Control/);
      return true;
    }
  );

  assert.equal(insertAttempted, false);
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});
