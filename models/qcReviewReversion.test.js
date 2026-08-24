'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const modelPath = require.resolve('./unitQcCheckModel');

const poolStub = {};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: poolStub }
};

delete require.cache[modelPath];
const unitQcCheckModel = require('./unitQcCheckModel');

const requiredColumns = [
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

function currentState(overrides = {}) {
  return {
    unit_qc_check_id: 900,
    unit_id: 77,
    unit_work_completion_id: 501,
    reviewed_by_user_id: 19,
    decision_code: 'accepted',
    review_notes: 'Looks good.',
    reviewed_at: '2026-08-24T10:00:00.000Z',
    reverted_at: null,
    current_lot_id: 12,
    unit_created_at: '2026-08-01T10:00:00.000Z',
    completion_lot_id: 12,
    credit_source: 'manual_completion',
    work_cycle_key: 'move:77:12:901',
    completed_at: '2026-08-24T09:00:00.000Z',
    reversed_at: null,
    current_lot_history_id: 901,
    current_lot_moved_at: '2026-08-23T09:00:00.000Z',
    ...overrides
  };
}

function makeConnection({ stateOverrides = {}, latestOverrides = {}, updateAffectedRows = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });

      if (normalized.includes('information_schema.COLUMNS') && normalized.includes("TABLE_NAME = 'unit_qc_checks'")) {
        return [requiredColumns.map((columnName) => ({ column_name: columnName }))];
      }

      if (normalized.includes('FROM unit_qc_checks qc') && normalized.includes('INNER JOIN unit_work_completions completion') && normalized.includes('FOR UPDATE')) {
        return [[currentState(stateOverrides)]];
      }

      if (normalized.includes('FROM unit_qc_checks') && normalized.includes('ORDER BY unit_qc_check_id DESC') && normalized.includes('FOR UPDATE')) {
        return [[{ unit_qc_check_id: 900, reverted_at: null, ...latestOverrides }]];
      }

      if (normalized.startsWith('UPDATE unit_qc_checks')) {
        return [{ affectedRows: updateAffectedRows }];
      }

      if (normalized.startsWith('INSERT INTO unit_audit_events')) {
        return [{ insertId: 701 }];
      }

      if (normalized.startsWith('INSERT INTO unit_audit_event_changes')) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected Stage 10W70C query: ${normalized}`);
    }
  };
}

test('direct QC reversion mutates only the exact latest QC check and records an audit reason', async () => {
  const connection = makeConnection();
  const result = await unitQcCheckModel.revertQcReviewWithConnection(connection, {
    unitId: 77,
    qcCheckId: 900,
    revertedByUserId: 3,
    reversionReason: 'QC decision was recorded against the wrong physical unit.'
  });

  assert.equal(result.reverted, true);
  assert.equal(result.qcCheckId, 900);
  assert.equal(result.previousDecisionCode, 'accepted');

  const update = connection.calls.find((call) => call.sql.startsWith('UPDATE unit_qc_checks'));
  assert.ok(update);
  assert.match(update.sql, /WHERE unit_qc_check_id = \? AND reverted_at IS NULL/);
  assert.deepEqual(update.params, [3, 'QC decision was recorded against the wrong physical unit.', 900]);

  const audit = connection.calls.find((call) => call.sql.startsWith('INSERT INTO unit_audit_events'));
  assert.ok(audit);
  assert.ok(connection.calls.filter((call) => call.sql.startsWith('INSERT INTO unit_audit_event_changes')).length >= 2);
});

test('direct QC reversion fails closed when a newer QC decision exists', async () => {
  const connection = makeConnection({ latestOverrides: { unit_qc_check_id: 901 } });

  await assert.rejects(
    unitQcCheckModel.revertQcReviewWithConnection(connection, {
      unitId: 77,
      qcCheckId: 900,
      revertedByUserId: 3,
      reversionReason: 'Stale test.'
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_NOT_LATEST'
  );

  assert.equal(connection.calls.some((call) => call.sql.startsWith('UPDATE unit_qc_checks')), false);
  assert.equal(connection.calls.some((call) => call.sql.startsWith('INSERT INTO unit_audit_events')), false);
});

test('direct QC reversion rejects stale completion cycles before mutation', async () => {
  const connection = makeConnection({ stateOverrides: { work_cycle_key: 'move:77:12:899' } });

  await assert.rejects(
    unitQcCheckModel.revertQcReviewWithConnection(connection, {
      unitId: 77,
      qcCheckId: 900,
      revertedByUserId: 3,
      reversionReason: 'Old completion.'
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_COMPLETION_STALE'
  );

  assert.equal(connection.calls.some((call) => call.sql.startsWith('UPDATE unit_qc_checks')), false);
});

test('latest QC lookup does not resurrect an older review when the newest stored review is reverted', async () => {
  const calls = [];
  const connection = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized.includes('information_schema.COLUMNS')) {
        return [requiredColumns.map((columnName) => ({ column_name: columnName }))];
      }
      if (normalized.includes('SELECT unit_work_completion_id, MAX(unit_qc_check_id) AS latest_qc_check_id')) {
        assert.match(normalized, /MAX\(unit_qc_check_id\)/);
        assert.match(normalized, /WHERE qc\.reverted_at IS NULL/);
        return [[]];
      }
      throw new Error(`Unexpected latest lookup query: ${normalized}`);
    }
  };

  const result = await unitQcCheckModel.listLatestQcChecksForCompletions([501], connection);
  assert.equal(result.size, 0);
  assert.ok(calls.some((sql) => sql.includes('WHERE qc.reverted_at IS NULL')));
});
