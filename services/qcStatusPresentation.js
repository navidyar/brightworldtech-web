'use strict';

function normalizeReviewHistory(reviews) {
  return Array.isArray(reviews)
    ? reviews.filter((review) => review && ['accepted', 'rejected'].includes(review.decisionCode))
    : [];
}

function normalizeCorrectionHistory(corrections) {
  return Array.isArray(corrections)
    ? corrections.filter((correction) => correction && Number.isSafeInteger(Number(correction.rejectedQcCheckId)))
    : [];
}

function buildWorkflowSteps(statusCode) {
  if (statusCode === 'corrected') {
    return [
      { code: 'rejected', label: 'Rejected', state: 'complete' },
      { code: 'corrected', label: 'Corrected', state: 'complete' },
      { code: 'accepted', label: 'Accepted', state: 'current' }
    ];
  }

  if (statusCode === 'ready_recheck') {
    return [
      { code: 'rejected', label: 'Rejected', state: 'complete' },
      { code: 'corrected', label: 'Corrected', state: 'complete' },
      { code: 'ready_recheck', label: 'Ready for recheck', state: 'current' }
    ];
  }

  if (statusCode === 'rejected') {
    return [
      { code: 'rejected', label: 'Rejected', state: 'current' },
      { code: 'pending_correction', label: 'Correction required', state: 'pending' }
    ];
  }

  return [];
}

function buildQcStatusPresentation({ reviews = [], corrections = [] } = {}) {
  const recordedReviewHistory = normalizeReviewHistory(reviews);
  const correctionHistory = normalizeCorrectionHistory(corrections);
  const latestRecordedReview = recordedReviewHistory.at(-1) || null;

  if (!latestRecordedReview) {
    return {
      available: false,
      statusCode: '',
      title: 'Quality Control status unavailable',
      statusLabel: 'Not reviewed',
      description: 'No Quality Control decision has been recorded for this Unit.',
      notesHeading: 'QC Notes',
      latestReview: null,
      latestCorrection: null,
      workflowSteps: []
    };
  }

  if (latestRecordedReview.isReverted) {
    return {
      available: true,
      statusCode: 'reverted',
      title: 'Quality Control decision reverted',
      statusLabel: 'Awaiting QC',
      description: 'The latest Quality Control decision was reverted. This Unit is awaiting a new QC decision.',
      notesHeading: 'Reverted Decision Notes',
      latestReview: latestRecordedReview,
      latestCorrection: null,
      workflowSteps: []
    };
  }

  const reviewHistory = recordedReviewHistory.filter((review) => !review.isReverted);
  const latestReview = reviewHistory.at(-1) || null;
  const rejectionIds = new Set(
    reviewHistory
      .filter((review) => review.decisionCode === 'rejected')
      .map((review) => Number(review.qcCheckId))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  );
  const relevantCorrections = correctionHistory.filter((correction) => rejectionIds.has(Number(correction.rejectedQcCheckId)));
  const latestCorrection = relevantCorrections.at(-1) || null;
  const latestReviewCorrection = latestReview.decisionCode === 'rejected'
    ? relevantCorrections.filter((correction) => Number(correction.rejectedQcCheckId) === Number(latestReview.qcCheckId)).at(-1) || null
    : null;
  const hasRejection = rejectionIds.size > 0;

  let statusCode;
  let title;
  let statusLabel;
  let description;
  let notesHeading;

  if (latestReview.decisionCode === 'accepted' && hasRejection) {
    statusCode = 'corrected';
    title = 'Corrected and accepted';
    statusLabel = 'Accepted after correction';
    description = 'This Unit was corrected after a QC rejection and later accepted by Quality Control.';
    notesHeading = 'Acceptance Notes';
  } else if (latestReview.decisionCode === 'accepted') {
    statusCode = 'accepted';
    title = 'Accepted by Quality Control';
    statusLabel = 'Accepted';
    description = 'This Unit passed Quality Control for its current completed work cycle.';
    notesHeading = 'Acceptance Notes';
  } else if (latestReviewCorrection) {
    statusCode = 'ready_recheck';
    title = 'Ready for Quality Control recheck';
    statusLabel = 'Ready for recheck';
    description = 'The technician marked the rejected Unit corrected and ready for another QC decision.';
    notesHeading = 'Rejection Reason';
  } else {
    statusCode = 'rejected';
    title = 'Rejected — correction required';
    statusLabel = 'Pending correction';
    description = 'Quality Control rejected this Unit. The rejection reason below identifies what must be corrected.';
    notesHeading = 'Rejection Reason';
  }

  const displayedCorrection = statusCode === 'corrected'
    ? latestCorrection
    : (statusCode === 'ready_recheck' ? latestReviewCorrection : null);

  return {
    available: true,
    statusCode,
    title,
    statusLabel,
    description,
    notesHeading,
    latestReview,
    latestCorrection: displayedCorrection,
    latestReviewCorrection,
    workflowSteps: buildWorkflowSteps(statusCode)
  };
}

module.exports = {
  buildQcStatusPresentation,
  buildWorkflowSteps,
  normalizeCorrectionHistory,
  normalizeReviewHistory
};
