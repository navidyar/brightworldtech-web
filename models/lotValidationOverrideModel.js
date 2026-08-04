'use strict';

const { pool } = require('./db');
const unitAuditEventModel = require('./unitAuditEventModel');
const unitWorkflowAudit = require('../services/unitWorkflowAudit');
const {
  buildLotAssignmentSignature,
  buildRequirementSignature
} = require('../services/lotValidationOverridePolicy');

function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

async function getLotName(lotId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT name FROM lots WHERE lot_id = ? LIMIT 1',
    [Number(lotId)]
  );

  return String(rows[0]?.name || '').trim() || `Lot #${Number(lotId)}`;
}

async function getOverrideStatusId(code, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT cv.config_value_id
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = 'override_statuses'
        AND cv.code = ?
      LIMIT 1
    `,
    [String(code || '').trim()]
  );

  const statusId = Number(rows[0]?.config_value_id || 0);

  if (!Number.isSafeInteger(statusId) || statusId <= 0) {
    throw new Error(`Override status ${code} is not configured.`);
  }

  return statusId;
}

async function listRawRequirementsForSignature(lotId, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        lot_requirement_id,
        requirement_type_config_value_id,
        comparison_operator_config_value_id,
        requirement_config_value_id,
        manufacturer_id,
        unit_model_id,
        processor_model_id,
        requirement_text,
        requirement_number,
        is_required,
        1 AS is_active
      FROM lot_requirements
      WHERE lot_id = ?
      ORDER BY lot_requirement_id
    `,
    [Number(lotId)]
  );

  return rows;
}

async function getUnitAssignmentState(unitId, connection = pool, { lock = false } = {}) {
  const [rows] = await connection.query(
    `
      SELECT
        u.unit_id,
        u.lot_id,
        u.created_at,
        latest_history.unit_lot_history_id AS latest_lot_history_id,
        latest_history.moved_at AS latest_lot_moved_at
      FROM units u
      LEFT JOIN unit_lot_history latest_history
        ON latest_history.unit_lot_history_id = (
          SELECT MAX(history_lookup.unit_lot_history_id)
          FROM unit_lot_history history_lookup
          WHERE history_lookup.unit_id = u.unit_id
        )
      WHERE u.unit_id = ?
      LIMIT 1
      ${lock ? 'FOR UPDATE' : ''}
    `,
    [Number(unitId)]
  );

  return rows[0] || null;
}

function getOverrideStatusLabel(statusCode, configuredLabel) {
  const normalizedCode = String(statusCode || '').trim();
  const labels = {
    approved: 'Accepted by Management',
    cancelled: 'Revoked',
    denied: 'Denied',
    expired: 'Expired',
    pending: 'Pending'
  };

  return labels[normalizedCode]
    || String(configuredLabel || '').trim()
    || 'Recorded';
}

function normalizeOverrideRow(row) {
  if (!row) return null;

  const statusCode = String(row.override_status_code || '').trim();

  return {
    overrideId: Number(row.unit_lot_validation_override_id),
    unitId: Number(row.unit_id),
    lotId: Number(row.lot_id),
    lotName: String(row.lot_name || '').trim() || 'Unknown lot',
    statusCode,
    statusLabel: getOverrideStatusLabel(statusCode, row.override_status_label),
    reason: row.reason || '',
    requirementSignature: row.requirement_signature || '',
    lotAssignmentSignature: row.lot_assignment_signature || '',
    requestedByUserId: Number(row.requested_by_user_id || 0) || null,
    requestedByName: String(row.requested_by_name || '').trim() || '',
    requestedAt: row.requested_at || null,
    approvedByUserId: Number(row.approved_by_user_id || 0) || null,
    approvedByName: String(row.approved_by_name || '').trim() || 'Management',
    approvedAt: row.approved_at || null,
    deniedAt: row.denied_at || null,
    revokedByUserId: Number(row.revoked_by_user_id || 0) || null,
    revokedByName: String(row.revoked_by_name || '').trim() || '',
    revokedAt: row.revoked_at || null,
    expiredAt: row.expired_at || null
  };
}

async function listApprovedOverridesForLot(lotId, unitIds, connection = pool) {
  const safeUnitIds = (Array.isArray(unitIds) ? unitIds : [])
    .map(Number)
    .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0);

  if (safeUnitIds.length === 0) return [];

  const [rows] = await connection.query(
    `
      SELECT
        override_record.*,
        status_value.code AS override_status_code,
        CONCAT_WS(' ', approver.first_name, approver.last_name) AS approved_by_name
      FROM unit_lot_validation_overrides override_record
      JOIN config_values status_value
        ON status_value.config_value_id = override_record.override_status_config_value_id
      LEFT JOIN users approver
        ON approver.user_id = override_record.approved_by_user_id
      WHERE override_record.lot_id = ?
        AND override_record.unit_id IN (${buildPlaceholders(safeUnitIds)})
        AND status_value.code = 'approved'
      ORDER BY
        override_record.unit_id,
        override_record.approved_at DESC,
        override_record.unit_lot_validation_override_id DESC
    `,
    [Number(lotId), ...safeUnitIds]
  );

  return rows.map(normalizeOverrideRow);
}


async function listOverrideHistoryForUnit(unitId, limit = 100, connection = pool) {
  const safeUnitId = Number(unitId);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);

  if (!Number.isSafeInteger(safeUnitId) || safeUnitId <= 0) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        override_record.*,
        status_value.code AS override_status_code,
        status_value.label AS override_status_label,
        lot_record.name AS lot_name,
        CONCAT_WS(' ', requester.first_name, requester.last_name) AS requested_by_name,
        CONCAT_WS(' ', approver.first_name, approver.last_name) AS approved_by_name,
        CONCAT_WS(' ', revoker.first_name, revoker.last_name) AS revoked_by_name
      FROM unit_lot_validation_overrides override_record
      JOIN config_values status_value
        ON status_value.config_value_id = override_record.override_status_config_value_id
      LEFT JOIN lots lot_record
        ON lot_record.lot_id = override_record.lot_id
      LEFT JOIN users requester
        ON requester.user_id = override_record.requested_by_user_id
      LEFT JOIN users approver
        ON approver.user_id = override_record.approved_by_user_id
      LEFT JOIN users revoker
        ON revoker.user_id = override_record.revoked_by_user_id
      WHERE override_record.unit_id = ?
      ORDER BY
        COALESCE(
          override_record.revoked_at,
          override_record.expired_at,
          override_record.denied_at,
          override_record.approved_at,
          override_record.requested_at
        ) DESC,
        override_record.unit_lot_validation_override_id DESC
      LIMIT ?
    `,
    [safeUnitId, safeLimit]
  );

  return rows.map(normalizeOverrideRow);
}

async function expireSelectedOverrideRows(rows, expirationReason, connection = pool) {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => Number(row.unit_lot_validation_override_id) > 0) : [];
  if (safeRows.length === 0) return 0;

  const approvedStatusId = await getOverrideStatusId('approved', connection);
  const expiredStatusId = await getOverrideStatusId('expired', connection);
  const ids = safeRows.map((row) => Number(row.unit_lot_validation_override_id));
  const [result] = await connection.query(
    `
      UPDATE unit_lot_validation_overrides
      SET
        override_status_config_value_id = ?,
        expired_at = COALESCE(expired_at, NOW())
      WHERE unit_lot_validation_override_id IN (${buildPlaceholders(ids)})
        AND override_status_config_value_id = ?
    `,
    [expiredStatusId, ...ids, approvedStatusId]
  );

  if (Number(result.affectedRows || 0) > 0) {
    await unitWorkflowAudit.recordExpiredExceptions(connection, safeRows, expirationReason);
  }

  return Number(result.affectedRows || 0);
}

async function expireOverrideIds(overrideIds, connection = pool) {
  const safeIds = (Array.isArray(overrideIds) ? overrideIds : [])
    .map(Number)
    .filter((overrideId) => Number.isSafeInteger(overrideId) && overrideId > 0);

  if (safeIds.length === 0) return 0;
  const approvedStatusId = await getOverrideStatusId('approved', connection);
  const [rows] = await connection.query(
    `
      SELECT unit_lot_validation_override_id, unit_id, lot_id, reason
      FROM unit_lot_validation_overrides
      WHERE unit_lot_validation_override_id IN (${buildPlaceholders(safeIds)})
        AND override_status_config_value_id = ?
    `,
    [...safeIds, approvedStatusId]
  );
  return expireSelectedOverrideRows(rows, 'The Unit assignment or Lot stay changed', connection);
}

async function expireRequirementChangedOverrides(lotId, requirementSignature, connection = pool) {
  const approvedStatusId = await getOverrideStatusId('approved', connection);
  const [rows] = await connection.query(
    `
      SELECT unit_lot_validation_override_id, unit_id, lot_id, reason
      FROM unit_lot_validation_overrides
      WHERE lot_id = ?
        AND override_status_config_value_id = ?
        AND (
          requirement_signature IS NULL
          OR requirement_signature <> ?
        )
    `,
    [Number(lotId), approvedStatusId, String(requirementSignature || '')]
  );
  return expireSelectedOverrideRows(rows, 'Lot requirements changed', connection);
}

async function expireMovedUnitOverrides(lotId, connection = pool) {
  const approvedStatusId = await getOverrideStatusId('approved', connection);
  const [rows] = await connection.query(
    `
      SELECT
        override_record.unit_lot_validation_override_id,
        override_record.unit_id,
        override_record.lot_id,
        override_record.reason
      FROM unit_lot_validation_overrides override_record
      JOIN units unit_record
        ON unit_record.unit_id = override_record.unit_id
      WHERE override_record.lot_id = ?
        AND override_record.override_status_config_value_id = ?
        AND (unit_record.lot_id IS NULL OR unit_record.lot_id <> override_record.lot_id)
    `,
    [Number(lotId), approvedStatusId]
  );
  return expireSelectedOverrideRows(rows, 'The Unit left the accepted Lot', connection);
}

async function getActiveOverrideMapForLot({
  lotId,
  unitSnapshots,
  requirementSignature,
  connection = pool
}) {
  const safeSnapshots = Array.isArray(unitSnapshots) ? unitSnapshots : [];
  const unitIds = safeSnapshots.map((unit) => Number(unit.unitId)).filter((id) => Number.isSafeInteger(id) && id > 0);

  await expireRequirementChangedOverrides(lotId, requirementSignature, connection);
  await expireMovedUnitOverrides(lotId, connection);

  const approvedOverrides = await listApprovedOverridesForLot(lotId, unitIds, connection);
  const snapshotByUnitId = new Map(safeSnapshots.map((unit) => [Number(unit.unitId), unit]));
  const staleIds = [];
  const activeMap = new Map();

  approvedOverrides.forEach((override) => {
    const snapshot = snapshotByUnitId.get(Number(override.unitId));
    const signaturesMatch = Boolean(
      snapshot
      && override.requirementSignature === requirementSignature
      && override.lotAssignmentSignature === snapshot.lotAssignmentSignature
    );

    if (!signaturesMatch) {
      staleIds.push(override.overrideId);
      return;
    }

    if (!activeMap.has(override.unitId)) {
      activeMap.set(override.unitId, override);
    }
  });

  await expireOverrideIds(staleIds, connection);

  return activeMap;
}

async function createApprovedOverride({ unitId, lotId, approvedByUserId, reason }) {
  const normalizedReason = String(reason || '').trim();

  if (!normalizedReason) {
    throw new Error('A reason is required to accept this Unit.');
  }

  if (normalizedReason.length > 500) {
    throw new Error('The acceptance reason must be 500 characters or fewer.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const assignmentState = await getUnitAssignmentState(unitId, connection, { lock: true });

    if (!assignmentState || Number(assignmentState.lot_id) !== Number(lotId)) {
      throw new Error('The Unit is no longer assigned to this Lot.');
    }

    const requirements = await listRawRequirementsForSignature(lotId, connection);
    const requirementSignature = buildRequirementSignature(requirements);
    const lotAssignmentSignature = buildLotAssignmentSignature({
      unitId: assignmentState.unit_id,
      lotId: assignmentState.lot_id,
      latestLotHistoryId: assignmentState.latest_lot_history_id,
      latestLotMovedAt: assignmentState.latest_lot_moved_at,
      unitCreatedAt: assignmentState.created_at
    });
    const approvedStatusId = await getOverrideStatusId('approved', connection);

    const [replacedRows] = await connection.query(
      `
        SELECT unit_lot_validation_override_id, unit_id, lot_id, reason
        FROM unit_lot_validation_overrides
        WHERE unit_id = ?
          AND lot_id = ?
          AND override_status_config_value_id = ?
        FOR UPDATE
      `,
      [Number(unitId), Number(lotId), approvedStatusId]
    );
    await expireSelectedOverrideRows(replacedRows, 'A newer Management acceptance replaced this record', connection);

    const [result] = await connection.query(
      `
        INSERT INTO unit_lot_validation_overrides (
          unit_id,
          lot_id,
          requested_by_user_id,
          approved_by_user_id,
          override_status_config_value_id,
          reason,
          requirement_signature,
          lot_assignment_signature,
          requested_at,
          approved_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        Number(unitId),
        Number(lotId),
        Number(approvedByUserId),
        Number(approvedByUserId),
        approvedStatusId,
        normalizedReason,
        requirementSignature,
        lotAssignmentSignature
      ]
    );

    const lotName = await getLotName(lotId, connection);
    await unitAuditEventModel.createUnitAuditEvent({
      unitId: Number(unitId),
      actorUserId: Number(approvedByUserId),
      eventType: 'lot_requirement_exception_accepted',
      eventSource: 'lot_validation_override',
      eventSummary: `Accepted Lot requirement exception for ${lotName}`,
      metadata: {
        lotId: Number(lotId),
        lotName,
        overrideId: Number(result.insertId)
      },
      changes: [
        {
          fieldKey: 'lot_requirement_acceptance',
          fieldLabel: 'Lot Requirement Acceptance',
          changeType: 'accepted',
          oldValue: null,
          newValue: { lotId: Number(lotId), lotName, reason: normalizedReason },
          oldValueText: '',
          newValueText: `${lotName}: ${normalizedReason}`,
          sortOrder: 10
        }
      ]
    }, connection);

    await connection.commit();

    return { overrideId: Number(result.insertId) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeApprovedOverride({ overrideId, unitId, lotId, revokedByUserId }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const approvedStatusId = await getOverrideStatusId('approved', connection);
    const cancelledStatusId = await getOverrideStatusId('cancelled', connection);
    const [overrideRows] = await connection.query(
      `
        SELECT reason
        FROM unit_lot_validation_overrides
        WHERE unit_lot_validation_override_id = ?
          AND unit_id = ?
          AND lot_id = ?
          AND override_status_config_value_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [Number(overrideId), Number(unitId), Number(lotId), approvedStatusId]
    );
    const [result] = await connection.query(
      `
        UPDATE unit_lot_validation_overrides
        SET
          override_status_config_value_id = ?,
          revoked_by_user_id = ?,
          revoked_at = NOW()
        WHERE unit_lot_validation_override_id = ?
          AND unit_id = ?
          AND lot_id = ?
          AND override_status_config_value_id = ?
      `,
      [
        cancelledStatusId,
        Number(revokedByUserId),
        Number(overrideId),
        Number(unitId),
        Number(lotId),
        approvedStatusId
      ]
    );

    if (Number(result.affectedRows || 0) !== 1) {
      throw new Error('The management acceptance is no longer active.');
    }

    const lotName = await getLotName(lotId, connection);
    const originalReason = String(overrideRows[0]?.reason || '').trim();
    await unitAuditEventModel.createUnitAuditEvent({
      unitId: Number(unitId),
      actorUserId: Number(revokedByUserId),
      eventType: 'lot_requirement_exception_revoked',
      eventSource: 'lot_validation_override',
      eventSummary: `Revoked Lot requirement exception for ${lotName}`,
      metadata: {
        lotId: Number(lotId),
        lotName,
        overrideId: Number(overrideId)
      },
      changes: [
        {
          fieldKey: 'lot_requirement_acceptance',
          fieldLabel: 'Lot Requirement Acceptance',
          changeType: 'revoked',
          oldValue: { lotId: Number(lotId), lotName, reason: originalReason || null },
          newValue: null,
          oldValueText: originalReason ? `${lotName}: ${originalReason}` : lotName,
          newValueText: 'Revoked',
          sortOrder: 10
        }
      ]
    }, connection);

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createApprovedOverride,
  expireMovedUnitOverrides,
  expireRequirementChangedOverrides,
  getActiveOverrideMapForLot,
  getOverrideStatusId,
  getUnitAssignmentState,
  listApprovedOverridesForLot,
  listOverrideHistoryForUnit,
  listRawRequirementsForSignature,
  revokeApprovedOverride
};
