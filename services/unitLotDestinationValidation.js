'use strict';

function normalizeMessages(messages) {
  return [...new Set((Array.isArray(messages) ? messages : [])
    .map((message) => String(message || '').trim())
    .filter(Boolean))];
}

function summarizeRequirementIssues(workflow) {
  return normalizeMessages((workflow && Array.isArray(workflow.issueChecks) ? workflow.issueChecks : [])
    .map((check) => {
      const label = String(check.requirementLabel || check.requirementKey || 'Requirement').trim();
      const required = String(check.requiredValue || '').trim();
      const actual = String(check.actualValue || '').trim();
      const values = [
        required ? `required ${required}` : '',
        actual ? `current ${actual}` : ''
      ].filter(Boolean).join('; ');

      return values ? `${label} (${values})` : label;
    }));
}

function buildDestinationValidationDecision({
  lotId,
  lotName = '',
  submissionPolicy = null,
  workflow = null
} = {}) {
  const formErrors = normalizeMessages(submissionPolicy && submissionPolicy.errors);
  const fieldErrors = Array.isArray(submissionPolicy && submissionPolicy.fieldErrors)
    ? submissionPolicy.fieldErrors
    : [];
  const requiredFieldLabels = normalizeMessages(fieldErrors
    .filter((error) => error && error.code === 'required')
    .map((error) => error.label || error.fieldKey));
  const requirementIssues = summarizeRequirementIssues(workflow);
  const requirementsBlocked = Boolean(workflow && workflow.saveAllowed === false);
  const requirementWarnings = workflow && workflow.technicalFailure && workflow.saveAllowed !== false
    ? requirementIssues
    : [];
  const allowed = formErrors.length === 0 && !requirementsBlocked;
  const safeLotName = String(lotName || workflow?.lotName || `Lot ${Number(lotId) || ''}`).trim();
  const errorMessages = [];
  const warningMessages = [];

  if (requiredFieldLabels.length > 0) {
    errorMessages.push(
      `${safeLotName} requires additional Unit information before this action: ${requiredFieldLabels.join(', ')}. Open the Unit, complete the required fields, and try again.`
    );
  } else if (formErrors.length > 0) {
    errorMessages.push(...formErrors);
  }

  if (requirementsBlocked) {
    const issueText = requirementIssues.length > 0
      ? ` Issues: ${requirementIssues.join('; ')}.`
      : '';
    errorMessages.push(
      `${workflow.headline || `The Unit does not meet ${safeLotName} requirements`}.${issueText} Correct the Unit or choose another destination Lot.`
    );
  } else if (requirementWarnings.length > 0) {
    warningMessages.push(
      `${safeLotName} allows this action with a requirement warning: ${requirementWarnings.join('; ')}.`
    );
  }

  return Object.freeze({
    allowed,
    lotId: Number(lotId) || null,
    lotName: safeLotName,
    formErrors: Object.freeze(formErrors),
    fieldErrors: Object.freeze([...fieldErrors]),
    requiredFieldLabels: Object.freeze(requiredFieldLabels),
    requirementsBlocked,
    requirementIssues: Object.freeze(requirementIssues),
    warningMessages: Object.freeze(warningMessages),
    errorMessages: Object.freeze(normalizeMessages(errorMessages)),
    submissionPolicy,
    workflow
  });
}

function createDestinationValidationError(decision, fallbackMessage = 'The Unit cannot enter the selected destination Lot.') {
  const message = decision && Array.isArray(decision.errorMessages) && decision.errorMessages.length > 0
    ? decision.errorMessages.join(' ')
    : fallbackMessage;
  const error = new Error(message);

  error.code = 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED';
  error.destinationValidation = decision || null;
  return error;
}

function assertDestinationValidation(decision) {
  if (!decision || decision.allowed !== true) {
    throw createDestinationValidationError(decision);
  }

  return decision;
}

module.exports = {
  assertDestinationValidation,
  buildDestinationValidationDecision,
  createDestinationValidationError,
  summarizeRequirementIssues
};
