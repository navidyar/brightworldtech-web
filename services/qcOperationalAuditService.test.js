'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildQcOperationalAudit,
  inspectQcReviewSequences
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
