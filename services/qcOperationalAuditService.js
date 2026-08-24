'use strict';

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['accepted', 'rejected'].includes(normalized) ? normalized : '';
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toTimestamp(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function resolveCorrectionWorkflowBoundary(tableCreatedAt, firstCorrectionSubmittedAt) {
  const tableCreatedMs = toTimestamp(tableCreatedAt);
  const firstCorrectionMs = toTimestamp(firstCorrectionSubmittedAt);
  const boundaryReliable = tableCreatedMs !== null
    && (firstCorrectionMs === null || tableCreatedMs <= firstCorrectionMs);

  return {
    correctionTableCreatedAt: tableCreatedAt || null,
    firstCorrectionSubmittedAt: firstCorrectionSubmittedAt || null,
    correctionWorkflowStartedAt: boundaryReliable ? tableCreatedAt : null,
    boundaryReliable
  };
}

function inspectQcReviewSequences(rows = [], { correctionWorkflowStartedAt = null } = {}) {
  const cycles = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const completionId = normalizePositiveInteger(row.unit_work_completion_id ?? row.unitWorkCompletionId);
    const qcCheckId = normalizePositiveInteger(row.unit_qc_check_id ?? row.unitQcCheckId);
    const decisionCode = normalizeDecision(row.decision_code ?? row.decisionCode);
    if (!completionId || !qcCheckId || !decisionCode) return;

    if (!cycles.has(completionId)) cycles.set(completionId, []);
    cycles.get(completionId).push({
      completionId,
      qcCheckId,
      decisionCode,
      reviewedAt: row.reviewed_at ?? row.reviewedAt ?? null,
      correctionId: normalizePositiveInteger(row.unit_qc_correction_id ?? row.unitQcCorrectionId),
      correctionSubmittedAt: row.correction_submitted_at ?? row.correctionSubmittedAt ?? null,
      revertedAt: row.reverted_at ?? row.revertedAt ?? null,
      isReverted: Boolean(row.reverted_at ?? row.revertedAt)
    });
  });

  const workflowStartedAt = toTimestamp(correctionWorkflowStartedAt);

  const result = {
    completionCycles: cycles.size,
    acceptedThenReviewedCycles: 0,
    legacyRechecksWithoutCorrection: 0,
    rechecksWithoutCorrection: 0,
    correctionAfterRecheck: 0,
    timestampRegressions: 0,
    affectedCompletionIds: {
      acceptedThenReviewed: [],
      legacyRecheckWithoutCorrection: [],
      recheckWithoutCorrection: [],
      correctionAfterRecheck: [],
      timestampRegression: []
    }
  };

  cycles.forEach((actions, completionId) => {
    actions.sort((left, right) => left.qcCheckId - right.qcCheckId);
    let acceptedThenReviewed = false;
    let legacyRecheckWithoutCorrection = false;
    let recheckWithoutCorrection = false;
    let correctionAfterRecheck = false;
    let timestampRegression = false;

    actions.forEach((action, index) => {
      if (index < actions.length - 1 && action.decisionCode === 'accepted' && !action.isReverted) {
        acceptedThenReviewed = true;
      }

      if (index === 0) return;
      const previous = actions[index - 1];
      const previousReviewedAt = toTimestamp(previous.reviewedAt);
      const reviewedAt = toTimestamp(action.reviewedAt);
      const correctionAt = toTimestamp(previous.correctionSubmittedAt);

      if (previousReviewedAt !== null && reviewedAt !== null && reviewedAt < previousReviewedAt) {
        timestampRegression = true;
      }

      if (previous.decisionCode === 'rejected' && !previous.isReverted) {
        if (!previous.correctionId) {
          const isLegacyPreCorrectionWorkflow = workflowStartedAt !== null
            && previousReviewedAt !== null
            && reviewedAt !== null
            && previousReviewedAt < workflowStartedAt
            && reviewedAt < workflowStartedAt;
          if (isLegacyPreCorrectionWorkflow) legacyRecheckWithoutCorrection = true;
          else recheckWithoutCorrection = true;
        } else if (correctionAt !== null && reviewedAt !== null && correctionAt > reviewedAt) {
          correctionAfterRecheck = true;
        }
      }
    });

    if (acceptedThenReviewed) {
      result.acceptedThenReviewedCycles += 1;
      result.affectedCompletionIds.acceptedThenReviewed.push(completionId);
    }
    if (legacyRecheckWithoutCorrection) {
      result.legacyRechecksWithoutCorrection += 1;
      result.affectedCompletionIds.legacyRecheckWithoutCorrection.push(completionId);
    }
    if (recheckWithoutCorrection) {
      result.rechecksWithoutCorrection += 1;
      result.affectedCompletionIds.recheckWithoutCorrection.push(completionId);
    }
    if (correctionAfterRecheck) {
      result.correctionAfterRecheck += 1;
      result.affectedCompletionIds.correctionAfterRecheck.push(completionId);
    }
    if (timestampRegression) {
      result.timestampRegressions += 1;
      result.affectedCompletionIds.timestampRegression.push(completionId);
    }
  });

  return result;
}

function buildQcOperationalAudit({
  role = {},
  storage = {},
  integrity = {},
  history = {},
  sequences = {},
  reporting = {}
} = {}) {
  const blockers = [];
  const warnings = [];
  const roleCode = String(role.code || '').trim().toLowerCase();
  const roleName = String(role.name || '').trim();
  const roleActive = Number(role.is_active ?? role.isActive ?? 0) === 1;

  if (roleCode !== 'qc' || roleName !== 'Quality Control' || !roleActive) {
    blockers.push('The active qc role must be named Quality Control.');
  }

  if (!storage.reviewSchemaReady) blockers.push('Stage 9B QC review storage is incomplete.');
  if (!storage.correctionSchemaReady) blockers.push('Stage 9G QC correction storage is incomplete.');

  const integrityChecks = [
    ['reviewUnitMismatches', 'QC review rows do not match their completion Unit.'],
    ['nonManualCompletionReviews', 'QC reviews reference non-manual completion records.'],
    ['correctionDecisionMismatches', 'QC corrections reference a decision that is not a rejection.'],
    ['correctionUnitMismatches', 'QC corrections do not match the rejected review Unit or completion cycle.'],
    ['correctionBeforeRejection', 'QC corrections were submitted before their rejection.']
  ];

  integrityChecks.forEach(([fieldName, message]) => {
    if (normalizeCount(integrity[fieldName]) > 0) blockers.push(message);
  });

  if (normalizeCount(sequences.rechecksWithoutCorrection) > 0) {
    blockers.push('One or more QC rechecks were recorded without a preceding correction handoff after the correction workflow became available.');
  }
  if (normalizeCount(sequences.correctionAfterRecheck) > 0) {
    blockers.push('One or more QC correction handoffs were recorded after the related recheck.');
  }

  if (normalizeCount(history.missingReviewAuditEvents) > 0) {
    blockers.push('One or more QC review decisions are missing from Unit History.');
  }
  if (normalizeCount(history.missingCorrectionAuditEvents) > 0) {
    blockers.push('One or more QC correction handoffs are missing from Unit History.');
  }
  if (normalizeCount(history.missingReversionAuditEvents) > 0) {
    blockers.push('One or more reverted QC decisions are missing their QC reversion event in Unit History.');
  }

  if (normalizeCount(sequences.legacyRechecksWithoutCorrection) > 0) {
    warnings.push('Historical QC rechecks occurred before Stage 9G correction storage existed. They remain preserved as legacy audit history and are not treated as current workflow failures.');
  }
  if (normalizeCount(sequences.acceptedThenReviewedCycles) > 0) {
    warnings.push('Historical completion cycles contain a QC review after acceptance. Stage 9J prevents new occurrences and grades these cycles conservatively.');
  }
  if (normalizeCount(sequences.timestampRegressions) > 0) {
    warnings.push('One or more QC review timestamps do not follow their stored review ID order.');
  }

  if (reporting.reconciled !== true) {
    blockers.push('QC grading and Management QC Reporting did not reconcile.');
  }

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    metrics: {
      reviews: normalizeCount(integrity.reviewRows),
      revertedReviews: normalizeCount(integrity.revertedReviewRows),
      corrections: normalizeCount(integrity.correctionRows),
      completionCycles: normalizeCount(sequences.completionCycles),
      reviewedTechnicians: normalizeCount(reporting.reviewedTechnicians),
      reviewActions: normalizeCount(reporting.reviewActions),
      reversedCompletionReviews: normalizeCount(integrity.reversedCompletionReviews),
      acceptedThenReviewedCycles: normalizeCount(sequences.acceptedThenReviewedCycles),
      legacyRechecksWithoutCorrection: normalizeCount(sequences.legacyRechecksWithoutCorrection)
    }
  };
}

module.exports = {
  buildQcOperationalAudit,
  inspectQcReviewSequences,
  normalizeCount,
  resolveCorrectionWorkflowBoundary
};
