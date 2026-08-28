'use strict';

const QC_REVIEW_FILTER_OPTIONS = Object.freeze([
  { code: '', label: 'All Units', shortLabel: 'All' },
  { code: 'awaiting', label: 'Awaiting QC', shortLabel: 'Awaiting' },
  { code: 'accepted', label: 'Accepted First Pass', shortLabel: 'Accepted' },
  { code: 'corrected', label: 'Accepted After Correction', shortLabel: 'Corrected' },
  { code: 'ready_recheck', label: 'Ready for QC Recheck', shortLabel: 'Ready for Recheck' },
  { code: 'rejected', label: 'Rejected · Pending Correction', shortLabel: 'Pending Correction' }
]);

const VALID_QC_REVIEW_FILTER_CODES = new Set(
  QC_REVIEW_FILTER_OPTIONS.map((option) => option.code).filter(Boolean)
);

function normalizeQcReviewFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_QC_REVIEW_FILTER_CODES.has(normalized) ? normalized : '';
}

function mapQcReviewQueueCounts(row, { available = true } = {}) {
  const safeRow = row || {};

  return {
    available: Boolean(available),
    options: QC_REVIEW_FILTER_OPTIONS,
    allUnits: Number(safeRow.all_units || 0),
    awaitingUnits: Number(safeRow.awaiting_units || 0),
    acceptedUnits: Number(safeRow.accepted_units || 0),
    correctedUnits: Number(safeRow.corrected_units || 0),
    readyForRecheckUnits: Number(safeRow.ready_for_recheck_units || 0),
    rejectedUnits: Number(safeRow.rejected_units || 0)
  };
}

function resolveQcReviewState(row) {
  if (row && Number(row.qc_is_required) === 0) {
    return { code: 'not_required', label: 'QC not required for this Lot' };
  }

  if (!row || !row.qc_current_completion_id) {
    return { code: 'not_completed', label: 'Awaiting completion' };
  }

  const latestDecision = String(row.qc_latest_decision_code || '').trim().toLowerCase();
  const hasRejection = Number(row.qc_has_rejection || 0) === 1;
  const hasCorrectionSubmission = Number(row.qc_has_correction_submission || 0) === 1;

  if (!latestDecision) {
    return { code: 'awaiting', label: 'Awaiting QC' };
  }

  if (latestDecision === 'accepted' && hasRejection) {
    return { code: 'corrected', label: 'Accepted after correction' };
  }

  if (latestDecision === 'accepted') {
    return { code: 'accepted', label: 'Accepted first pass' };
  }

  if (hasCorrectionSubmission) {
    return { code: 'ready_recheck', label: 'Ready for QC recheck' };
  }

  return { code: 'rejected', label: 'Rejected · Pending correction' };
}

module.exports = {
  QC_REVIEW_FILTER_OPTIONS,
  mapQcReviewQueueCounts,
  normalizeQcReviewFilter,
  resolveQcReviewState
};
