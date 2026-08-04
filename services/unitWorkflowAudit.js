'use strict';

const unitAuditEventModel = require('../models/unitAuditEventModel');
const builders = require('./unitWorkflowAuditEventBuilder');

function normalizeIds(values) {
  return Array.from(new Set((values || []).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0)));
}

async function loadUserNames(connection, userIds) {
  const ids = normalizeIds(userIds);
  const names = new Map();
  if (ids.length === 0) return names;
  const [rows] = await connection.query(
    `SELECT user_id, first_name, last_name, email FROM users WHERE user_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  rows.forEach((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${Number(row.user_id)}`;
    names.set(Number(row.user_id), name);
  });
  return names;
}

async function loadLotNames(connection, lotIds) {
  const ids = normalizeIds(lotIds);
  const names = new Map();
  if (ids.length === 0) return names;
  const [rows] = await connection.query(
    `SELECT lot_id, name FROM lots WHERE lot_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  rows.forEach((row) => names.set(Number(row.lot_id), String(row.name || '').trim() || `Lot #${Number(row.lot_id)}`));
  return names;
}

async function recordParked(connection, values) {
  const [users, lots] = await Promise.all([
    loadUserNames(connection, [values.fromAssignedUserId]),
    loadLotNames(connection, [values.fromLotId])
  ]);
  return unitAuditEventModel.createUnitAuditEvent(builders.buildParkedEvent({
    ...values,
    fromAssignedName: users.get(Number(values.fromAssignedUserId)) || '',
    fromLotName: lots.get(Number(values.fromLotId)) || ''
  }), connection);
}

async function recordReturnedToActive(connection, values) {
  const [users, lots] = await Promise.all([
    loadUserNames(connection, [values.toAssignedUserId]),
    loadLotNames(connection, [values.toLotId])
  ]);
  return unitAuditEventModel.createUnitAuditEvent(builders.buildReturnedToActiveEvent({
    ...values,
    toAssignedName: users.get(Number(values.toAssignedUserId)) || '',
    toLotName: lots.get(Number(values.toLotId)) || ''
  }), connection);
}

async function recordAssignmentChanged(connection, values) {
  const users = await loadUserNames(connection, [values.fromUserId, values.toUserId]);
  return unitAuditEventModel.createUnitAuditEvent(builders.buildAssignmentChangedEvent({
    ...values,
    fromUserName: users.get(Number(values.fromUserId)) || '',
    toUserName: users.get(Number(values.toUserId)) || ''
  }), connection);
}

async function recordExistingUnitAssumed(connection, values) {
  const [users, lots] = await Promise.all([
    loadUserNames(connection, [values.fromAssignedUserId]),
    loadLotNames(connection, [values.fromLotId, values.toLotId])
  ]);
  const event = builders.buildExistingUnitAssumedEvent({
    ...values,
    fromAssignedName: users.get(Number(values.fromAssignedUserId)) || '',
    fromLotName: lots.get(Number(values.fromLotId)) || '',
    toLotName: lots.get(Number(values.toLotId)) || ''
  });
  const actorName = (await loadUserNames(connection, [values.actorUserId])).get(Number(values.actorUserId));
  const assignment = event.changes.find((change) => change.fieldKey === 'assigned_technician');
  if (assignment && actorName) assignment.newValueText = actorName;
  return unitAuditEventModel.createUnitAuditEvent(event, connection);
}

async function recordOutcomeApproved(connection, values) {
  return unitAuditEventModel.createUnitAuditEvent(builders.buildOutcomeApprovedEvent(values), connection);
}

async function recordOverrideApproved(connection, values) {
  const [users, lots] = await Promise.all([
    loadUserNames(connection, [values.fromUserId, values.toUserId]),
    loadLotNames(connection, [values.fromLotId, values.toLotId])
  ]);
  return unitAuditEventModel.createUnitAuditEvent(builders.buildOverrideApprovedEvent({
    ...values,
    fromUserName: users.get(Number(values.fromUserId)) || '',
    toUserName: users.get(Number(values.toUserId)) || '',
    fromLotName: lots.get(Number(values.fromLotId)) || '',
    toLotName: lots.get(Number(values.toLotId)) || ''
  }), connection);
}

async function recordExpiredExceptions(connection, rows, expirationReason) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) return 0;
  const lots = await loadLotNames(connection, safeRows.map((row) => row.lot_id));
  for (const row of safeRows) {
    await unitAuditEventModel.createUnitAuditEvent(builders.buildExceptionExpiredEvent({
      unitId: row.unit_id,
      lotId: row.lot_id,
      lotName: lots.get(Number(row.lot_id)) || '',
      overrideId: row.unit_lot_validation_override_id,
      originalReason: row.reason,
      expirationReason
    }), connection);
  }
  return safeRows.length;
}

module.exports = {
  recordAssignmentChanged,
  recordExistingUnitAssumed,
  recordExpiredExceptions,
  recordOutcomeApproved,
  recordOverrideApproved,
  recordParked,
  recordReturnedToActive
};
