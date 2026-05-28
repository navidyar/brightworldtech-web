function getUnitEnforcementDecision(unit) {
  if (!unit || !unit.status) {
    return {
      decision: 'review',
      decisionLabel: 'Needs Review',
      message: 'Validation status is missing.',
      canProceed: false,
      requiresOverride: true
    };
  }

  if (unit.status === 'accepted') {
    return {
      decision: 'allowed',
      decisionLabel: 'Allowed',
      message: 'Unit matches all active lot requirements.',
      canProceed: true,
      requiresOverride: false
    };
  }

  if (unit.status === 'open') {
    return {
      decision: 'allowed_open',
      decisionLabel: 'Allowed - Open Lot',
      message: 'Lot has no active requirements, so this unit is allowed by policy.',
      canProceed: true,
      requiresOverride: false
    };
  }

  if (unit.status === 'needs_review') {
    return {
      decision: 'review',
      decisionLabel: 'Needs Review',
      message: 'Unit has one or more requirements that cannot be checked automatically.',
      canProceed: false,
      requiresOverride: true
    };
  }

  if (unit.status === 'rejected') {
    return {
      decision: 'blocked',
      decisionLabel: 'Blocked',
      message: 'Unit does not meet one or more active lot requirements.',
      canProceed: false,
      requiresOverride: true
    };
  }

  return {
    decision: 'review',
    decisionLabel: 'Needs Review',
    message: 'Unknown validation status.',
    canProceed: false,
    requiresOverride: true
  };
}

function getOverallPolicyStatus(validationReport) {
  if (!validationReport || !validationReport.supported) {
    return {
      status: 'unavailable',
      label: 'Unavailable',
      message: validationReport && validationReport.message
        ? validationReport.message
        : 'Validation is not available for this lot yet.'
    };
  }

  if (validationReport.requirementCount === 0) {
    return {
      status: 'open',
      label: 'Open Lot',
      message: 'This lot has no active requirements. Units would be allowed without requirement enforcement.'
    };
  }

  if (validationReport.rejectedCount > 0) {
    return {
      status: 'blocking',
      label: 'Blocking',
      message: 'Some units would be blocked unless Management approves an override.'
    };
  }

  if (validationReport.needsReviewCount > 0) {
    return {
      status: 'review',
      label: 'Needs Review',
      message: 'Some units cannot be fully checked automatically and would require review before approval.'
    };
  }

  return {
    status: 'passing',
    label: 'Passing',
    message: 'All checked units currently meet the active lot requirements.'
  };
}

function buildLotEnforcementSummary(validationReport) {
  const safeValidationReport = validationReport || {
    supported: false,
    requirementCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    needsReviewCount: 0,
    openCount: 0,
    unitsChecked: 0,
    units: [],
    message: 'Validation report was not available.'
  };

  const unitDecisions = Array.isArray(safeValidationReport.units)
    ? safeValidationReport.units.map((unit) => ({
        unitId: unit.unitId,
        label: unit.label,
        subLabel: unit.subLabel,
        validationStatus: unit.status,
        validationStatusLabel: unit.statusLabel,
        failedCheckCount: Array.isArray(unit.failedChecks) ? unit.failedChecks.length : 0,
        reviewCheckCount: Array.isArray(unit.reviewChecks) ? unit.reviewChecks.length : 0,
        ...getUnitEnforcementDecision(unit)
      }))
    : [];

  const allowedCount = unitDecisions.filter((unit) => unit.canProceed).length;
  const blockedCount = unitDecisions.filter((unit) => unit.decision === 'blocked').length;
  const reviewCount = unitDecisions.filter((unit) => unit.decision === 'review').length;
  const overrideRequiredCount = unitDecisions.filter((unit) => unit.requiresOverride).length;

  const policyStatus = getOverallPolicyStatus(safeValidationReport);

  return {
    supported: Boolean(safeValidationReport.supported),
    policyStatus: policyStatus.status,
    policyLabel: policyStatus.label,
    policyMessage: policyStatus.message,
    requirementCount: safeValidationReport.requirementCount || 0,
    unitsChecked: safeValidationReport.unitsChecked || 0,
    allowedCount,
    blockedCount,
    reviewCount,
    overrideRequiredCount,
    unitDecisions,
    enforcementModeLabel: 'Preview Only',
    enforcementModeMessage:
      'This is the enforcement decision layer. In a later Tech workflow step, these same decisions can warn, block, or require Management override before saving.'
  };
}

module.exports = {
  buildLotEnforcementSummary,
  getUnitEnforcementDecision
};