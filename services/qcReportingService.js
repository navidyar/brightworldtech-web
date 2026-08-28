'use strict';

const {
  calculateQcGradeSummariesByTechnician,
  calculateQcGradeSummary,
  groupReviewActionsByCompletion,
  normalizeReviewAction,
  roundPercentage
} = require('./qcGradingService');

function normalizeDisplayName(firstName, lastName, email, fallback) {
  const fullName = [firstName, lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return fullName || String(email || '').trim() || fallback;
}

function normalizeReportingRow(row = {}) {
  const review = normalizeReviewAction(row);
  if (!review) return null;

  const reviewerUserId = Number(row.reviewerUserId ?? row.reviewer_user_id);
  const safeReviewerUserId = Number.isSafeInteger(reviewerUserId) && reviewerUserId > 0
    ? reviewerUserId
    : null;
  const notes = String(row.reviewNotes ?? row.review_notes ?? '').trim();

  return {
    ...review,
    technicianName: normalizeDisplayName(
      row.technicianFirstName ?? row.technician_first_name,
      row.technicianLastName ?? row.technician_last_name,
      row.technicianEmail ?? row.technician_email,
      `Technician #${review.technicianUserId}`
    ),
    reviewerUserId: safeReviewerUserId,
    reviewerName: normalizeDisplayName(
      row.reviewerFirstName ?? row.reviewer_first_name,
      row.reviewerLastName ?? row.reviewer_last_name,
      row.reviewerEmail ?? row.reviewer_email,
      safeReviewerUserId ? `Reviewer #${safeReviewerUserId}` : 'Quality Control'
    ),
    reviewNotes: notes
  };
}

function compareNullableDatesDescending(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return rightTime - leftTime;
}

function createEmptyManagementQcReport() {
  return {
    summary: calculateQcGradeSummary([]),
    reviewedTechnicians: 0,
    activeReviewers: 0,
    rejectionActions: 0,
    technicianComparisons: [],
    reviewerActivity: []
  };
}

function buildManagementQcReport(sourceRows = []) {
  const rows = (Array.isArray(sourceRows) ? sourceRows : [])
    .map(normalizeReportingRow)
    .filter(Boolean)
    .sort((left, right) => left.unitQcCheckId - right.unitQcCheckId);

  if (rows.length === 0) {
    return createEmptyManagementQcReport();
  }

  const summary = calculateQcGradeSummary(rows);
  const technicianNames = new Map();
  const reviewerGroups = new Map();
  const cycles = groupReviewActionsByCompletion(rows);
  const firstReviewIds = new Set();

  rows.forEach((row) => {
    technicianNames.set(row.technicianUserId, row.technicianName);
  });

  cycles.forEach((cycle) => {
    const actions = [...cycle.actions].sort((left, right) => left.unitQcCheckId - right.unitQcCheckId);
    if (actions.length === 0) return;

    firstReviewIds.add(actions[0].unitQcCheckId);
  });

  rows.forEach((row) => {
    const reviewerKey = row.reviewerUserId || `name:${row.reviewerName}`;
    if (!reviewerGroups.has(reviewerKey)) {
      reviewerGroups.set(reviewerKey, {
        reviewerUserId: row.reviewerUserId,
        reviewerName: row.reviewerName,
        reviews: 0,
        acceptedReviews: 0,
        rejectedReviews: 0,
        firstPassReviews: 0,
        rechecks: 0,
        technicianIds: new Set(),
        latestReviewedAt: null
      });
    }

    const reviewer = reviewerGroups.get(reviewerKey);
    reviewer.reviews += 1;
    reviewer.acceptedReviews += row.decisionCode === 'accepted' ? 1 : 0;
    reviewer.rejectedReviews += row.decisionCode === 'rejected' ? 1 : 0;
    reviewer.firstPassReviews += firstReviewIds.has(row.unitQcCheckId) ? 1 : 0;
    reviewer.rechecks += firstReviewIds.has(row.unitQcCheckId) ? 0 : 1;
    reviewer.technicianIds.add(row.technicianUserId);
    if (!reviewer.latestReviewedAt || compareNullableDatesDescending(row.reviewedAt, reviewer.latestReviewedAt) < 0) {
      reviewer.latestReviewedAt = row.reviewedAt;
    }

  });

  const technicianComparisons = calculateQcGradeSummariesByTechnician(rows)
    .map((technicianSummary) => ({
      ...technicianSummary,
      technicianName: technicianNames.get(technicianSummary.technicianUserId)
        || `Technician #${technicianSummary.technicianUserId}`
    }))
    .sort((left, right) => (
      right.reviewedUnits - left.reviewedUnits
      || (right.qualityGrade ?? -1) - (left.qualityGrade ?? -1)
      || left.technicianName.localeCompare(right.technicianName)
    ));

  const reviewerActivity = [...reviewerGroups.values()]
    .map((reviewer) => ({
      reviewerUserId: reviewer.reviewerUserId,
      reviewerName: reviewer.reviewerName,
      reviews: reviewer.reviews,
      acceptedReviews: reviewer.acceptedReviews,
      rejectedReviews: reviewer.rejectedReviews,
      acceptanceRate: roundPercentage(reviewer.acceptedReviews, reviewer.reviews),
      firstPassReviews: reviewer.firstPassReviews,
      rechecks: reviewer.rechecks,
      techniciansReviewed: reviewer.technicianIds.size,
      latestReviewedAt: reviewer.latestReviewedAt
    }))
    .sort((left, right) => (
      right.reviews - left.reviews
      || compareNullableDatesDescending(left.latestReviewedAt, right.latestReviewedAt)
      || left.reviewerName.localeCompare(right.reviewerName)
    ));


  const report = {
    summary,
    reviewedTechnicians: technicianComparisons.length,
    activeReviewers: reviewerActivity.length,
    rejectionActions: rows.filter((row) => row.decisionCode === 'rejected').length,
    technicianComparisons,
    reviewerActivity
  };

  assertValidManagementQcReport(report);
  return report;
}

function assertValidManagementQcReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('Management QC report is required.');
  }

  for (const fieldName of ['reviewedTechnicians', 'activeReviewers', 'rejectionActions']) {
    const value = Number(report[fieldName]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Management QC report field ${fieldName} must be a non-negative integer.`);
    }
  }

  if (report.reviewedTechnicians !== report.technicianComparisons.length) {
    throw new Error('Management QC technician totals do not reconcile.');
  }

  if (report.activeReviewers !== report.reviewerActivity.length) {
    throw new Error('Management QC reviewer totals do not reconcile.');
  }

  const technicianReconciliationFields = [
    'reviewedUnits',
    'reviewActions',
    'firstPassAcceptedUnits',
    'firstPassRejectedUnits',
    'currentlyAcceptedUnits',
    'pendingCorrectionUnits',
    'readyForRecheckUnits',
    'rejectedUnits',
    'correctedUnits',
    'repeatedReviewUnits'
  ];

  technicianReconciliationFields.forEach((fieldName) => {
    const technicianTotal = report.technicianComparisons
      .reduce((total, technician) => total + Number(technician[fieldName] || 0), 0);
    const summaryTotal = Number(report.summary[fieldName] || 0);

    if (technicianTotal !== summaryTotal) {
      throw new Error(`Management QC technician ${fieldName} totals do not reconcile to the overall summary.`);
    }
  });

  const reviewerReviewCount = report.reviewerActivity
    .reduce((total, reviewer) => total + Number(reviewer.reviews || 0), 0);
  if (reviewerReviewCount !== report.summary.reviewActions) {
    throw new Error('Management QC reviewer actions do not reconcile to the overall review total.');
  }

  const reviewerRejectionCount = report.reviewerActivity
    .reduce((total, reviewer) => total + Number(reviewer.rejectedReviews || 0), 0);
  if (reviewerRejectionCount !== report.rejectionActions) {
    throw new Error('Management QC rejection actions do not reconcile to reviewer activity.');
  }

  return true;
}

module.exports = {
  assertValidManagementQcReport,
  buildManagementQcReport,
  createEmptyManagementQcReport,
  normalizeReportingRow
};
