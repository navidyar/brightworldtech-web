'use strict';

const { pool } = require('./db');
const unitAuditEventModel = require('./unitAuditEventModel');
const {
  assertCurrentQcCompletionCycle,
  canSubmitQcCorrectionForCurrentAssignment
} = require('../services/qcCompletionCyclePolicy');

const REQUIRED_COLUMNS = new Set([
  'unit_qc_correction_id',
  'unit_id',
  'unit_work_completion_id',
  'rejected_qc_check_id',
  'submitted_by_user_id',
  'correction_notes',
  'submitted_at'
]);

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeCorrectionNotes(value) {
  const normalized = String(value || '').trim();
  if (normalized.length > 2000) {
    throw new Error('Correction notes must be 2,000 characters or fewer.');
  }
  return normalized || null;
}

function mapCorrectionRow(row) {
  if (!row) return null;
  const submitterName = [row.submitter_first_name, row.submitter_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    qcCorrectionId: Number(row.unit_qc_correction_id),
    unitId: Number(row.unit_id),
    unitWorkCompletionId: Number(row.unit_work_completion_id),
    rejectedQcCheckId: Number(row.rejected_qc_check_id),
    submittedByUserId: Number(row.submitted_by_user_id) || null,
    submittedByName: submitterName || row.submitter_email || 'Technician',
    notes: String(row.correction_notes || '').trim(),
    submittedAt: row.submitted_at || null
  };
}

async function isQcCorrectionSchemaReady(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_qc_corrections'
    `
  );
  const columns = new Set(rows.map((row) => String(row.column_name || '')));
  return [...REQUIRED_COLUMNS].every((columnName) => columns.has(columnName));
}

async function listLatestCorrectionsForQcChecks(qcCheckIds, connection = pool) {
  const ids = Array.isArray(qcCheckIds)
    ? [...new Set(qcCheckIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))]
    : [];
  const result = new Map();

  if (ids.length === 0 || !await isQcCorrectionSchemaReady(connection)) {
    return result;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
      SELECT
        correction.unit_qc_correction_id,
        correction.unit_id,
        correction.unit_work_completion_id,
        correction.rejected_qc_check_id,
        correction.submitted_by_user_id,
        correction.correction_notes,
        correction.submitted_at,
        submitter.first_name AS submitter_first_name,
        submitter.last_name AS submitter_last_name,
        submitter.email AS submitter_email
      FROM unit_qc_corrections correction
      INNER JOIN (
        SELECT rejected_qc_check_id, MAX(unit_qc_correction_id) AS latest_correction_id
        FROM unit_qc_corrections
        WHERE rejected_qc_check_id IN (${placeholders})
        GROUP BY rejected_qc_check_id
      ) latest
        ON latest.latest_correction_id = correction.unit_qc_correction_id
      LEFT JOIN users submitter
        ON submitter.user_id = correction.submitted_by_user_id
    `,
    ids
  );

  rows.forEach((row) => {
    const mapped = mapCorrectionRow(row);
    result.set(mapped.rejectedQcCheckId, mapped);
  });

  return result;
}

async function listCorrectionsForCompletion(unitWorkCompletionId, connection = pool) {
  const safeCompletionId = normalizePositiveInteger(unitWorkCompletionId, 'Unit work completion ID');

  if (!await isQcCorrectionSchemaReady(connection)) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        correction.unit_qc_correction_id,
        correction.unit_id,
        correction.unit_work_completion_id,
        correction.rejected_qc_check_id,
        correction.submitted_by_user_id,
        correction.correction_notes,
        correction.submitted_at,
        submitter.first_name AS submitter_first_name,
        submitter.last_name AS submitter_last_name,
        submitter.email AS submitter_email
      FROM unit_qc_corrections correction
      LEFT JOIN users submitter
        ON submitter.user_id = correction.submitted_by_user_id
      WHERE correction.unit_work_completion_id = ?
      ORDER BY correction.submitted_at ASC, correction.unit_qc_correction_id ASC
    `,
    [safeCompletionId]
  );

  return rows.map(mapCorrectionRow);
}

async function getLatestCorrectionForQcCheck(rejectedQcCheckId, connection = pool) {
  const safeQcCheckId = normalizePositiveInteger(rejectedQcCheckId, 'Rejected QC check ID');
  const result = await listLatestCorrectionsForQcChecks([safeQcCheckId], connection);
  return result.get(safeQcCheckId) || null;
}

async function recordCorrectionSubmission({
  unitId,
  unitWorkCompletionId,
  rejectedQcCheckId,
  submittedByUserId,
  submittedByRoleCodes = [],
  correctionNotes
}) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const safeCompletionId = normalizePositiveInteger(unitWorkCompletionId, 'Unit work completion ID');
  const safeRejectedQcCheckId = normalizePositiveInteger(rejectedQcCheckId, 'Rejected QC check ID');
  const safeSubmitterId = normalizePositiveInteger(submittedByUserId, 'Submitter user ID');
  const safeCorrectionNotes = normalizeCorrectionNotes(correctionNotes);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!await isQcCorrectionSchemaReady(connection)) {
      const error = new Error('QC correction storage is not ready. Run the Stage 9G migration.');
      error.code = 'BWT_QC_CORRECTION_SCHEMA_REQUIRED';
      throw error;
    }

    const [[state]] = await connection.query(
      `
        SELECT
          u.unit_id,
          u.is_parked,
          u.lot_id AS current_lot_id,
          u.assigned_to_user_id,
          u.created_at AS unit_created_at,
          completion.unit_work_completion_id,
          completion.lot_id AS completion_lot_id,
          completion.credit_source,
          completion.work_cycle_key,
          completion.completed_at,
          completion.reversed_at,
          latest_qc.unit_qc_check_id AS latest_qc_check_id,
          latest_qc.decision_code AS latest_decision_code,
          (
            SELECT history.unit_lot_history_id
            FROM unit_lot_history history
            WHERE history.unit_id = u.unit_id
              AND history.to_lot_id = u.lot_id
            ORDER BY history.moved_at DESC, history.unit_lot_history_id DESC
            LIMIT 1
          ) AS current_lot_history_id,
          (
            SELECT history.moved_at
            FROM unit_lot_history history
            WHERE history.unit_id = u.unit_id
              AND history.to_lot_id = u.lot_id
            ORDER BY history.moved_at DESC, history.unit_lot_history_id DESC
            LIMIT 1
          ) AS current_lot_moved_at
        FROM units u
        INNER JOIN unit_work_completions completion
          ON completion.unit_work_completion_id = ?
         AND completion.unit_id = u.unit_id
         AND completion.credit_source = 'manual_completion'
         AND completion.reversed_at IS NULL
        INNER JOIN unit_qc_checks latest_qc
          ON latest_qc.unit_qc_check_id = (
            SELECT MAX(qc.unit_qc_check_id)
            FROM unit_qc_checks qc
            WHERE qc.unit_work_completion_id = completion.unit_work_completion_id
          )
        WHERE u.unit_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeCompletionId, safeUnitId]
    );

    if (!state) {
      const error = new Error('The selected completed Unit could not be found.');
      error.code = 'BWT_QC_CORRECTION_COMPLETION_NOT_FOUND';
      throw error;
    }

    if (Number(state.is_parked || 0) === 1) {
      const error = new Error('A parked Unit cannot be marked corrected.');
      error.code = 'BWT_QC_CORRECTION_UNIT_PARKED';
      throw error;
    }

    assertCurrentQcCompletionCycle(state, {
      code: 'BWT_QC_CORRECTION_COMPLETION_STALE',
      message: 'This Unit completion is no longer the current work cycle. Refresh the Unit Browser before marking it corrected.'
    });

    if (!canSubmitQcCorrectionForCurrentAssignment({
      submitterUserId: safeSubmitterId,
      assignedToUserId: state.assigned_to_user_id,
      roleCodes: submittedByRoleCodes
    })) {
      const error = new Error('The Unit assignment changed before this correction was saved. Refresh the Unit Browser.');
      error.code = 'BWT_QC_CORRECTION_PERMISSION_CHANGED';
      throw error;
    }

    if (Number(state.latest_qc_check_id) !== safeRejectedQcCheckId
      || String(state.latest_decision_code || '').trim().toLowerCase() !== 'rejected') {
      const error = new Error('This rejection is no longer the Unit’s current QC decision. Refresh the Unit Browser.');
      error.code = 'BWT_QC_CORRECTION_STALE_REJECTION';
      throw error;
    }

    const [[existing]] = await connection.query(
      `
        SELECT unit_qc_correction_id
        FROM unit_qc_corrections
        WHERE rejected_qc_check_id = ?
        LIMIT 1
      `,
      [safeRejectedQcCheckId]
    );

    if (existing) {
      const error = new Error('This rejection has already been marked corrected and is ready for QC recheck.');
      error.code = 'BWT_QC_CORRECTION_ALREADY_SUBMITTED';
      throw error;
    }

    const [insertResult] = await connection.query(
      `
        INSERT INTO unit_qc_corrections (
          unit_id,
          unit_work_completion_id,
          rejected_qc_check_id,
          submitted_by_user_id,
          correction_notes
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [safeUnitId, safeCompletionId, safeRejectedQcCheckId, safeSubmitterId, safeCorrectionNotes]
    );

    const qcCorrectionId = Number(insertResult.insertId);
    const changes = [
      {
        fieldKey: 'qc_workflow_status',
        fieldLabel: 'Quality Control Workflow',
        changeType: 'changed',
        oldValueText: 'Rejected · Pending correction',
        newValueText: 'Ready for QC recheck',
        sortOrder: 10
      }
    ];

    if (safeCorrectionNotes) {
      changes.push({
        fieldKey: 'qc_correction_notes',
        fieldLabel: 'Correction Notes',
        changeType: 'recorded',
        oldValueText: null,
        newValueText: safeCorrectionNotes,
        sortOrder: 20
      });
    }

    await unitAuditEventModel.insertEventWithConnection(connection, {
      unitId: safeUnitId,
      actorUserId: safeSubmitterId,
      eventType: 'unit_qc_correction_submitted',
      eventSource: 'technician',
      eventSummary: 'Unit marked corrected and ready for Quality Control recheck',
      metadata: {
        qcCorrectionId,
        rejectedQcCheckId: safeRejectedQcCheckId,
        unitWorkCompletionId: safeCompletionId
      },
      changes
    });

    await connection.commit();
    return getLatestCorrectionForQcCheck(safeRejectedQcCheckId, connection);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getLatestCorrectionForQcCheck,
  isQcCorrectionSchemaReady,
  listLatestCorrectionsForQcChecks,
  listCorrectionsForCompletion,
  mapCorrectionRow,
  normalizeCorrectionNotes,
  recordCorrectionSubmission
};
