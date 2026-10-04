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
    reviewNotes: notes,
    reviewerAuditOutcome: ['agree', 'missed_defect', 'false_rejection'].includes(String(row.reviewerAuditOutcome ?? row.reviewer_audit_outcome ?? '').trim().toLowerCase())
      ? String(row.reviewerAuditOutcome ?? row.reviewer_audit_outcome).trim().toLowerCase()
      : null,
    reviewerAuditedAt: row.reviewerAuditedAt ?? row.reviewer_audited_at ?? null,
    reviewerAuditedByUserId: Number(row.reviewerAuditedByUserId ?? row.reviewer_audited_by_user_id) || null
  };
}

function compareNullableDatesDescending(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return rightTime - leftTime;
}

function reviewTurnaroundMinutes(row) {
  if (!row || !row.completedAt || !row.reviewedAt) return null;
  const completed = new Date(row.completedAt).getTime();
  const reviewed = new Date(row.reviewedAt).getTime();
  if (!Number.isFinite(completed) || !Number.isFinite(reviewed) || reviewed < completed) return null;
  return Math.round((reviewed - completed) / 60000);
}

function median(values = []) {
  const safe = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!safe.length) return null;
  const middle = Math.floor(safe.length / 2);
  if (safe.length % 2) return safe[middle];
  return Number(((safe[middle - 1] + safe[middle]) / 2).toFixed(1));
}

function emptyReviewerOversightSummary() {
  return {
    auditedReviews: 0,
    auditAgreements: 0,
    missedDefects: 0,
    falseRejections: 0,
    auditAgreementRate: null,
    auditCoverageRate: null
  };
}

function createEmptyManagementQcReport() {
  return {
    summary: calculateQcGradeSummary([]),
    reviewedTechnicians: 0,
    activeReviewers: 0,
    rejectionActions: 0,
    technicianComparisons: [],
    reviewerActivity: [],
    reviewerOversight: emptyReviewerOversightSummary()
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
        turnaroundMinutes: [],
        auditedReviews: 0,
        auditAgreements: 0,
        missedDefects: 0,
        falseRejections: 0,
        unauditedQcCheckIds: [],
        latestReviewedAt: null,
        latestAuditedAt: null
      });
    }

    const reviewer = reviewerGroups.get(reviewerKey);
    reviewer.reviews += 1;
    reviewer.acceptedReviews += row.decisionCode === 'accepted' ? 1 : 0;
    reviewer.rejectedReviews += row.decisionCode === 'rejected' ? 1 : 0;
    reviewer.firstPassReviews += firstReviewIds.has(row.unitQcCheckId) ? 1 : 0;
    reviewer.rechecks += firstReviewIds.has(row.unitQcCheckId) ? 0 : 1;
    reviewer.technicianIds.add(row.technicianUserId);
    const turnaround = reviewTurnaroundMinutes(row);
    if (turnaround !== null) reviewer.turnaroundMinutes.push(turnaround);
    if (row.reviewerAuditOutcome) {
      reviewer.auditedReviews += 1;
      reviewer.auditAgreements += row.reviewerAuditOutcome === 'agree' ? 1 : 0;
      reviewer.missedDefects += row.reviewerAuditOutcome === 'missed_defect' ? 1 : 0;
      reviewer.falseRejections += row.reviewerAuditOutcome === 'false_rejection' ? 1 : 0;
      if (!reviewer.latestAuditedAt || compareNullableDatesDescending(row.reviewerAuditedAt, reviewer.latestAuditedAt) < 0) {
        reviewer.latestAuditedAt = row.reviewerAuditedAt;
      }
    } else {
      reviewer.unauditedQcCheckIds.push(row.unitQcCheckId);
    }
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
      medianReviewMinutes: median(reviewer.turnaroundMinutes),
      auditedReviews: reviewer.auditedReviews,
      auditAgreements: reviewer.auditAgreements,
      missedDefects: reviewer.missedDefects,
      falseRejections: reviewer.falseRejections,
      auditAgreementRate: roundPercentage(reviewer.auditAgreements, reviewer.auditedReviews),
      auditCoverageRate: roundPercentage(reviewer.auditedReviews, reviewer.reviews),
      auditSampleQcCheckId: reviewer.unauditedQcCheckIds.length
        ? reviewer.unauditedQcCheckIds[Math.floor(Math.random() * reviewer.unauditedQcCheckIds.length)]
        : null,
      latestReviewedAt: reviewer.latestReviewedAt,
      latestAuditedAt: reviewer.latestAuditedAt
    }))
    .sort((left, right) => (
      right.reviews - left.reviews
      || compareNullableDatesDescending(left.latestReviewedAt, right.latestReviewedAt)
      || left.reviewerName.localeCompare(right.reviewerName)
    ));


  const reviewerOversight = reviewerActivity.reduce((summary, reviewer) => {
    summary.auditedReviews += Number(reviewer.auditedReviews || 0);
    summary.auditAgreements += Number(reviewer.auditAgreements || 0);
    summary.missedDefects += Number(reviewer.missedDefects || 0);
    summary.falseRejections += Number(reviewer.falseRejections || 0);
    return summary;
  }, emptyReviewerOversightSummary());
  reviewerOversight.auditAgreementRate = roundPercentage(reviewerOversight.auditAgreements, reviewerOversight.auditedReviews);
  reviewerOversight.auditCoverageRate = roundPercentage(reviewerOversight.auditedReviews, rows.length);


  const report = {
    summary,
    reviewedTechnicians: technicianComparisons.length,
    activeReviewers: reviewerActivity.length,
    rejectionActions: rows.filter((row) => row.decisionCode === 'rejected').length,
    technicianComparisons,
    reviewerActivity,
    reviewerOversight
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

  const oversight = report.reviewerOversight || emptyReviewerOversightSummary();
  const auditedFromReviewers = report.reviewerActivity.reduce((total, reviewer) => total + Number(reviewer.auditedReviews || 0), 0);
  const exceptionsFromReviewers = report.reviewerActivity.reduce((total, reviewer) => total + Number(reviewer.missedDefects || 0) + Number(reviewer.falseRejections || 0), 0);
  if (Number(oversight.auditedReviews || 0) !== auditedFromReviewers) {
    throw new Error('Management QC audit coverage does not reconcile to reviewer activity.');
  }
  if (Number(oversight.missedDefects || 0) + Number(oversight.falseRejections || 0) !== exceptionsFromReviewers) {
    throw new Error('Management QC audit exceptions do not reconcile to reviewer activity.');
  }

  return true;
}

module.exports = {
  assertValidManagementQcReport,
  buildManagementQcReport,
  createEmptyManagementQcReport,
  normalizeReportingRow,
  reviewTurnaroundMinutes
};
