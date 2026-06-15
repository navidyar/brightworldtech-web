const { pool } = require('./db');

const VALID_OUTCOME_CODES = new Set(['pass', 'fail']);

function normalizeOptionalInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNullableText(value, maxLength = 1000) {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function normalizeOutcomeCode(value) {
  const normalized = String(value || '').trim().toLowerCase();

  return VALID_OUTCOME_CODES.has(normalized) ? normalized : '';
}

function normalizeApprovalRequested(value) {
  const normalized = String(value || '').trim().toLowerCase();

  return ['1', 'true', 'yes', 'on', 'request'].includes(normalized);
}

function getOutcomeLabel(outcomeCode) {
  if (outcomeCode === 'pass') {
    return 'Pass';
  }

  if (outcomeCode === 'fail') {
    return 'Fail';
  }

  return '—';
}

function getApprovalStatusLabel(statusCode) {
  if (statusCode === 'pending') {
    return 'Approval Requested';
  }

  if (statusCode === 'approved') {
    return 'Approved';
  }

  if (statusCode === 'denied') {
    return 'Denied';
  }

  return 'Not Requested';
}

async function tableExists(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT 1 AS table_exists
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_outcomes'
      LIMIT 1
    `
  );

  return rows.length > 0;
}

function mapOutcomeRow(row) {
  if (!row) {
    return null;
  }

  const outcomeCode = row.outcome_code || '';
  const approvalStatusCode = row.approval_status_code || 'not_requested';
  const approvedByName = [row.approved_by_first_name, row.approved_by_last_name].filter(Boolean).join(' ').trim() || row.approved_by_email || '';
  const selectedByName = [row.selected_by_first_name, row.selected_by_last_name].filter(Boolean).join(' ').trim() || row.selected_by_email || '';
  const requestedByName = [row.requested_by_first_name, row.requested_by_last_name].filter(Boolean).join(' ').trim() || row.requested_by_email || '';

  return {
    unitOutcomeId: Number(row.unit_outcome_id),
    unitId: Number(row.unit_id),
    outcomeCode,
    outcomeLabel: getOutcomeLabel(outcomeCode),
    outcomeNotes: row.outcome_notes || '',
    approvalStatusCode,
    approvalStatusLabel: getApprovalStatusLabel(approvalStatusCode),
    selectedByName,
    selectedAt: row.selected_at,
    approvalRequestedByName: requestedByName,
    approvalRequestedAt: row.approval_requested_at,
    approvalRequestNotes: row.approval_request_notes || '',
    approvedByName,
    approvedAt: row.approved_at,
    approvalNotes: row.approval_notes || '',
    isPendingApproval: approvalStatusCode === 'pending',
    isApproved: approvalStatusCode === 'approved'
  };
}

async function getCurrentOutcomeByUnitId(unitId, connection = pool) {
  const safeUnitId = normalizeOptionalInteger(unitId);

  if (!safeUnitId || !await tableExists(connection)) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT
        uo.unit_outcome_id,
        uo.unit_id,
        uo.outcome_code,
        uo.outcome_notes,
        uo.approval_status_code,
        uo.selected_at,
        uo.approval_requested_at,
        uo.approval_request_notes,
        uo.approved_at,
        uo.approval_notes,
        selected_by.first_name AS selected_by_first_name,
        selected_by.last_name AS selected_by_last_name,
        selected_by.email AS selected_by_email,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email,
        approved_by.first_name AS approved_by_first_name,
        approved_by.last_name AS approved_by_last_name,
        approved_by.email AS approved_by_email
      FROM unit_outcomes uo
      LEFT JOIN users selected_by
        ON selected_by.user_id = uo.selected_by_user_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = uo.approval_requested_by_user_id
      LEFT JOIN users approved_by
        ON approved_by.user_id = uo.approved_by_user_id
      WHERE uo.unit_id = ?
        AND uo.is_current = 1
      ORDER BY uo.selected_at DESC, uo.unit_outcome_id DESC
      LIMIT 1
    `,
    [safeUnitId]
  );

  return mapOutcomeRow(rows[0]);
}

async function listCurrentOutcomesForUnits(unitIds, connection = pool) {
  const safeUnitIds = Array.from(
    new Set(
      (unitIds || [])
        .map((unitId) => normalizeOptionalInteger(unitId))
        .filter(Boolean)
    )
  );

  const outcomeMap = new Map();

  if (safeUnitIds.length === 0 || !await tableExists(connection)) {
    return outcomeMap;
  }

  const placeholders = safeUnitIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
      SELECT *
      FROM (
        SELECT
          uo.unit_outcome_id,
          uo.unit_id,
          uo.outcome_code,
          uo.outcome_notes,
          uo.approval_status_code,
          uo.selected_at,
          uo.approval_requested_at,
          uo.approval_request_notes,
          uo.approved_at,
          uo.approval_notes,
          selected_by.first_name AS selected_by_first_name,
          selected_by.last_name AS selected_by_last_name,
          selected_by.email AS selected_by_email,
          requested_by.first_name AS requested_by_first_name,
          requested_by.last_name AS requested_by_last_name,
          requested_by.email AS requested_by_email,
          approved_by.first_name AS approved_by_first_name,
          approved_by.last_name AS approved_by_last_name,
          approved_by.email AS approved_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY uo.unit_id
            ORDER BY uo.selected_at DESC, uo.unit_outcome_id DESC
          ) AS row_rank
        FROM unit_outcomes uo
        LEFT JOIN users selected_by
          ON selected_by.user_id = uo.selected_by_user_id
        LEFT JOIN users requested_by
          ON requested_by.user_id = uo.approval_requested_by_user_id
        LEFT JOIN users approved_by
          ON approved_by.user_id = uo.approved_by_user_id
        WHERE uo.unit_id IN (${placeholders})
          AND uo.is_current = 1
      ) ranked_outcomes
      WHERE row_rank = 1
    `,
    safeUnitIds
  );

  rows.forEach((row) => {
    outcomeMap.set(Number(row.unit_id), mapOutcomeRow(row));
  });

  return outcomeMap;
}

function getBlankOutcomeFormData() {
  return {
    outcomeCode: '',
    outcomeNotes: '',
    outcomeApprovalRequested: false,
    outcomeApprovalRequestNotes: ''
  };
}

async function getOutcomeFormDataByUnitId(unitId) {
  const currentOutcome = await getCurrentOutcomeByUnitId(unitId);

  if (!currentOutcome) {
    return getBlankOutcomeFormData();
  }

  return {
    outcomeCode: currentOutcome.outcomeCode || '',
    outcomeNotes: currentOutcome.outcomeNotes || '',
    outcomeApprovalRequested: currentOutcome.isPendingApproval,
    outcomeApprovalRequestNotes: currentOutcome.approvalRequestNotes || ''
  };
}


async function saveOutcomeForUnitWithConnection(connection, { unitId, formData, currentUserId }) {
  const safeUnitId = normalizeOptionalInteger(unitId);

  if (!safeUnitId || !await tableExists(connection)) {
    return;
  }

  const outcomeCode = normalizeOutcomeCode(formData.outcomeCode);
  const approvalRequested = normalizeApprovalRequested(formData.outcomeApprovalRequested);

  if (!outcomeCode) {
    return;
  }

  const outcomeNotes = normalizeNullableText(formData.outcomeNotes, 500);
  const approvalRequestNotes = approvalRequested
    ? normalizeNullableText(formData.outcomeApprovalRequestNotes, 1000)
    : null;
  const approvalStatusCode = approvalRequested ? 'pending' : 'not_requested';
  const userId = normalizeOptionalInteger(currentUserId);

  const [currentRows] = await connection.query(
    `
      SELECT
        unit_outcome_id,
        outcome_code,
        outcome_notes,
        approval_status_code,
        approval_request_notes
      FROM unit_outcomes
      WHERE unit_id = ?
        AND is_current = 1
      ORDER BY selected_at DESC, unit_outcome_id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [safeUnitId]
  );

  const currentRow = currentRows[0] || null;

  if (
    currentRow &&
    currentRow.outcome_code === outcomeCode &&
    String(currentRow.outcome_notes || '') === String(outcomeNotes || '') &&
    String(currentRow.approval_status_code || 'not_requested') === approvalStatusCode &&
    String(currentRow.approval_request_notes || '') === String(approvalRequestNotes || '')
  ) {
    return;
  }

  await connection.query(
    `
      UPDATE unit_outcomes
      SET is_current = 0
      WHERE unit_id = ?
        AND is_current = 1
    `,
    [safeUnitId]
  );

  await connection.query(
    `
      INSERT INTO unit_outcomes (
        unit_id,
        outcome_code,
        outcome_notes,
        approval_status_code,
        is_current,
        selected_by_user_id,
        approval_requested_by_user_id,
        approval_requested_at,
        approval_request_notes
      )
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    `,
    [
      safeUnitId,
      outcomeCode,
      outcomeNotes,
      approvalStatusCode,
      userId,
      approvalRequested ? userId : null,
      approvalRequested ? new Date() : null,
      approvalRequestNotes
    ]
  );
}

async function saveOutcomeForUnit({ unitId, formData, currentUserId }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await saveOutcomeForUnitWithConnection(connection, {
      unitId,
      formData,
      currentUserId
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveCurrentOutcome({ unitId, approvedByUserId, approvalNotes }) {
  const safeUnitId = normalizeOptionalInteger(unitId);
  const reviewerUserId = normalizeOptionalInteger(approvedByUserId);

  if (!safeUnitId || !reviewerUserId || !await tableExists()) {
    return false;
  }

  const [result] = await pool.query(
    `
      UPDATE unit_outcomes
      SET
        approval_status_code = 'approved',
        approved_by_user_id = ?,
        approved_at = NOW(),
        approval_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE unit_id = ?
        AND is_current = 1
        AND approval_status_code = 'pending'
      ORDER BY selected_at DESC, unit_outcome_id DESC
      LIMIT 1
    `,
    [reviewerUserId, normalizeNullableText(approvalNotes, 1000), safeUnitId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  VALID_OUTCOME_CODES,
  normalizeOutcomeCode,
  normalizeApprovalRequested,
  getOutcomeLabel,
  getApprovalStatusLabel,
  tableExists,
  getBlankOutcomeFormData,
  getOutcomeFormDataByUnitId,
  getCurrentOutcomeByUnitId,
  listCurrentOutcomesForUnits,
  saveOutcomeForUnit,
  saveOutcomeForUnitWithConnection,
  approveCurrentOutcome
};
