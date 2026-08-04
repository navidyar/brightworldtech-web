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
  const { model, calls } = loadModel([
    [[{ unit_id: 9, request_type: 'manual_tech_override_request', request_status: 'pending', requested_by_user_id: 4 }]],
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
  const { model, calls } = loadModel([
    [[{ unit_id: 9, request_type: 'outcome_confirmation', request_status: 'pending', requested_by_user_id: 4 }]],
    [{ affectedRows: 1 }],
    [{ affectedRows: 1 }]
  ]);

  await model.withdrawOverrideRequest({ overrideRequestId: 18, requestedByUserId: 4 });
  const outcomeUpdate = calls.find((call) => call.kind === 'query' && /approval_status_code = 'not_requested'/.test(call.sql));
  assert.ok(outcomeUpdate);
  assert.equal(outcomeUpdate.values[1], 9);
});
