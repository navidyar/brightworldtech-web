'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbModulePath = require.resolve('./db');
const qcModelPath = require.resolve('./unitQcCheckModel');
const requestModelPath = require.resolve('./unitRequestModel');

const poolStub = {};
const qcCalls = [];
const targetState = {
  unit_qc_check_id: 83,
  unit_id: 4124,
  unit_work_completion_id: 193,
  reviewed_by_user_id: 26,
  decision_code: 'accepted',
  review_notes: 'QC note',
  reviewed_at: '2026-08-24 15:34:46.107605'
};

const qcModelStub = {
  async lockQcReviewReversionTargetWithConnection(connection, args) {
    qcCalls.push({ kind: 'lock-target', connection, args });
    if (connection.targetError) throw connection.targetError;
    return { ...targetState, ...(connection.targetOverrides || {}) };
  },
  async revertQcReviewWithConnection(connection, args) {
    qcCalls.push({ kind: 'revert-target', connection, args });
    if (connection.revertError) throw connection.revertError;
    return { reverted: true, unitId: args.unitId, qcCheckId: args.qcCheckId, unitWorkCompletionId: 193 };
  }
};

require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: poolStub }
};
require.cache[qcModelPath] = {
  id: qcModelPath,
  filename: qcModelPath,
  loaded: true,
  exports: qcModelStub
};
delete require.cache[requestModelPath];
const unitRequestModel = require('./unitRequestModel');

poolStub.query = async (sql) => {
  const normalized = String(sql).replace(/\s+/g, ' ').trim();
  if (/FROM information_schema\.TABLES/.test(normalized)) {
    return [[
      { TABLE_NAME: 'unit_requests' },
      { TABLE_NAME: 'unit_duplicate_requests' },
      { TABLE_NAME: 'unit_request_events' },
      { TABLE_NAME: 'unit_model_catalog_requests' },
      { TABLE_NAME: 'unit_processor_catalog_requests' },
      { TABLE_NAME: 'unit_qc_reversion_requests' }
    ]];
  }
  throw new Error(`Unexpected pool query in Stage 10W70D test: ${normalized}`);
};

function makeConnection({ pendingRequest = null, lockedStatus = 'pending', previewQcCheckId = 83, lockedQcCheckId = 83, snapshotMatchesQc = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push({ kind: 'begin' }); },
    async commit() { calls.push({ kind: 'commit' }); },
    async rollback() { calls.push({ kind: 'rollback' }); },
    release() { calls.push({ kind: 'release' }); },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      const call = { kind: 'query', sql: normalized, params };
      calls.push(call);

      if (/SELECT ur\.unit_request_id FROM unit_requests ur INNER JOIN unit_qc_reversion_requests qrr/.test(normalized) && /qrr\.unit_qc_check_id = \?/.test(normalized)) {
        return [[pendingRequest ? { unit_request_id: pendingRequest } : null].filter(Boolean)];
      }
      if (/INSERT INTO unit_requests/.test(normalized)) return [{ insertId: 71, affectedRows: 1 }];
      if (/INSERT INTO unit_qc_reversion_requests/.test(normalized)) return [{ affectedRows: 1 }];
      if (/INSERT INTO unit_request_events/.test(normalized)) return [{ insertId: 901, affectedRows: 1 }];
      if (/INSERT INTO unit_audit_events/.test(normalized)) return [{ insertId: 902, affectedRows: 1 }];
      if (/INSERT INTO unit_audit_event_changes/.test(normalized)) return [{ insertId: 903, affectedRows: 1 }];

      if (/FROM unit_requests ur INNER JOIN unit_qc_reversion_requests qrr/.test(normalized) && /WHERE ur\.unit_request_id = \?/.test(normalized)) {
        return [[{
          unit_request_id: 71,
          request_type: 'qc_reversion',
          status: /FOR UPDATE/.test(normalized) ? lockedStatus : 'pending',
          requested_by_user_id: 26,
          requester_note: 'Wrong QC decision',
          unit_id: 4124,
          unit_work_completion_id: 193,
          unit_qc_check_id: /FOR UPDATE/.test(normalized) ? lockedQcCheckId : previewQcCheckId,
          ...(/FOR UPDATE/.test(normalized) ? { snapshot_matches_qc: snapshotMatchesQc } : {})
        }]];
      }
      if (/UPDATE unit_requests SET status = 'approved'/.test(normalized)) return [{ affectedRows: 1 }];
      if (/FROM unit_requests ur LEFT JOIN unit_qc_reversion_requests qrr/.test(normalized) && /FOR UPDATE/.test(normalized)) {
        return [[{
          request_type: 'qc_reversion',
          status: 'pending',
          requested_by_user_id: 26,
          requester_note: 'Wrong QC decision',
          qc_reversion_unit_id: 4124,
          qc_reversion_completion_id: 193,
          qc_reversion_qc_check_id: 83,
          qc_reversion_decision_code: 'accepted',
          requester_name: 'Tech QC'
        }]];
      }
      if (/UPDATE unit_requests SET status = 'rejected'/.test(normalized)) return [{ affectedRows: 1 }];

      throw new Error(`Unexpected connection query in Stage 10W70D test: ${normalized}`);
    }
  };
}

test('QC reversion request snapshots the exact current QC decision without mutating it', async () => {
  qcCalls.length = 0;
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const result = await unitRequestModel.createQcReversionRequest({
    unitId: 4124,
    qcCheckId: 83,
    requestedByUserId: 26,
    requesterNote: 'Wrong QC decision'
  });

  assert.deepEqual(result, { unitRequestId: 71, unitId: 4124, qcCheckId: 83 });
  assert.deepEqual(qcCalls[0].args, { unitId: 4124, qcCheckId: 83 });
  const snapshotInsert = connection.calls.find((call) => /INSERT INTO unit_qc_reversion_requests/.test(call.sql || ''));
  assert.ok(snapshotInsert);
  assert.match(snapshotInsert.sql, /SELECT \?, qc\.unit_id, qc\.unit_work_completion_id, qc\.unit_qc_check_id, qc\.decision_code, qc\.reviewed_by_user_id, qc\.reviewed_at, qc\.review_notes FROM unit_qc_checks qc/);
  assert.deepEqual(snapshotInsert.params, [71, 83, 4124]);
  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
  const auditEvent = connection.calls.find((call) => /INSERT INTO unit_audit_events/.test(call.sql || ''));
  assert.ok(auditEvent);
  assert.equal(auditEvent.params[2], 'unit_qc_reversion_request_submitted');
  assert.ok(connection.calls.some((call) => call.kind === 'commit'));
});

test('a different QC user can request reversion of the exact current decision', async () => {
  qcCalls.length = 0;
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const result = await unitRequestModel.createQcReversionRequest({
    unitId: 4124,
    qcCheckId: 83,
    requestedByUserId: 27,
    requesterNote: 'Please revert this'
  });

  assert.deepEqual(result, { unitRequestId: 71, unitId: 4124, qcCheckId: 83 });
  assert.ok(connection.calls.some((call) => /INSERT INTO unit_requests/.test(call.sql || '')));
  const auditEvent = connection.calls.find((call) => /INSERT INTO unit_audit_events/.test(call.sql || ''));
  assert.ok(auditEvent);
  assert.equal(auditEvent.params[0], 4124);
  assert.equal(auditEvent.params[1], 27);
  assert.equal(auditEvent.params[2], 'unit_qc_reversion_request_submitted');
  assert.ok(connection.calls.some((call) => call.kind === 'commit'));
});

test('a second pending reversion request for the same QC check is rejected', async () => {
  qcCalls.length = 0;
  const connection = makeConnection({ pendingRequest: 70 });
  poolStub.getConnection = async () => connection;

  await assert.rejects(
    unitRequestModel.createQcReversionRequest({
      unitId: 4124,
      qcCheckId: 83,
      requestedByUserId: 26,
      requesterNote: 'Still wrong'
    }),
    (error) => error && error.code === 'BWT_UNIT_REQUEST_ALREADY_PENDING' && error.unitRequestId === 70
  );
  assert.equal(connection.calls.some((call) => /INSERT INTO unit_requests/.test(call.sql || '')), false);
});

test('Tech Lead+ approval locks the exact QC target before the request and uses the QC requester reason for reversion', async () => {
  qcCalls.length = 0;
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const result = await unitRequestModel.approveQcReversionRequest({
    unitRequestId: 71,
    reviewedByUserId: 1,
    reviewerNote: 'Approved after review'
  });

  assert.equal(result.approved, true);
  const targetLockCall = qcCalls.find((call) => call.kind === 'lock-target');
  const requestLock = connection.calls.find((call) => /FROM unit_requests ur INNER JOIN unit_qc_reversion_requests qrr/.test(call.sql || '') && /FOR UPDATE/.test(call.sql || ''));
  assert.ok(targetLockCall);
  assert.ok(requestLock);
  const revertCall = qcCalls.find((call) => call.kind === 'revert-target');
  assert.deepEqual(revertCall.args, {
    unitId: 4124,
    qcCheckId: 83,
    revertedByUserId: 1,
    reversionReason: 'Wrong QC decision',
    unitRequestId: 71
  });
  const requestUpdate = connection.calls.find((call) => /UPDATE unit_requests SET status = 'approved'/.test(call.sql || ''));
  assert.deepEqual(requestUpdate.params, [1, 'Approved after review', 71]);
});

test('approval revalidates the pending request after locking QC and fails closed if it changed', async () => {
  qcCalls.length = 0;
  const connection = makeConnection({ lockedStatus: 'rejected' });
  poolStub.getConnection = async () => connection;

  const result = await unitRequestModel.approveQcReversionRequest({
    unitRequestId: 71,
    reviewedByUserId: 1,
    reviewerNote: 'Too late'
  });

  assert.equal(result.approved, false);
  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_requests SET status = 'approved'/.test(call.sql || '')), false);
});

test('approval refuses a request whose immutable QC linkage changed after the QC target lock', async () => {
  qcCalls.length = 0;
  const connection = makeConnection({ lockedQcCheckId: 84 });
  poolStub.getConnection = async () => connection;

  await assert.rejects(
    unitRequestModel.approveQcReversionRequest({
      unitRequestId: 71,
      reviewedByUserId: 1,
      reviewerNote: 'Should not apply'
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_REQUEST_STALE'
  );
  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
});

test('approval fails closed when the stored QC snapshot differs from the exact linked QC row', async () => {
  qcCalls.length = 0;
  const connection = makeConnection({ snapshotMatchesQc: 0 });
  poolStub.getConnection = async () => connection;

  await assert.rejects(
    unitRequestModel.approveQcReversionRequest({
      unitRequestId: 71,
      reviewedByUserId: 1,
      reviewerNote: 'Approved after review'
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_REQUEST_SNAPSHOT_MISMATCH'
  );

  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
  assert.equal(connection.calls.some((call) => /UPDATE unit_requests SET status = 'approved'/.test(call.sql || '')), false);
  assert.ok(connection.calls.some((call) => call.kind === 'rollback'));
});

test('rejecting a QC reversion request records Unit History without reverting the QC decision', async () => {
  qcCalls.length = 0;
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const rejected = await unitRequestModel.rejectUnitRequest({
    unitRequestId: 71,
    reviewedByUserId: 1,
    reviewerNote: 'Keep the original QC decision'
  });

  assert.equal(rejected, true);
  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
  const update = connection.calls.find((call) => /UPDATE unit_requests SET status = 'rejected'/.test(call.sql || ''));
  assert.ok(update);

  const auditEvent = connection.calls.find((call) => /INSERT INTO unit_audit_events/.test(call.sql || ''));
  assert.ok(auditEvent);
  assert.equal(auditEvent.params[0], 4124);
  assert.equal(auditEvent.params[1], 1);
  assert.equal(auditEvent.params[2], 'unit_qc_reversion_request_rejected');
  assert.equal(auditEvent.params[3], 'quality_control_reversion_request');
  assert.equal(auditEvent.params[4], 'Rejected QC decision reversion request');
  assert.match(String(auditEvent.params[6] || ''), /\"unitRequestId\":71/);
  assert.match(String(auditEvent.params[6] || ''), /\"qcCheckId\":83/);

  const auditChanges = connection.calls.filter((call) => /INSERT INTO unit_audit_event_changes/.test(call.sql || ''));
  assert.equal(auditChanges.length, 5);
  const serialized = JSON.stringify(auditChanges.map((call) => call.params));
  assert.match(serialized, /QC Reversion Request/);
  assert.match(serialized, /Rejected/);
  assert.match(serialized, /Tech QC/);
  assert.match(serialized, /Wrong QC decision/);
  assert.match(serialized, /Keep the original QC decision/);
  assert.ok(connection.calls.some((call) => call.kind === 'commit'));
});


test('direct Tech Lead+ reversion proceeds when no QC reversion request is pending', async () => {
  qcCalls.length = 0;
  const connection = makeConnection();
  poolStub.getConnection = async () => connection;

  const result = await unitRequestModel.revertQcReviewDirectlyWithRequestGuard({
    unitId: 4124,
    qcCheckId: 83,
    revertedByUserId: 1,
    reversionReason: 'Direct correction'
  });

  assert.equal(result.reverted, true);
  assert.deepEqual(qcCalls[0].args, { unitId: 4124, qcCheckId: 83 });
  const revertCall = qcCalls.find((call) => call.kind === 'revert-target');
  assert.deepEqual(revertCall.args, {
    unitId: 4124,
    qcCheckId: 83,
    revertedByUserId: 1,
    reversionReason: 'Direct correction'
  });
  assert.ok(connection.calls.some((call) => call.kind === 'commit'));
  assert.equal(connection.calls.some((call) => call.kind === 'rollback'), false);
});

test('direct Tech Lead+ reversion refuses to bypass a pending QC reversion request', async () => {
  qcCalls.length = 0;
  const connection = makeConnection({ pendingRequest: 71 });
  poolStub.getConnection = async () => connection;

  await assert.rejects(
    unitRequestModel.revertQcReviewDirectlyWithRequestGuard({
      unitId: 4124,
      qcCheckId: 83,
      revertedByUserId: 1,
      reversionReason: 'Should use Requests'
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_PENDING_REQUEST' && error.unitRequestId === 71
  );

  assert.equal(qcCalls.some((call) => call.kind === 'revert-target'), false);
  assert.ok(connection.calls.some((call) => call.kind === 'rollback'));
  assert.equal(connection.calls.some((call) => call.kind === 'commit'), false);
});
