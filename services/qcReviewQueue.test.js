'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QC_REVIEW_FILTER_OPTIONS,
  mapQcReviewQueueCounts,
  normalizeQcReviewFilter,
  resolveQcReviewState
} = require('./qcReviewQueue');

test('QC review filters normalize only published queue states', () => {
  assert.deepEqual(
    QC_REVIEW_FILTER_OPTIONS.map((option) => option.code),
    ['', 'awaiting', 'accepted', 'corrected', 'ready_recheck', 'rejected']
  );
  assert.equal(normalizeQcReviewFilter(' Corrected '), 'corrected');
  assert.equal(normalizeQcReviewFilter(' Ready_Recheck '), 'ready_recheck');
  assert.equal(normalizeQcReviewFilter('pending'), '');
  assert.equal(normalizeQcReviewFilter(''), '');
});

test('QC review state distinguishes non-required Lots and review workflow states', () => {
  assert.deepEqual(resolveQcReviewState({ qc_is_required: 0 }), {
    code: 'not_required',
    label: 'QC not required for this Lot'
  });
  assert.deepEqual(resolveQcReviewState({}), {
    code: 'not_completed',
    label: 'Awaiting completion'
  });
  assert.deepEqual(resolveQcReviewState({ qc_current_completion_id: 10 }), {
    code: 'awaiting',
    label: 'Awaiting QC'
  });
  assert.deepEqual(resolveQcReviewState({
    qc_current_completion_id: 10,
    qc_latest_decision_code: 'accepted',
    qc_has_rejection: 0
  }), {
    code: 'accepted',
    label: 'Accepted first pass'
  });
  assert.deepEqual(resolveQcReviewState({
    qc_current_completion_id: 10,
    qc_latest_decision_code: 'accepted',
    qc_has_rejection: 1
  }), {
    code: 'corrected',
    label: 'Accepted after correction'
  });
  assert.deepEqual(resolveQcReviewState({
    qc_current_completion_id: 10,
    qc_latest_decision_code: 'rejected',
    qc_has_rejection: 1,
    qc_has_correction_submission: 1
  }), {
    code: 'ready_recheck',
    label: 'Ready for QC recheck'
  });
  assert.deepEqual(resolveQcReviewState({
    qc_current_completion_id: 10,
    qc_latest_decision_code: 'rejected',
    qc_has_rejection: 1,
    qc_has_correction_submission: 0
  }), {
    code: 'rejected',
    label: 'Rejected · Pending correction'
  });
});

test('QC queue count mapping normalizes database values', () => {
  assert.deepEqual(mapQcReviewQueueCounts({
    all_units: '12',
    awaiting_units: '3',
    accepted_units: 5,
    corrected_units: '2',
    ready_for_recheck_units: '1',
    rejected_units: 1
  }), {
    available: true,
    options: QC_REVIEW_FILTER_OPTIONS,
    allUnits: 12,
    awaitingUnits: 3,
    acceptedUnits: 5,
    correctedUnits: 2,
    readyForRecheckUnits: 1,
    rejectedUnits: 1
  });

  assert.equal(mapQcReviewQueueCounts({}, { available: false }).available, false);
});
