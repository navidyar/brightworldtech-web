'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const modelPath = require.resolve('./lotValidationOverrideModel');

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async () => {
        throw new Error('Unexpected default pool query.');
      }
    }
  }
};

delete require.cache[modelPath];

const { listOverrideHistoryForUnit } = require('./lotValidationOverrideModel');

function createConnection(rows) {
  const calls = [];

  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      return [rows];
    }
  };
}

test('lists durable Lot acceptance history with note, approver, revocation, and expiration details', async () => {
  const connection = createConnection([
    {
      unit_lot_validation_override_id: 41,
      unit_id: 10,
      lot_id: 7,
      lot_name: 'Ready Stock',
      override_status_code: 'cancelled',
      override_status_label: 'Cancelled',
      reason: 'Approved for a known cosmetic exception.',
      requirement_signature: 'requirement-signature',
      lot_assignment_signature: 'assignment-signature',
      requested_by_user_id: 3,
      requested_by_name: 'Morgan Manager',
      requested_at: '2026-07-20T10:00:00Z',
      approved_by_user_id: 3,
      approved_by_name: 'Morgan Manager',
      approved_at: '2026-07-20T10:00:00Z',
      denied_at: null,
      revoked_by_user_id: 4,
      revoked_by_name: 'Alex Admin',
      revoked_at: '2026-07-21T11:00:00Z',
      expired_at: null
    }
  ]);

  const records = await listOverrideHistoryForUnit(10, 25, connection);

  assert.equal(records.length, 1);
  assert.equal(records[0].statusLabel, 'Revoked');
  assert.equal(records[0].lotName, 'Ready Stock');
  assert.equal(records[0].approvedByName, 'Morgan Manager');
  assert.equal(records[0].revokedByName, 'Alex Admin');
  assert.equal(records[0].reason, 'Approved for a known cosmetic exception.');
  assert.deepEqual(connection.calls[0].values, [10, 25]);
  assert.match(connection.calls[0].sql, /WHERE override_record\.unit_id = \?/);
  assert.match(connection.calls[0].sql, /LEFT JOIN users revoker/);
});

test('returns no history and does not query for an invalid Unit ID', async () => {
  const connection = createConnection([]);
  const records = await listOverrideHistoryForUnit('not-a-unit', 100, connection);

  assert.deepEqual(records, []);
  assert.equal(connection.calls.length, 0);
});
