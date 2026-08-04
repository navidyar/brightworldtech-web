'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertDestinationValidation,
  buildDestinationValidationDecision
} = require('./unitLotDestinationValidation');

test('destination form requirements block a move with readable field names', () => {
  const decision = buildDestinationValidationDecision({
    lotId: 8,
    lotName: 'Ready Stock',
    submissionPolicy: {
      errors: ['BIOS Serial Number is required by the selected Lot.'],
      fieldErrors: [{ code: 'required', fieldKey: 'bios_serial_number', label: 'BIOS Serial Number' }]
    },
    workflow: { saveAllowed: true, technicalFailure: false, issueChecks: [] }
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.requiredFieldLabels, ['BIOS Serial Number']);
  assert.match(decision.errorMessages[0], /Ready Stock requires additional Unit information/);
  assert.throws(() => assertDestinationValidation(decision), {
    code: 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED'
  });
});

test('Strict operational requirements block a destination move', () => {
  const decision = buildDestinationValidationDecision({
    lotId: 9,
    lotName: 'Dell Ready Stock',
    submissionPolicy: { errors: [], fieldErrors: [] },
    workflow: {
      saveAllowed: false,
      technicalFailure: true,
      headline: 'Unit does not meet Lot requirements',
      issueChecks: [{
        requirementLabel: 'Manufacturer',
        requiredValue: 'Dell',
        actualValue: 'Microsoft'
      }]
    }
  });

  assert.equal(decision.allowed, false);
  assert.match(decision.errorMessages[0], /Manufacturer \(required Dell; current Microsoft\)/);
});

test('Warn Only and Mixed requirement mismatches remain allowed with warnings', () => {
  const decision = buildDestinationValidationDecision({
    lotId: 10,
    lotName: 'Mixed Intake',
    submissionPolicy: { errors: [], fieldErrors: [] },
    workflow: {
      saveAllowed: true,
      technicalFailure: true,
      issueChecks: [{
        requirementLabel: 'Memory Size',
        requiredValue: '16 GB',
        actualValue: '8 GB'
      }]
    }
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.warningMessages.length, 1);
  assert.doesNotThrow(() => assertDestinationValidation(decision));
});

test('current Management acceptance permits same-Lot reassignment', () => {
  const decision = buildDestinationValidationDecision({
    lotId: 11,
    lotName: 'Exception Lot',
    submissionPolicy: { errors: [], fieldErrors: [] },
    workflow: {
      saveAllowed: true,
      technicalFailure: true,
      managementAccepted: true,
      issueChecks: [{ requirementLabel: 'Processor', requiredValue: 'i7', actualValue: 'i5' }]
    }
  });

  assert.equal(decision.allowed, true);
});
