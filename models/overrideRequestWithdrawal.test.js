'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const lotModelPath = require.resolve('./lotModel');
const auditPath = require.resolve('../services/unitWorkflowAudit');
const modelPath = require.resolve('./overrideRequestModel');

function loadModel(queryResults) {
  const queue = [...queryResults];
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push({ kind: 'begin' }); },
    async commit() { calls.push({ kind: 'commit' }); },
    async rollback() { calls.push({ kind: 'rollback' }); },
    release() { calls.push({ kind: 'release' }); },
    async query(sql, values = []) {
      calls.push({ kind: 'query', sql, values });
      if (queue.length === 0) throw new Error('Unexpected query.');
      return queue.shift();
    }
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: { async getConnection() { return connection; } } }
  };
  require.cache[lotModelPath] = {
    id: lotModelPath,
    filename: lotModelPath,
    loaded: true,
    exports: { listLots: async () => [] }
  };
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {}
  };
  delete require.cache[modelPath];

  return { model: require('./overrideRequestModel'), calls };
}

test('requester withdrawal cancels only their own pending override', async () => {
  const request = { unit_id: 9, request_type: 'manual_tech_override_request', request_status: 'pending', requested_by_user_id: 4 };
  const { model, calls } = loadModel([
    [[request]],
    [[request]],
    [{ affectedRows: 1 }]
  ]);

  assert.equal(await model.withdrawOverrideRequest({ overrideRequestId: 17, requestedByUserId: 4, withdrawalNote: 'Entered by mistake' }), true);
  const update = calls.find((call) => call.kind === 'query' && /request_status = 'cancelled'/.test(call.sql));
  assert.ok(update);
  assert.deepEqual(update.values, [4, 'Entered by mistake', 17]);
  assert.ok(calls.some((call) => call.kind === 'commit'));
});

test('requester cannot withdraw another user\'s override', async () => {
  const { model, calls } = loadModel([
    [[{ unit_id: 9, request_type: 'manual_tech_override_request', request_status: 'pending', requested_by_user_id: 8 }]]
  ]);

  await assert.rejects(
    model.withdrawOverrideRequest({ overrideRequestId: 17, requestedByUserId: 4 }),
    (error) => error.code === 'BWT_OVERRIDE_REQUEST_NOT_OWNER'
  );
  assert.ok(calls.some((call) => call.kind === 'rollback'));
});

test('withdrawing an outcome confirmation returns the current outcome to not requested', async () => {
  const request = { unit_id: 9, unit_outcome_id: 41, request_type: 'outcome_confirmation', request_status: 'pending', requested_by_user_id: 4 };
  const { model, calls } = loadModel([
    [[request]],
    [[{ unit_outcome_id: 41, unit_id: 9, outcome_code: 'pass', approval_status_code: 'pending', is_current: 1, approval_requested_by_user_id: 4 }]],
    [[request]],
    [{ affectedRows: 1 }],
    [{ affectedRows: 1 }]
  ]);

  await model.withdrawOverrideRequest({ overrideRequestId: 18, requestedByUserId: 4 });
  const outcomeLock = calls.find((call) => call.kind === 'query' && /FROM unit_outcomes/.test(call.sql) && /FOR UPDATE/.test(call.sql));
  const requestLock = calls.find((call) => call.kind === 'query' && /FROM unit_override_requests/.test(call.sql) && /FOR UPDATE/.test(call.sql));
  assert.ok(outcomeLock);
  assert.ok(requestLock);
  assert.ok(calls.indexOf(outcomeLock) < calls.indexOf(requestLock));
  const outcomeUpdate = calls.find((call) => call.kind === 'query' && /approval_status_code = 'not_requested'/.test(call.sql));
  assert.ok(outcomeUpdate);
  assert.deepEqual(outcomeUpdate.values, ['Withdrawn by requester.', 41, 9]);
});
