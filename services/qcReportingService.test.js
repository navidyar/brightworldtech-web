'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertValidManagementQcReport,
  buildManagementQcReport,
  createEmptyManagementQcReport
} = require('./qcReportingService');

function review(overrides = {}) {
  return {
    technician_user_id: 1,
    technician_first_name: 'Alex',
    technician_last_name: 'Tech',
    technician_email: 'alex@example.com',
    unit_work_completion_id: 101,
    unit_id: 501,
    completed_at: '2026-07-01T12:00:00.000Z',
    unit_qc_check_id: 1,
    decision_code: 'accepted',
    review_notes: null,
    reviewed_at: '2026-07-01T13:00:00.000Z',
    reviewer_user_id: 10,
    reviewer_first_name: 'Quinn',
    reviewer_last_name: 'Reviewer',
    reviewer_email: 'quinn@example.com',
    has_correction_submission: 0,
    ...overrides
  };
}

test('management QC reporting reconciles technician, reviewer, and rejection metrics', () => {
  const rows = [
    review(),
    review({
      unit_work_completion_id: 102,
      unit_id: 502,
      unit_qc_check_id: 2,
      decision_code: 'rejected',
      review_notes: 'Screen scratch',
      reviewed_at: '2026-07-02T13:00:00.000Z',
      has_correction_submission: 1
    }),
    review({
      unit_work_completion_id: 102,
      unit_id: 502,
      unit_qc_check_id: 3,
      decision_code: 'accepted',
      reviewed_at: '2026-07-03T13:00:00.000Z',
      reviewer_user_id: 11,
      reviewer_first_name: 'Riley',
      reviewer_last_name: 'QC',
      reviewer_email: 'riley@example.com'
    }),
    review({
      technician_user_id: 2,
      technician_first_name: 'Blake',
      technician_last_name: 'Tech',
      technician_email: 'blake@example.com',
      unit_work_completion_id: 201,
      unit_id: 601,
      unit_qc_check_id: 4,
      decision_code: 'rejected',
      review_notes: '  SCREEN   SCRATCH ',
      reviewed_at: '2026-07-04T13:00:00.000Z'
    }),
    review({
      technician_user_id: 2,
      technician_first_name: 'Blake',
      technician_last_name: 'Tech',
      technician_email: 'blake@example.com',
      unit_work_completion_id: 202,
      unit_id: 602,
      unit_qc_check_id: 5,
      decision_code: 'rejected',
      review_notes: 'Missing screws',
      reviewed_at: '2026-07-05T13:00:00.000Z',
      reviewer_user_id: 11,
      reviewer_first_name: 'Riley',
      reviewer_last_name: 'QC',
      reviewer_email: 'riley@example.com',
      has_correction_submission: 1
    })
  ];

  const report = buildManagementQcReport(rows);

  assert.equal(report.summary.reviewedUnits, 4);
  assert.equal(report.summary.reviewActions, 5);
  assert.equal(report.summary.qualityGrade, 25);
  assert.equal(report.summary.currentAcceptanceRate, 50);
  assert.equal(report.summary.correctionResolutionRate, 33.3);
  assert.equal(report.summary.pendingCorrectionUnits, 1);
  assert.equal(report.summary.readyForRecheckUnits, 1);
  assert.equal(report.reviewedTechnicians, 2);
  assert.equal(report.activeReviewers, 2);
  assert.equal(report.rejectionActions, 3);

  const alex = report.technicianComparisons.find((item) => item.technicianUserId === 1);
  assert.deepEqual({
    reviewed: alex.reviewedUnits,
    firstPassAccepted: alex.firstPassAcceptedUnits,
    firstPassRejected: alex.firstPassRejectedUnits,
    quality: alex.qualityGrade,
    currentlyAccepted: alex.currentlyAcceptedUnits,
    current: alex.currentAcceptanceRate,
    corrected: alex.correctedUnits,
    repeated: alex.repeatedReviewUnits
  }, {
    reviewed: 2,
    firstPassAccepted: 1,
    firstPassRejected: 1,
    quality: 50,
    currentlyAccepted: 2,
    current: 100,
    corrected: 1,
    repeated: 1
  });

  const quinn = report.reviewerActivity.find((item) => item.reviewerUserId === 10);
  assert.deepEqual({
    reviews: quinn.reviews,
    accepted: quinn.acceptedReviews,
    rejected: quinn.rejectedReviews,
    acceptance: quinn.acceptanceRate,
    firstPass: quinn.firstPassReviews,
    rechecks: quinn.rechecks
  }, {
    reviews: 3,
    accepted: 1,
    rejected: 2,
    acceptance: 33.3,
    firstPass: 3,
    rechecks: 0
  });

  const screenScratch = report.rejectionPatterns.find((item) => item.reason === 'Screen scratch');
  assert.deepEqual({
    occurrences: screenScratch.occurrences,
    technicians: screenScratch.techniciansAffected,
    resolved: screenScratch.resolvedAfterCorrection,
    pending: screenScratch.pendingCorrection,
    ready: screenScratch.readyForRecheck
  }, {
    occurrences: 2,
    technicians: 2,
    resolved: 1,
    pending: 1,
    ready: 0
  });

  assert.equal(report.rejectionPatterns[1].reason, 'Missing screws');
  assert.equal(report.rejectionPatterns[1].readyForRecheck, 1);
  assert.equal(assertValidManagementQcReport(report), true);
});

test('one accepted reviewed Unit reports one accepted count and two matching 100 percent rates', () => {
  const report = buildManagementQcReport([
    review({
      technician_first_name: 'David',
      technician_last_name: 'Qian'
    })
  ]);
  const technician = report.technicianComparisons[0];

  assert.deepEqual({
    reviewedUnits: technician.reviewedUnits,
    firstPassAcceptedUnits: technician.firstPassAcceptedUnits,
    qualityGrade: technician.qualityGrade,
    currentlyAcceptedUnits: technician.currentlyAcceptedUnits,
    currentAcceptanceRate: technician.currentAcceptanceRate,
    firstPassRejectedUnits: technician.firstPassRejectedUnits,
    correctedUnits: technician.correctedUnits,
    pendingCorrectionUnits: technician.pendingCorrectionUnits,
    readyForRecheckUnits: technician.readyForRecheckUnits,
    repeatedReviewUnits: technician.repeatedReviewUnits
  }, {
    reviewedUnits: 1,
    firstPassAcceptedUnits: 1,
    qualityGrade: 100,
    currentlyAcceptedUnits: 1,
    currentAcceptanceRate: 100,
    firstPassRejectedUnits: 0,
    correctedUnits: 0,
    pendingCorrectionUnits: 0,
    readyForRecheckUnits: 0,
    repeatedReviewUnits: 0
  });
});

test('empty reporting data remains ungraded and reconciled', () => {
  const report = createEmptyManagementQcReport();

  assert.equal(report.summary.gradingStatus, 'ungraded');
  assert.equal(report.summary.qualityGrade, null);
  assert.equal(report.reviewedTechnicians, 0);
  assert.deepEqual(report.technicianComparisons, []);
  assert.equal(assertValidManagementQcReport(report), true);
});

test('rejection pattern limit is enforced after frequency sorting', () => {
  const rows = [
    review({ unit_qc_check_id: 1, decision_code: 'rejected', review_notes: 'One' }),
    review({ unit_work_completion_id: 102, unit_qc_check_id: 2, decision_code: 'rejected', review_notes: 'Two' }),
    review({ unit_work_completion_id: 103, unit_qc_check_id: 3, decision_code: 'rejected', review_notes: 'Two' })
  ];

  const report = buildManagementQcReport(rows, { rejectionPatternLimit: 1 });
  assert.equal(report.rejectionPatterns.length, 1);
  assert.equal(report.rejectionPatterns[0].reason, 'Two');
  assert.equal(report.rejectionPatterns[0].occurrences, 2);
});

test('management QC reporting rejects technician totals that do not reconcile to the summary', () => {
  const report = buildManagementQcReport([
    review(),
    review({
      technician_user_id: 2,
      technician_first_name: 'Blake',
      technician_last_name: 'Tech',
      technician_email: 'blake@example.com',
      unit_work_completion_id: 201,
      unit_id: 601,
      unit_qc_check_id: 2,
      decision_code: 'rejected'
    })
  ]);

  report.technicianComparisons[0].firstPassAcceptedUnits += 1;

  assert.throws(
    () => assertValidManagementQcReport(report),
    /firstPassAcceptedUnits totals do not reconcile/
  );
});

