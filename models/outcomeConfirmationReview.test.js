'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbModulePath = require.resolve('./db');
const poolStub = {};
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: poolStub }
};
const { approveOverrideRequest, denyOverrideRequest } = require('./overrideRequestModel');

function makeRequestRow(overrides = {}) {
  return {
    unit_override_request_id: 55,
    unit_id: 4126,
    unit_outcome_id: 234,
    request_type: 'outcome_confirmation',
    requested_by_user_id: 9,
    requested_destination_lot_id: null,
    request_status: 'pending',
    assigned_to_user_id: 9,
    created_by_user_id: 9,
    current_lot_id: 12,
    is_parked: 0,
    ...overrides
  };
}

function makeConnection({ outcomeOverrides = {}, lockedRequestOverrides = {} } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push({ kind: 'begin' }); },
    async commit() { calls.push({ kind: 'commit' }); },
    async rollback() { calls.push({ kind: 'rollback' }); },
    release() { calls.push({ kind: 'release' }); },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });

      if (/FROM unit_override_requests$/.test(normalized.split(' WHERE ')[0]) && !/FOR UPDATE/.test(normalized)) {
        return [[makeRequestRow()]];
      }

      if (/FROM unit_outcomes/.test(normalized) && /WHERE unit_outcome_id = \?/.test(normalized) && /FOR UPDATE/.test(normalized)) {
        return [[{
          unit_outcome_id: 234,
          unit_id: 4126,
          outcome_code: 'pass',
          approval_status_code: 'pending',
          is_current: 1,
          approval_requested_by_user_id: 9,
          ...outcomeOverrides
        }]];
      }

      if (/FROM unit_override_requests r/.test(normalized) && /FOR UPDATE/.test(normalized)) {
        return [[makeRequestRow(lockedRequestOverrides)]];
      }

      if (/FROM unit_override_requests/.test(normalized) && /FOR UPDATE/.test(normalized)) {
        return [[makeRequestRow(lockedRequestOverrides)]];
      }

      if (/UPDATE unit_override_requests/.test(normalized)) return [{ affectedRows: 1 }];
      if (/UPDATE unit_outcomes/.test(normalized)) return [{ affectedRows: 1 }];
      if (/INSERT INTO unit_audit_events/.test(normalized)) return [{ insertId: 701 }];
      if (/INSERT INTO unit_audit_event_changes/.test(normalized)) return [{ affectedRows: 1 }];

      throw new Error(`Unexpected query in Stage 10W70B test: ${normalized}`);
    }
  };
}

test('outcome confirmation approval locks the exact outcome before the request and mutates only that outcome row', async () => {
  const connection = makeConnection();
  const approved = await approveOverrideRequest({
    overrideRequestId: 55,
    reviewedByUserId: 3,
    reviewNotes: 'Confirmed',
    connection
  });

  assert.equal(approved, true);
  const outcomeLock = connection.calls.find((call) => /FROM unit_outcomes/.test(call.sql) && /FOR UPDATE/.test(call.sql));
  const requestLock = connection.calls.find((call) => /FROM unit_override_requests r/.test(call.sql) && /FOR UPDATE/.test(call.sql));
  assert.ok(outcomeLock);
  assert.ok(requestLock);
  assert.ok(connection.calls.indexOf(outcomeLock) < connection.calls.indexOf(requestLock));

  const outcomeUpdate = connection.calls.find((call) => /UPDATE unit_outcomes/.test(call.sql));
  assert.ok(outcomeUpdate);
  assert.match(outcomeUpdate.sql, /WHERE unit_outcome_id = \? AND unit_id = \? AND is_current = 1 AND approval_status_code = 'pending'/);
  assert.deepEqual(outcomeUpdate.params, [3, 'Confirmed', 234, 4126]);

  const requestUpdate = connection.calls.find((call) => /UPDATE unit_override_requests/.test(call.sql));
  assert.ok(requestUpdate);
  assert.ok(connection.calls.indexOf(requestUpdate) < connection.calls.indexOf(outcomeUpdate));
});

test('outcome confirmation approval fails closed before request mutation when the immutable target is stale', async () => {
  const connection = makeConnection({ outcomeOverrides: { is_current: 0 } });

  await assert.rejects(
    approveOverrideRequest({
      overrideRequestId: 55,
      reviewedByUserId: 3,
      reviewNotes: 'Should not persist',
      connection
    }),
    (error) => error && error.code === 'BWT_OUTCOME_CONFIRMATION_TARGET_STALE'
  );

  assert.equal(connection.calls.some((call) => /FROM unit_override_requests r/.test(call.sql) && /FOR UPDATE/.test(call.sql)), false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_override_requests/.test(call.sql)), false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_outcomes/.test(call.sql)), false);
});

test('outcome confirmation approval revalidates the request after locking the outcome', async () => {
  const connection = makeConnection({ lockedRequestOverrides: { request_status: 'cancelled' } });

  const approved = await approveOverrideRequest({
    overrideRequestId: 55,
    reviewedByUserId: 3,
    reviewNotes: 'Too late',
    connection
  });

  assert.equal(approved, false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_override_requests/.test(call.sql)), false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_outcomes/.test(call.sql)), false);
});


test('outcome confirmation denial uses the same exact linked outcome and outcome-first lock order', async () => {
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const denied = await denyOverrideRequest({
    overrideRequestId: 55,
    reviewedByUserId: 3,
    reviewNotes: 'Not confirmed'
  });

  assert.equal(denied, true);
  const outcomeLock = connection.calls.find((call) => /FROM unit_outcomes/.test(call.sql || '') && /FOR UPDATE/.test(call.sql || ''));
  const requestLock = connection.calls.find((call) => /FROM unit_override_requests/.test(call.sql || '') && /FOR UPDATE/.test(call.sql || ''));
  assert.ok(outcomeLock);
  assert.ok(requestLock);
  assert.ok(connection.calls.indexOf(outcomeLock) < connection.calls.indexOf(requestLock));

  const outcomeUpdate = connection.calls.find((call) => /UPDATE unit_outcomes/.test(call.sql || ''));
  assert.ok(outcomeUpdate);
  assert.match(outcomeUpdate.sql, /approval_status_code = 'denied'/);
  assert.match(outcomeUpdate.sql, /WHERE unit_outcome_id = \? AND unit_id = \? AND is_current = 1 AND approval_status_code = 'pending'/);
  assert.deepEqual(outcomeUpdate.params, [3, 'Not confirmed', 234, 4126]);
  assert.ok(connection.calls.some((call) => call.kind === 'commit'));
});
