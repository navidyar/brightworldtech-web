'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildQcOperationalAudit,
  inspectQcReviewSequences,
  resolveCorrectionWorkflowBoundary
} = require('./qcOperationalAuditService');

test('operational sequence audit accepts reject, correction, and recheck ordering', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 10, unit_qc_check_id: 1, decision_code: 'rejected', reviewed_at: '2026-07-29T10:00:00Z', unit_qc_correction_id: 20, correction_submitted_at: '2026-07-29T11:00:00Z' },
    { unit_work_completion_id: 10, unit_qc_check_id: 2, decision_code: 'accepted', reviewed_at: '2026-07-29T12:00:00Z' }
  ]);

  assert.equal(sequence.completionCycles, 1);
  assert.equal(sequence.rechecksWithoutCorrection, 0);
  assert.equal(sequence.correctionAfterRecheck, 0);
  assert.equal(sequence.acceptedThenReviewedCycles, 0);
});

test('operational sequence audit flags rechecks without a correction and legacy accepted-cycle reviews', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 10, unit_qc_check_id: 1, decision_code: 'rejected', reviewed_at: '2026-07-29T10:00:00Z' },
    { unit_work_completion_id: 10, unit_qc_check_id: 2, decision_code: 'accepted', reviewed_at: '2026-07-29T12:00:00Z' },
    { unit_work_completion_id: 20, unit_qc_check_id: 3, decision_code: 'accepted', reviewed_at: '2026-07-29T10:00:00Z' },
    { unit_work_completion_id: 20, unit_qc_check_id: 4, decision_code: 'rejected', reviewed_at: '2026-07-29T11:00:00Z' }
  ]);

  assert.equal(sequence.rechecksWithoutCorrection, 1);
  assert.deepEqual(sequence.affectedCompletionIds.recheckWithoutCorrection, [10]);
  assert.equal(sequence.acceptedThenReviewedCycles, 1);
  assert.deepEqual(sequence.affectedCompletionIds.acceptedThenReviewed, [20]);
});

test('operational audit passes reconciled storage and preserves legacy accepted-cycle anomalies as warnings', () => {
  const audit = buildQcOperationalAudit({
    role: { code: 'qc', name: 'Quality Control', is_active: 1 },
    storage: { reviewSchemaReady: true, correctionSchemaReady: true },
    integrity: { reviewRows: 4, correctionRows: 1 },
    history: { missingReviewAuditEvents: 0, missingCorrectionAuditEvents: 0 },
    sequences: { completionCycles: 3, acceptedThenReviewedCycles: 1 },
    reporting: { reconciled: true, reviewedTechnicians: 2, reviewActions: 4 }
  });

  assert.equal(audit.passed, true);
  assert.equal(audit.blockers.length, 0);
  assert.equal(audit.warnings.length, 1);
  assert.equal(audit.metrics.acceptedThenReviewedCycles, 1);
});

test('operational audit blocks storage, history, integrity, sequence, and reporting failures', () => {
  const audit = buildQcOperationalAudit({
    role: { code: 'qc', name: 'QC', is_active: 0 },
    storage: { reviewSchemaReady: false, correctionSchemaReady: false },
    integrity: {
      reviewUnitMismatches: 1,
      correctionDecisionMismatches: 1,
      correctionUnitMismatches: 1,
      correctionBeforeRejection: 1
    },
    history: { missingReviewAuditEvents: 1, missingCorrectionAuditEvents: 1 },
    sequences: { rechecksWithoutCorrection: 1, correctionAfterRecheck: 1 },
    reporting: { reconciled: false }
  });

  assert.equal(audit.passed, false);
  assert.ok(audit.blockers.length >= 10);
});

test('operational sequence audit preserves only pre-workflow missing-correction rechecks as legacy warnings', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 10, unit_qc_check_id: 1, decision_code: 'rejected', reviewed_at: '2026-07-29T14:00:00Z' },
    { unit_work_completion_id: 10, unit_qc_check_id: 2, decision_code: 'accepted', reviewed_at: '2026-07-29T14:05:00Z' },
    { unit_work_completion_id: 20, unit_qc_check_id: 3, decision_code: 'rejected', reviewed_at: '2026-07-29T16:00:00Z' },
    { unit_work_completion_id: 20, unit_qc_check_id: 4, decision_code: 'accepted', reviewed_at: '2026-07-29T16:05:00Z' }
  ], { correctionWorkflowStartedAt: '2026-07-29T15:17:37Z' });

  assert.equal(sequence.legacyRechecksWithoutCorrection, 1);
  assert.deepEqual(sequence.affectedCompletionIds.legacyRecheckWithoutCorrection, [10]);
  assert.equal(sequence.rechecksWithoutCorrection, 1);
  assert.deepEqual(sequence.affectedCompletionIds.recheckWithoutCorrection, [20]);
});

test('operational sequence audit does not downgrade missing-correction rechecks when the workflow boundary is unavailable', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 10, unit_qc_check_id: 1, decision_code: 'rejected', reviewed_at: '2026-07-29T14:00:00Z' },
    { unit_work_completion_id: 10, unit_qc_check_id: 2, decision_code: 'accepted', reviewed_at: '2026-07-29T14:05:00Z' }
  ]);

  assert.equal(sequence.legacyRechecksWithoutCorrection, 0);
  assert.equal(sequence.rechecksWithoutCorrection, 1);
});

test('operational audit warns for legacy pre-workflow rechecks while blocking post-workflow ones', () => {
  const legacyAudit = buildQcOperationalAudit({
    role: { code: 'qc', name: 'Quality Control', is_active: 1 },
    storage: { reviewSchemaReady: true, correctionSchemaReady: true },
    integrity: {},
    history: {},
    sequences: { legacyRechecksWithoutCorrection: 2 },
    reporting: { reconciled: true }
  });
  assert.equal(legacyAudit.passed, true);
  assert.match(legacyAudit.warnings.join('\n'), /before Stage 9G correction storage existed/);

  const currentAudit = buildQcOperationalAudit({
    role: { code: 'qc', name: 'Quality Control', is_active: 1 },
    storage: { reviewSchemaReady: true, correctionSchemaReady: true },
    integrity: {},
    history: {},
    sequences: { rechecksWithoutCorrection: 1 },
    reporting: { reconciled: true }
  });
  assert.equal(currentAudit.passed, false);
  assert.match(currentAudit.blockers.join('\n'), /after the correction workflow became available/);
});


test('correction workflow boundary is reliable only when table creation does not postdate stored corrections', () => {
  const reliable = resolveCorrectionWorkflowBoundary(
    '2026-07-29T15:17:37Z',
    '2026-07-29T16:32:48Z'
  );
  assert.equal(reliable.boundaryReliable, true);
  assert.equal(reliable.correctionWorkflowStartedAt, '2026-07-29T15:17:37Z');

  const drifted = resolveCorrectionWorkflowBoundary(
    '2026-08-01T00:00:00Z',
    '2026-07-29T16:32:48Z'
  );
  assert.equal(drifted.boundaryReliable, false);
  assert.equal(drifted.correctionWorkflowStartedAt, null);

  const missing = resolveCorrectionWorkflowBoundary(null, '2026-07-29T16:32:48Z');
  assert.equal(missing.boundaryReliable, false);
  assert.equal(missing.correctionWorkflowStartedAt, null);
});


test('operational sequence audit allows a new QC review after the previous accepted decision was explicitly reverted', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 30, unit_qc_check_id: 10, decision_code: 'accepted', reviewed_at: '2026-08-24T10:00:00Z', reverted_at: '2026-08-24T10:05:00Z' },
    { unit_work_completion_id: 30, unit_qc_check_id: 11, decision_code: 'rejected', reviewed_at: '2026-08-24T10:10:00Z' }
  ]);

  assert.equal(sequence.acceptedThenReviewedCycles, 0);
  assert.equal(sequence.rechecksWithoutCorrection, 0);
});

test('operational sequence audit does not require a correction handoff after a rejected decision that was reverted', () => {
  const sequence = inspectQcReviewSequences([
    { unit_work_completion_id: 31, unit_qc_check_id: 12, decision_code: 'rejected', reviewed_at: '2026-08-24T11:00:00Z', reverted_at: '2026-08-24T11:05:00Z' },
    { unit_work_completion_id: 31, unit_qc_check_id: 13, decision_code: 'accepted', reviewed_at: '2026-08-24T11:10:00Z' }
  ]);

  assert.equal(sequence.rechecksWithoutCorrection, 0);
  assert.equal(sequence.legacyRechecksWithoutCorrection, 0);
});
