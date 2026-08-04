'use strict';

function normalizeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function displayName(value, fallback) {
  return normalizeText(value) || fallback;
}

function changedField({ key, label, oldText, newText, oldValue = null, newValue = null, sortOrder = 10, changeType = 'changed' }) {
  return {
    fieldKey: key,
    fieldLabel: label,
    changeType,
    oldValueText: normalizeText(oldText),
    newValueText: normalizeText(newText),
    oldValue,
    newValue,
    sortOrder
  };
}

function buildParkedEvent({ unitId, actorUserId, fromLotId, fromLotName, fromAssignedUserId, fromAssignedName }) {
  const changes = [
    changedField({
      key: 'unit_lifecycle',
      label: 'Unit Status',
      oldText: 'Active',
      newText: 'Parked',
      oldValue: 'active',
      newValue: 'parked',
      sortOrder: 10
    })
  ];

  if (normalizeInteger(fromLotId)) {
    changes.push(changedField({
      key: 'assignable_lot',
      label: 'Lot',
      oldText: displayName(fromLotName, `Lot #${Number(fromLotId)}`),
      newText: 'No active lot',
      oldValue: normalizeInteger(fromLotId),
      newValue: null,
      sortOrder: 20
    }));
  }

  if (normalizeInteger(fromAssignedUserId)) {
    changes.push(changedField({
      key: 'assigned_technician',
      label: 'Assigned Technician',
      oldText: displayName(fromAssignedName, `User #${Number(fromAssignedUserId)}`),
      newText: 'Unassigned',
      oldValue: normalizeInteger(fromAssignedUserId),
      newValue: null,
      sortOrder: 30
    }));
  }

  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'unit_parked',
    eventSource: 'unit_lifecycle',
    eventSummary: 'Parked Unit',
    metadata: {
      fromLotId: normalizeInteger(fromLotId),
      fromAssignedUserId: normalizeInteger(fromAssignedUserId)
    },
    changes
  };
}

function buildReturnedToActiveEvent({ unitId, actorUserId, toLotId, toLotName, toAssignedUserId, toAssignedName }) {
  const changes = [
    changedField({
      key: 'unit_lifecycle',
      label: 'Unit Status',
      oldText: 'Parked',
      newText: 'Active',
      oldValue: 'parked',
      newValue: 'active',
      sortOrder: 10
    }),
    changedField({
      key: 'assignable_lot',
      label: 'Lot',
      oldText: 'No active lot',
      newText: displayName(toLotName, `Lot #${Number(toLotId)}`),
      oldValue: null,
      newValue: normalizeInteger(toLotId),
      sortOrder: 20
    })
  ];

  if (normalizeInteger(toAssignedUserId)) {
    changes.push(changedField({
      key: 'assigned_technician',
      label: 'Assigned Technician',
      oldText: 'Unassigned',
      newText: displayName(toAssignedName, `User #${Number(toAssignedUserId)}`),
      oldValue: null,
      newValue: normalizeInteger(toAssignedUserId),
      sortOrder: 30
    }));
  }

  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'unit_returned_to_active',
    eventSource: 'unit_lifecycle',
    eventSummary: 'Returned Unit to Active',
    metadata: {
      toLotId: normalizeInteger(toLotId),
      toAssignedUserId: normalizeInteger(toAssignedUserId)
    },
    changes
  };
}

function buildAssignmentChangedEvent({ unitId, actorUserId, fromUserId, fromUserName, toUserId, toUserName, source = 'manual', notes = '' }) {
  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'unit_assignment_changed',
    eventSource: normalizeText(source) || 'manual_assignment',
    eventSummary: 'Changed Unit assignment',
    metadata: {
      fromUserId: normalizeInteger(fromUserId),
      toUserId: normalizeInteger(toUserId),
      notes: normalizeText(notes) || null
    },
    changes: [changedField({
      key: 'assigned_technician',
      label: 'Assigned Technician',
      oldText: normalizeInteger(fromUserId) ? displayName(fromUserName, `User #${Number(fromUserId)}`) : 'Unassigned',
      newText: normalizeInteger(toUserId) ? displayName(toUserName, `User #${Number(toUserId)}`) : 'Unassigned',
      oldValue: normalizeInteger(fromUserId),
      newValue: normalizeInteger(toUserId),
      sortOrder: 10
    })]
  };
}

function buildExistingUnitAssumedEvent({
  unitId,
  actorUserId,
  wasParked,
  fromLotId,
  fromLotName,
  toLotId,
  toLotName,
  fromAssignedUserId,
  fromAssignedName,
  notes = ''
}) {
  const changes = [];

  if (wasParked) {
    changes.push(changedField({
      key: 'unit_lifecycle',
      label: 'Unit Status',
      oldText: 'Parked',
      newText: 'Active',
      oldValue: 'parked',
      newValue: 'active',
      sortOrder: 10
    }));
  }

  changes.push(changedField({
    key: 'assignable_lot',
    label: 'Lot',
    oldText: normalizeInteger(fromLotId) ? displayName(fromLotName, `Lot #${Number(fromLotId)}`) : 'No active lot',
    newText: displayName(toLotName, `Lot #${Number(toLotId)}`),
    oldValue: normalizeInteger(fromLotId),
    newValue: normalizeInteger(toLotId),
    sortOrder: 20
  }));

  changes.push(changedField({
    key: 'assigned_technician',
    label: 'Assigned Technician',
    oldText: normalizeInteger(fromAssignedUserId) ? displayName(fromAssignedName, `User #${Number(fromAssignedUserId)}`) : 'Unassigned',
    newText: `User #${Number(actorUserId)}`,
    oldValue: normalizeInteger(fromAssignedUserId),
    newValue: normalizeInteger(actorUserId),
    sortOrder: 30
  }));

  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'unit_assumed',
    eventSource: 'duplicate_serial_assumption',
    eventSummary: 'Assumed existing Unit',
    metadata: {
      wasParked: Boolean(wasParked),
      notes: normalizeText(notes) || null
    },
    changes
  };
}

function buildOutcomeApprovedEvent({ unitId, actorUserId, outcomeLabel, approvalNotes = '', source = 'unit_outcome_approval' }) {
  const changes = [changedField({
    key: 'unit_outcome_approval',
    label: 'Outcome Approval',
    oldText: 'Pending',
    newText: `Approved${normalizeText(outcomeLabel) ? ` — ${normalizeText(outcomeLabel)}` : ''}`,
    oldValue: 'pending',
    newValue: 'approved',
    sortOrder: 10
  })];

  if (normalizeText(approvalNotes)) {
    changes.push(changedField({
      key: 'unit_outcome_approval_notes',
      label: 'Approval Notes',
      oldText: '',
      newText: normalizeText(approvalNotes),
      oldValue: null,
      newValue: normalizeText(approvalNotes),
      changeType: 'recorded',
      sortOrder: 20
    }));
  }

  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'unit_outcome_approved',
    eventSource: normalizeText(source) || 'unit_outcome_approval',
    eventSummary: 'Approved Unit outcome',
    metadata: { outcomeLabel: normalizeText(outcomeLabel) || null },
    changes
  };
}

function buildOverrideApprovedEvent({
  unitId,
  actorUserId,
  requestId,
  fromUserId,
  fromUserName,
  toUserId,
  toUserName,
  fromLotId,
  fromLotName,
  toLotId,
  toLotName,
  priorTechCreditWeight = null,
  reviewNotes = ''
}) {
  const changes = [];
  if (normalizeInteger(fromUserId) !== normalizeInteger(toUserId)) {
    changes.push(changedField({
      key: 'assigned_technician',
      label: 'Assigned Technician',
      oldText: normalizeInteger(fromUserId) ? displayName(fromUserName, `User #${Number(fromUserId)}`) : 'Unassigned',
      newText: normalizeInteger(toUserId) ? displayName(toUserName, `User #${Number(toUserId)}`) : 'Unassigned',
      oldValue: normalizeInteger(fromUserId),
      newValue: normalizeInteger(toUserId),
      sortOrder: 10
    }));
  }
  if (normalizeInteger(fromLotId) !== normalizeInteger(toLotId)) {
    changes.push(changedField({
      key: 'assignable_lot',
      label: 'Lot',
      oldText: normalizeInteger(fromLotId) ? displayName(fromLotName, `Lot #${Number(fromLotId)}`) : 'No active lot',
      newText: normalizeInteger(toLotId) ? displayName(toLotName, `Lot #${Number(toLotId)}`) : 'No active lot',
      oldValue: normalizeInteger(fromLotId),
      newValue: normalizeInteger(toLotId),
      sortOrder: 20
    }));
  }
  if (Number(priorTechCreditWeight) > 0) {
    changes.push(changedField({
      key: 'prior_technician_credit',
      label: 'Prior Technician Credit',
      oldText: '',
      newText: Number(priorTechCreditWeight).toFixed(2),
      oldValue: null,
      newValue: Number(priorTechCreditWeight),
      changeType: 'added',
      sortOrder: 30
    }));
  }

  return {
    unitId: normalizeInteger(unitId),
    actorUserId: normalizeInteger(actorUserId),
    eventType: 'override_request_approved',
    eventSource: 'override_approval',
    eventSummary: 'Approved Unit override request',
    metadata: {
      requestId: normalizeInteger(requestId),
      reviewNotes: normalizeText(reviewNotes) || null
    },
    changes
  };
}

function buildExceptionExpiredEvent({ unitId, lotId, lotName, overrideId, originalReason = '', expirationReason }) {
  const lotLabel = displayName(lotName, `Lot #${Number(lotId)}`);
  const reason = displayName(expirationReason, 'The Unit or Lot requirements changed');
  return {
    unitId: normalizeInteger(unitId),
    actorUserId: null,
    eventType: 'lot_requirement_exception_expired',
    eventSource: 'lot_validation_override',
    eventSummary: `Lot requirement exception expired for ${lotLabel}`,
    metadata: {
      lotId: normalizeInteger(lotId),
      lotName: lotLabel,
      overrideId: normalizeInteger(overrideId),
      expirationReason: reason
    },
    changes: [changedField({
      key: 'lot_requirement_acceptance',
      label: 'Lot Requirement Acceptance',
      oldText: normalizeText(originalReason) ? `${lotLabel}: ${normalizeText(originalReason)}` : lotLabel,
      newText: `Expired — ${reason}`,
      oldValue: { lotId: normalizeInteger(lotId), reason: normalizeText(originalReason) || null },
      newValue: null,
      changeType: 'changed',
      sortOrder: 10
    })]
  };
}

module.exports = {
  buildAssignmentChangedEvent,
  buildExceptionExpiredEvent,
  buildExistingUnitAssumedEvent,
  buildOutcomeApprovedEvent,
  buildOverrideApprovedEvent,
  buildParkedEvent,
  buildReturnedToActiveEvent
};
