'use strict';

const ACCEPTED = 'accepted';
const REJECTED = 'rejected';
const VALID_DECISIONS = new Set([ACCEPTED, REJECTED]);

const QC_GRADE_POLICY = Object.freeze({
  qualityGradeBasis: 'accepted_without_rejection',
  firstPassRejectedBasis: 'completion_cycle_contains_rejection',
  currentAcceptanceBasis: 'latest_review_decision',
  correctionResolutionBasis: 'rejected_cycle_later_accepted',
  dateScopeBasis: 'completion_date',
  reversedCompletionsExcluded: true,
  unreviewedUnitsExcluded: true
});

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDecision(value) {
  const decision = String(value || '').trim().toLowerCase();
  return VALID_DECISIONS.has(decision) ? decision : null;
}

function roundPercentage(numerator, denominator) {
  const safeNumerator = Number(numerator || 0);
  const safeDenominator = Number(denominator || 0);

  if (!Number.isFinite(safeNumerator) || !Number.isFinite(safeDenominator) || safeDenominator <= 0) {
    return null;
  }

  const percentage = Math.max(0, Math.min(100, (safeNumerator / safeDenominator) * 100));
  return Number(percentage.toFixed(1));
}

function normalizeReviewAction(row = {}) {
  const technicianUserId = normalizePositiveInteger(row.technicianUserId ?? row.technician_user_id);
  const unitWorkCompletionId = normalizePositiveInteger(
    row.unitWorkCompletionId ?? row.unit_work_completion_id
  );
  const unitQcCheckId = normalizePositiveInteger(row.unitQcCheckId ?? row.unit_qc_check_id);
  const decisionCode = normalizeDecision(row.decisionCode ?? row.decision_code);

  if (!technicianUserId || !unitWorkCompletionId || !unitQcCheckId || !decisionCode) {
    return null;
  }

  return {
    technicianUserId,
    unitWorkCompletionId,
    unitQcCheckId,
    unitId: normalizePositiveInteger(row.unitId ?? row.unit_id),
    decisionCode,
    completedAt: row.completedAt ?? row.completed_at ?? null,
    reviewedAt: row.reviewedAt ?? row.reviewed_at ?? null,
    hasCorrectionSubmission: Number(row.hasCorrectionSubmission ?? row.has_correction_submission ?? 0) === 1
  };
}

function groupReviewActionsByCompletion(reviewActions = []) {
  const cycles = new Map();

  for (const sourceRow of Array.isArray(reviewActions) ? reviewActions : []) {
    const action = normalizeReviewAction(sourceRow);
    if (!action) continue;

    const key = `${action.technicianUserId}:${action.unitWorkCompletionId}`;
    if (!cycles.has(key)) {
      cycles.set(key, {
        technicianUserId: action.technicianUserId,
        unitWorkCompletionId: action.unitWorkCompletionId,
        unitId: action.unitId,
        completedAt: action.completedAt,
        actions: []
      });
    }

    cycles.get(key).actions.push(action);
  }

  return [...cycles.values()].map((cycle) => {
    cycle.actions.sort((left, right) => left.unitQcCheckId - right.unitQcCheckId);
    return cycle;
  });
}

function createEmptyQcGradeSummary(technicianUserId = null) {
  return {
    technicianUserId: normalizePositiveInteger(technicianUserId),
    reviewedUnits: 0,
    reviewActions: 0,
    firstPassAcceptedUnits: 0,
    firstPassRejectedUnits: 0,
    currentlyAcceptedUnits: 0,
    pendingCorrectionUnits: 0,
    readyForRecheckUnits: 0,
    rejectedUnits: 0,
    correctedUnits: 0,
    repeatedReviewUnits: 0,
    qualityGrade: null,
    currentAcceptanceRate: null,
    correctionResolutionRate: null,
    gradingStatus: 'ungraded',
    policy: QC_GRADE_POLICY
  };
}

function calculateQcGradeSummary(reviewActions = [], { technicianUserId = null } = {}) {
  const safeTechnicianUserId = normalizePositiveInteger(technicianUserId);
  const cycles = groupReviewActionsByCompletion(reviewActions)
    .filter((cycle) => !safeTechnicianUserId || cycle.technicianUserId === safeTechnicianUserId);
  const summary = createEmptyQcGradeSummary(safeTechnicianUserId);

  for (const cycle of cycles) {
    const firstAction = cycle.actions[0];
    const latestAction = cycle.actions[cycle.actions.length - 1];
    const wasRejected = cycle.actions.some((action) => action.decisionCode === REJECTED);

    summary.reviewedUnits += 1;
    summary.reviewActions += cycle.actions.length;
    summary.repeatedReviewUnits += cycle.actions.length > 1 ? 1 : 0;
    // A completion cycle earns first-pass credit only when it never required a rejection.
    // This keeps historical Accept -> Reject -> Correct -> Accept anomalies from being
    // reported as both a perfect first pass and a corrected rejection.
    summary.firstPassAcceptedUnits += wasRejected ? 0 : 1;
    summary.firstPassRejectedUnits += wasRejected ? 1 : 0;
    summary.currentlyAcceptedUnits += latestAction.decisionCode === ACCEPTED ? 1 : 0;
    summary.pendingCorrectionUnits += latestAction.decisionCode === REJECTED && !latestAction.hasCorrectionSubmission ? 1 : 0;
    summary.readyForRecheckUnits += latestAction.decisionCode === REJECTED && latestAction.hasCorrectionSubmission ? 1 : 0;
    summary.rejectedUnits += wasRejected ? 1 : 0;
    summary.correctedUnits += wasRejected && latestAction.decisionCode === ACCEPTED ? 1 : 0;
  }

  summary.qualityGrade = roundPercentage(summary.firstPassAcceptedUnits, summary.reviewedUnits);
  summary.currentAcceptanceRate = roundPercentage(summary.currentlyAcceptedUnits, summary.reviewedUnits);
  summary.correctionResolutionRate = roundPercentage(summary.correctedUnits, summary.rejectedUnits);
  summary.gradingStatus = summary.reviewedUnits > 0 ? 'graded' : 'ungraded';

  return summary;
}

function calculateQcGradeSummariesByTechnician(reviewActions = [], technicianUserIds = []) {
  const normalizedRows = (Array.isArray(reviewActions) ? reviewActions : [])
    .map(normalizeReviewAction)
    .filter(Boolean);
  const requestedIds = [...new Set((Array.isArray(technicianUserIds) ? technicianUserIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean))];
  const discoveredIds = [...new Set(normalizedRows.map((row) => row.technicianUserId))];
  const resultIds = requestedIds.length > 0 ? requestedIds : discoveredIds;

  return resultIds.map((technicianUserId) => calculateQcGradeSummary(normalizedRows, {
    technicianUserId
  }));
}

function assertValidQcGradeSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    throw new Error('QC grade summary is required.');
  }

  const countFields = [
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

  for (const fieldName of countFields) {
    const value = Number(summary[fieldName]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`QC grade summary field ${fieldName} must be a non-negative integer.`);
    }
  }

  for (const fieldName of ['qualityGrade', 'currentAcceptanceRate', 'correctionResolutionRate']) {
    const value = summary[fieldName];
    if (value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      throw new Error(`QC grade summary field ${fieldName} must be null or a percentage from 0 through 100.`);
    }
  }

  if (summary.reviewedUnits !== summary.firstPassAcceptedUnits + summary.firstPassRejectedUnits) {
    throw new Error('QC first-pass counts do not reconcile to reviewed Units.');
  }

  if (summary.reviewedUnits !== summary.currentlyAcceptedUnits + summary.pendingCorrectionUnits + summary.readyForRecheckUnits) {
    throw new Error('QC current-status counts do not reconcile to reviewed Units.');
  }

  if (summary.rejectedUnits !== summary.firstPassRejectedUnits) {
    throw new Error('QC rejected Unit counts must match first-pass rejection counts.');
  }

  if (summary.correctedUnits > summary.firstPassRejectedUnits) {
    throw new Error('Corrected QC Units cannot exceed first-pass rejected QC Units.');
  }

  return true;
}

module.exports = {
  ACCEPTED,
  QC_GRADE_POLICY,
  REJECTED,
  assertValidQcGradeSummary,
  calculateQcGradeSummariesByTechnician,
  calculateQcGradeSummary,
  createEmptyQcGradeSummary,
  groupReviewActionsByCompletion,
  normalizeReviewAction,
  roundPercentage
};
