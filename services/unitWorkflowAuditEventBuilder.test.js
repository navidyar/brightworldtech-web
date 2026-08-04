'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAssignmentChangedEvent,
  buildExceptionExpiredEvent,
  buildExistingUnitAssumedEvent,
  buildOutcomeApprovedEvent,
  buildOverrideApprovedEvent,
  buildParkedEvent,
  buildReturnedToActiveEvent
} = require('./unitWorkflowAuditEventBuilder');

test('parking produces one grouped lifecycle event with cleared Lot and assignment', () => {
  const event = buildParkedEvent({
    unitId: 10,
    actorUserId: 2,
    fromLotId: 7,
    fromLotName: 'Ready Stock',
    fromAssignedUserId: 4,
    fromAssignedName: 'Alex Tech'
  });
  assert.equal(event.eventType, 'unit_parked');
  assert.deepEqual(event.changes.map((change) => change.fieldKey), ['unit_lifecycle', 'assignable_lot', 'assigned_technician']);
  assert.equal(event.changes[1].oldValueText, 'Ready Stock');
  assert.equal(event.changes[2].newValueText, 'Unassigned');
});

test('returning to Active records destination Lot and optional technician', () => {
  const event = buildReturnedToActiveEvent({ unitId: 10, actorUserId: 2, toLotId: 8, toLotName: 'Repair', toAssignedUserId: 5, toAssignedName: 'Taylor Tech' });
  assert.equal(event.eventType, 'unit_returned_to_active');
  assert.equal(event.changes[1].newValueText, 'Repair');
  assert.equal(event.changes[2].newValueText, 'Taylor Tech');
});

test('assignment changes remain one compact audit event', () => {
  const event = buildAssignmentChangedEvent({ unitId: 10, actorUserId: 2, fromUserId: 4, fromUserName: 'Alex Tech', toUserId: 5, toUserName: 'Taylor Tech' });
  assert.equal(event.changes.length, 1);
  assert.equal(event.changes[0].oldValueText, 'Alex Tech');
  assert.equal(event.changes[0].newValueText, 'Taylor Tech');
});

test('duplicate assumption groups lifecycle, Lot, and assignment changes', () => {
  const event = buildExistingUnitAssumedEvent({ unitId: 10, actorUserId: 5, wasParked: true, fromLotId: null, toLotId: 8, toLotName: 'Repair', fromAssignedUserId: null });
  assert.equal(event.eventType, 'unit_assumed');
  assert.deepEqual(event.changes.map((change) => change.fieldKey), ['unit_lifecycle', 'assignable_lot', 'assigned_technician']);
});

test('outcome approval includes approval notes when supplied', () => {
  const event = buildOutcomeApprovedEvent({ unitId: 10, actorUserId: 2, outcomeLabel: 'Pass', approvalNotes: 'Verified' });
  assert.equal(event.eventType, 'unit_outcome_approved');
  assert.equal(event.changes.length, 2);
  assert.equal(event.changes[1].newValueText, 'Verified');
});

test('override approval combines assignment, Lot, and credit changes', () => {
  const event = buildOverrideApprovedEvent({
    unitId: 10,
    actorUserId: 2,
    requestId: 30,
    fromUserId: 4,
    fromUserName: 'Alex Tech',
    toUserId: 5,
    toUserName: 'Taylor Tech',
    fromLotId: 7,
    fromLotName: 'Ready Stock',
    toLotId: 8,
    toLotName: 'Repair',
    priorTechCreditWeight: 0.5
  });
  assert.deepEqual(event.changes.map((change) => change.fieldKey), ['assigned_technician', 'assignable_lot', 'prior_technician_credit']);
});

test('automatic exception expiration is recorded as a System event with its reason', () => {
  const event = buildExceptionExpiredEvent({ unitId: 10, lotId: 7, lotName: 'Ready Stock', overrideId: 12, originalReason: 'Approved exception', expirationReason: 'Lot requirements changed' });
  assert.equal(event.actorUserId, null);
  assert.equal(event.eventType, 'lot_requirement_exception_expired');
  assert.match(event.changes[0].newValueText, /Lot requirements changed/);
});
