'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const productionWeightPath = require.resolve('./productionWeightSyncModel');
const productionCyclePath = require.resolve('./productionCycleModel');
const auditPath = require.resolve('../services/unitWorkflowAudit');
const lotPresentationPath = require.resolve('../services/lotHierarchyPresentation');
const modelPath = require.resolve('./overrideRequestModel');

function loadModel() {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        async query(sql) {
          if (/information_schema\.TABLES/.test(sql)) return [[{ table_count: 1 }]];
          throw new Error(`Unexpected pool query: ${sql}`);
        }
      }
    }
  };
  for (const modulePath of [productionWeightPath, productionCyclePath, auditPath, lotPresentationPath]) {
    if (!require.cache[modulePath]) {
      require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports: {}
      };
    }
  }
  delete require.cache[modelPath];
  return require('./overrideRequestModel');
}

function connectionWith(results) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (!queue.length) throw new Error(`Unexpected connection query: ${sql}`);
      return queue.shift();
    }
  };
}

test('new Pass/Fail confirmation request stores the exact outcome id', async () => {
  const model = loadModel();
  const connection = connectionWith([
    [[]],
    [{ insertId: 31 }]
  ]);

  const requestId = await model.syncOutcomeConfirmationRequestWithConnection(connection, {
    unitId: 10,
    lotId: 3,
    requestedByUserId: 7,
    unitOutcomeId: 77,
    outcomeCode: 'pass',
    outcomeNotes: 'Small scratch',
    requestNotes: 'Please confirm',
    approvalRequested: true
  });

  assert.equal(requestId, 31);
  const insert = connection.calls.find((call) => /INSERT INTO unit_override_requests/.test(call.sql));
  assert.ok(insert);
  assert.match(insert.sql, /unit_outcome_id/);
  assert.equal(insert.values[1], 77);
  assert.match(String(insert.values[5]), /"unit_outcome_id":77/);
});

test('same immutable target reuses the existing pending request without rewriting it', async () => {
  const model = loadModel();
  const connection = connectionWith([
    [[{ unit_override_request_id: 30, unit_outcome_id: 77 }]]
  ]);

  const requestId = await model.syncOutcomeConfirmationRequestWithConnection(connection, {
    unitId: 10,
    requestedByUserId: 7,
    unitOutcomeId: 77,
    outcomeCode: 'pass',
    approvalRequested: true
  });

  assert.equal(requestId, 30);
  assert.equal(connection.calls.length, 1);
});

test('new outcome supersedes rather than retargets an older pending confirmation request', async () => {
  const model = loadModel();
  const connection = connectionWith([
    [[{ unit_override_request_id: 30, unit_outcome_id: 76 }]],
    [{ affectedRows: 1 }],
    [{ affectedRows: 1 }],
    [{ insertId: 31 }]
  ]);

  const requestId = await model.syncOutcomeConfirmationRequestWithConnection(connection, {
    unitId: 10,
    requestedByUserId: 7,
    unitOutcomeId: 77,
    outcomeCode: 'fail',
    requestNotes: 'New decision',
    approvalRequested: true
  });

  assert.equal(requestId, 31);
  const cancelled = connection.calls.find((call) => /request_status = 'cancelled'/.test(call.sql));
  const oldOutcomeReset = connection.calls.find((call) => /WHERE unit_outcome_id = \?/.test(call.sql));
  const insert = connection.calls.find((call) => /INSERT INTO unit_override_requests/.test(call.sql));
  assert.ok(cancelled);
  assert.deepEqual(oldOutcomeReset.values.slice(1), [76, 10]);
  assert.equal(insert.values[1], 77);
});

test('confirmation request refuses to persist without an exact outcome target', async () => {
  const model = loadModel();
  const connection = connectionWith([[[]]]);

  await assert.rejects(
    model.syncOutcomeConfirmationRequestWithConnection(connection, {
      unitId: 10,
      requestedByUserId: 7,
      outcomeCode: 'pass',
      approvalRequested: true
    }),
    (error) => error.code === 'BWT_OUTCOME_CONFIRMATION_TARGET_REQUIRED'
  );
});
