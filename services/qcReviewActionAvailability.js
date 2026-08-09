'use strict';

function normalizeDecisionCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['accepted', 'rejected'].includes(normalized) ? normalized : '';
}

function getQcReviewActionAvailability({
  hasCompletion = false,
  isParked = false,
  latestDecisionCode = '',
  hasCorrection = false
} = {}) {
  const decisionCode = normalizeDecisionCode(latestDecisionCode);
  const visible = Boolean(hasCompletion) && !Boolean(isParked);
  const acceptedFinal = decisionCode === 'accepted';
  const rejectedAwaitingCorrection = decisionCode === 'rejected' && !Boolean(hasCorrection);
  const readyForRecheck = decisionCode === 'rejected' && Boolean(hasCorrection);
  const canRecordDecision = visible && (!decisionCode || readyForRecheck);

  let acceptDisabledReason = '';
  let rejectDisabledReason = '';

  if (acceptedFinal) {
    acceptDisabledReason = 'This completion cycle has already been accepted by Quality Control.';
    rejectDisabledReason = 'This accepted completion cycle is final. Reverse completion and record a new completion cycle before changing the QC decision.';
  } else if (rejectedAwaitingCorrection) {
    acceptDisabledReason = 'The assigned technician must mark this Unit corrected before Quality Control can accept it.';
    rejectDisabledReason = 'This Unit has already been rejected for the current review attempt.';
  } else if (!visible && Boolean(isParked)) {
    acceptDisabledReason = 'Return this Unit to Active before recording a Quality Control decision.';
    rejectDisabledReason = acceptDisabledReason;
  } else if (!visible) {
    acceptDisabledReason = 'Complete the current work cycle before Quality Control can review this Unit.';
    rejectDisabledReason = acceptDisabledReason;
  }

  return {
    visible,
    acceptEnabled: canRecordDecision,
    rejectEnabled: canRecordDecision,
    acceptDisabledReason,
    rejectDisabledReason,
    acceptedFinal,
    rejectedAwaitingCorrection,
    readyForRecheck
  };
}

module.exports = {
  getQcReviewActionAvailability
};
