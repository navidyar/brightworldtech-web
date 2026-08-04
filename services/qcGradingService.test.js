'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertValidQcGradeSummary,
  calculateQcGradeSummariesByTechnician,
  calculateQcGradeSummary,
  roundPercentage
} = require('./qcGradingService');

function review({ tech = 10, completion, check, decision, corrected = false }) {
  return {
    technician_user_id: tech,
    unit_work_completion_id: completion,
    unit_qc_check_id: check,
    decision_code: decision,
    has_correction_submission: corrected ? 1 : 0
  };
}

test('unreviewed technicians remain ungraded instead of receiving an artificial perfect score', () => {
  const summary = calculateQcGradeSummary([], { technicianUserId: 10 });

  assert.equal(summary.reviewedUnits, 0);
  assert.equal(summary.qualityGrade, null);
  assert.equal(summary.currentAcceptanceRate, null);
  assert.equal(summary.correctionResolutionRate, null);
  assert.equal(summary.gradingStatus, 'ungraded');
  assert.equal(assertValidQcGradeSummary(summary), true);
});

test('first-pass grade stays separate from current acceptance and correction resolution', () => {
  const summary = calculateQcGradeSummary([
    review({ completion: 100, check: 1, decision: 'accepted' }),
    review({ completion: 101, check: 2, decision: 'rejected' }),
    review({ completion: 102, check: 3, decision: 'rejected' }),
    review({ completion: 102, check: 4, decision: 'accepted' })
  ], { technicianUserId: 10 });

  assert.deepEqual({
    reviewedUnits: summary.reviewedUnits,
    reviewActions: summary.reviewActions,
    firstPassAcceptedUnits: summary.firstPassAcceptedUnits,
    firstPassRejectedUnits: summary.firstPassRejectedUnits,
    currentlyAcceptedUnits: summary.currentlyAcceptedUnits,
    pendingCorrectionUnits: summary.pendingCorrectionUnits,
    readyForRecheckUnits: summary.readyForRecheckUnits,
    rejectedUnits: summary.rejectedUnits,
    correctedUnits: summary.correctedUnits,
    repeatedReviewUnits: summary.repeatedReviewUnits,
    qualityGrade: summary.qualityGrade,
    currentAcceptanceRate: summary.currentAcceptanceRate,
    correctionResolutionRate: summary.correctionResolutionRate
  }, {
    reviewedUnits: 3,
    reviewActions: 4,
    firstPassAcceptedUnits: 1,
    firstPassRejectedUnits: 2,
    currentlyAcceptedUnits: 2,
    pendingCorrectionUnits: 1,
    readyForRecheckUnits: 0,
    rejectedUnits: 2,
    correctedUnits: 1,
    repeatedReviewUnits: 1,
    qualityGrade: 33.3,
    currentAcceptanceRate: 66.7,
    correctionResolutionRate: 50
  });
  assert.equal(assertValidQcGradeSummary(summary), true);
});

test('a completion cycle that is ever rejected cannot retain first-pass credit', () => {
  const summary = calculateQcGradeSummary([
    review({ completion: 200, check: 7, decision: 'accepted' }),
    review({ completion: 200, check: 8, decision: 'rejected', corrected: true }),
    review({ completion: 200, check: 9, decision: 'accepted' })
  ], { technicianUserId: 10 });

  assert.equal(summary.firstPassAcceptedUnits, 0);
  assert.equal(summary.firstPassRejectedUnits, 1);
  assert.equal(summary.qualityGrade, 0);
  assert.equal(summary.currentAcceptanceRate, 100);
  assert.equal(summary.correctedUnits, 1);
  assert.equal(summary.correctionResolutionRate, 100);
  assert.equal(summary.repeatedReviewUnits, 1);
  assert.equal(assertValidQcGradeSummary(summary), true);
});

test('Anna-style totals report one of two Units as first-pass accepted when the other required correction', () => {
  const summary = calculateQcGradeSummary([
    review({ completion: 210, check: 10, decision: 'accepted' }),
    review({ completion: 211, check: 11, decision: 'accepted' }),
    review({ completion: 211, check: 12, decision: 'rejected', corrected: true }),
    review({ completion: 211, check: 13, decision: 'accepted' })
  ], { technicianUserId: 10 });

  assert.deepEqual({
    reviewedUnits: summary.reviewedUnits,
    firstPassAcceptedUnits: summary.firstPassAcceptedUnits,
    firstPassRejectedUnits: summary.firstPassRejectedUnits,
    qualityGrade: summary.qualityGrade,
    currentlyAcceptedUnits: summary.currentlyAcceptedUnits,
    currentAcceptanceRate: summary.currentAcceptanceRate,
    correctedUnits: summary.correctedUnits,
    repeatedReviewUnits: summary.repeatedReviewUnits
  }, {
    reviewedUnits: 2,
    firstPassAcceptedUnits: 1,
    firstPassRejectedUnits: 1,
    qualityGrade: 50,
    currentlyAcceptedUnits: 2,
    currentAcceptanceRate: 100,
    correctedUnits: 1,
    repeatedReviewUnits: 1
  });
  assert.equal(assertValidQcGradeSummary(summary), true);
});


test('a correction submission moves a rejected Unit from pending correction to ready for recheck', () => {
  const summary = calculateQcGradeSummary([
    review({ completion: 250, check: 10, decision: 'rejected', corrected: true })
  ], { technicianUserId: 10 });

  assert.equal(summary.pendingCorrectionUnits, 0);
  assert.equal(summary.readyForRecheckUnits, 1);
  assert.equal(summary.currentlyAcceptedUnits, 0);
  assert.equal(assertValidQcGradeSummary(summary), true);
});

test('technician summaries never mix completion cycles across users', () => {
  const summaries = calculateQcGradeSummariesByTechnician([
    review({ tech: 10, completion: 300, check: 1, decision: 'accepted' }),
    review({ tech: 11, completion: 301, check: 2, decision: 'rejected' })
  ], [10, 11, 12]);

  assert.deepEqual(summaries.map((summary) => [summary.technicianUserId, summary.qualityGrade]), [
    [10, 100],
    [11, 0],
    [12, null]
  ]);
});

test('percentage rounding is stable and bounded to the 0 through 100 grading scale', () => {
  assert.equal(roundPercentage(1, 3), 33.3);
  assert.equal(roundPercentage(4, 3), 100);
  assert.equal(roundPercentage(-1, 3), 0);
  assert.equal(roundPercentage(0, 0), null);
});
