'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyManagementAcceptance,
  buildLotAssignmentSignature,
  buildRequirementSignature,
  isOverrideCurrent
} = require('./lotValidationOverridePolicy');

test('requirement signatures are stable across row ordering', () => {
  const left = [
    { lot_requirement_id: 2, requirement_type_config_value_id: 5, requirement_number: 16, is_required: 1 },
    { lot_requirement_id: 1, requirement_type_config_value_id: 4, unit_model_id: 8, is_required: 1 }
  ];
  const right = [...left].reverse();

  assert.equal(buildRequirementSignature(left), buildRequirementSignature(right));
});

test('requirement signatures change when configuration changes', () => {
  const original = [{ lot_requirement_id: 1, requirement_type_config_value_id: 5, requirement_number: 16, is_required: 1 }];
  const changed = [{ lot_requirement_id: 1, requirement_type_config_value_id: 5, requirement_number: 32, is_required: 1 }];

  assert.notEqual(buildRequirementSignature(original), buildRequirementSignature(changed));
});

test('Lot assignment signatures change after a Lot history event', () => {
  const original = buildLotAssignmentSignature({ unitId: 7, lotId: 3, unitCreatedAt: '2026-07-01T12:00:00.000Z' });
  const movedBack = buildLotAssignmentSignature({
    unitId: 7,
    lotId: 3,
    latestLotHistoryId: 44,
    latestLotMovedAt: '2026-07-04T12:00:00.000Z',
    unitCreatedAt: '2026-07-01T12:00:00.000Z'
  });

  assert.notEqual(original, movedBack);
});

test('approved override is current only when both signatures match', () => {
  const override = {
    statusCode: 'approved',
    requirementSignature: 'requirements',
    lotAssignmentSignature: 'assignment'
  };

  assert.equal(isOverrideCurrent(override, {
    requirementSignature: 'requirements',
    lotAssignmentSignature: 'assignment'
  }), true);
  assert.equal(isOverrideCurrent(override, {
    requirementSignature: 'changed',
    lotAssignmentSignature: 'assignment'
  }), false);
});

test('management acceptance changes only rejected or review results', () => {
  const override = { overrideId: 9 };
  const rejected = applyManagementAcceptance({ status: 'rejected', statusLabel: 'Rejected' }, override);
  const accepted = applyManagementAcceptance({ status: 'accepted', statusLabel: 'Accepted' }, override);

  assert.equal(rejected.status, 'accepted_override');
  assert.equal(rejected.technicalStatus, 'rejected');
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.validationOverride, override);
});
