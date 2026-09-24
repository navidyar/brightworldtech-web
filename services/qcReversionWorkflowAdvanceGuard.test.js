'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../models/db');
const auditPath = require.resolve('../models/unitAuditEventModel');
const lotQcPath = require.resolve('../models/lotQcRequirementModel');
const correctionPath = require.resolve('../models/unitQcCorrectionModel');
const cyclePolicyPath = require.resolve('./qcCompletionCyclePolicy');
const qcCheckPath = require.resolve('../models/unitQcCheckModel');

let correction = null;

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: {} }
};
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: {}
};
require.cache[lotQcPath] = {
  id: lotQcPath,
  filename: lotQcPath,
  loaded: true,
  exports: { async assertUnitQcRequired() {} }
};
require.cache[correctionPath] = {
  id: correctionPath,
  filename: correctionPath,
  loaded: true,
  exports: {
    async getLatestCorrectionForQcCheck(qcCheckId) {
      return correction ? { rejectedQcCheckId: qcCheckId, ...correction } : null;
    }
  }
};
require.cache[cyclePolicyPath] = {
  id: cyclePolicyPath,
  filename: cyclePolicyPath,
  loaded: true,
  exports: { assertCurrentQcCompletionCycle() {} }
};
delete require.cache[qcCheckPath];
const unitQcCheckModel = require('../models/unitQcCheckModel');

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

function makeConnection() {
  return {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.includes('information_schema.COLUMNS')) {
        return [requiredColumns.map((columnName) => ({ column_name: columnName }))];
      }
      if (normalized.includes('FROM unit_qc_checks qc') && normalized.includes('FOR UPDATE')) {
        return [[{
          unit_qc_check_id: 83,
          unit_id: 4124,
          unit_work_completion_id: 193,
          decision_code: 'rejected',
          review_notes: 'Repair required',
          reverted_at: null
        }]];
      }
      if (normalized.includes('ORDER BY unit_qc_check_id DESC') && normalized.includes('FOR UPDATE')) {
        return [[{ unit_qc_check_id: 83, reverted_at: null }]];
      }
      throw new Error(`Unexpected QC reversion guard query: ${normalized}`);
    }
  };
}

test('QC rejection remains revertible before a technician correction handoff', async () => {
  correction = null;
  const state = await unitQcCheckModel.lockQcReviewReversionTargetWithConnection(makeConnection(), {
    unitId: 4124,
    qcCheckId: 83
  });
  assert.equal(state.decision_code, 'rejected');
});

test('QC rejection cannot be reverted after the technician correction handoff', async () => {
  correction = { qcCorrectionId: 44 };
  await assert.rejects(
    unitQcCheckModel.lockQcReviewReversionTargetWithConnection(makeConnection(), {
      unitId: 4124,
      qcCheckId: 83
    }),
    (error) => error && error.code === 'BWT_QC_REVERSION_WORKFLOW_ADVANCED'
  );
});
