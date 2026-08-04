'use strict';

const { pool } = require('./db');
const unitAuditEventModel = require('./unitAuditEventModel');
const unitQcCorrectionModel = require('./unitQcCorrectionModel');
const { assertCurrentQcCompletionCycle } = require('../services/qcCompletionCyclePolicy');

const VALID_DECISIONS = new Set(['accepted', 'rejected']);
const REQUIRED_COLUMNS = new Set([
  'unit_qc_check_id',
  'unit_id',
  'unit_work_completion_id',
  'reviewed_by_user_id',
  'decision_code',
  'review_notes',
  'reviewed_at'
]);

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeDecisionCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!VALID_DECISIONS.has(normalized)) {
    throw new Error('QC decision must be accepted or rejected.');
  }
  return normalized;
}

function normalizeReviewNotes(value, decisionCode) {
  const normalized = String(value || '').trim();
  if (normalized.length > 2000) {
    throw new Error('QC notes must be 2,000 characters or fewer.');
  }
  if (decisionCode === 'rejected' && !normalized) {
    throw new Error('A rejection reason is required.');
  }
  return normalized || null;
}

function decisionLabel(decisionCode) {
  return decisionCode === 'accepted' ? 'Accepted' : 'Rejected';
}

function mapQcCheckRow(row) {
  if (!row) return null;
  const code = normalizeDecisionCode(row.decision_code);
  const reviewerName = [row.reviewer_first_name, row.reviewer_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    qcCheckId: Number(row.unit_qc_check_id),
    unitId: Number(row.unit_id),
    unitWorkCompletionId: Number(row.unit_work_completion_id),
    reviewedByUserId: Number(row.reviewed_by_user_id) || null,
    reviewedByName: reviewerName || row.reviewer_email || 'Quality Control',
    decisionCode: code,
    decisionLabel: decisionLabel(code),
    notes: String(row.review_notes || '').trim(),
    reviewedAt: row.reviewed_at || null
  };
}

async function isQcCheckSchemaReady(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_qc_checks'
    `
  );
  const columns = new Set(rows.map((row) => String(row.column_name || '')));
  return [...REQUIRED_COLUMNS].every((columnName) => columns.has(columnName));
}

async function listLatestQcChecksForCompletions(completionIds, connection = pool) {
  const ids = Array.isArray(completionIds)
    ? [...new Set(completionIds.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))]
    : [];
  const result = new Map();

  if (ids.length === 0 || !await isQcCheckSchemaReady(connection)) {
    return result;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
      SELECT
        qc.unit_qc_check_id,
        qc.unit_id,
        qc.unit_work_completion_id,
        qc.reviewed_by_user_id,
        qc.decision_code,
        qc.review_notes,
        qc.reviewed_at,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email
      FROM unit_qc_checks qc
      INNER JOIN (
        SELECT unit_work_completion_id, MAX(unit_qc_check_id) AS latest_qc_check_id
        FROM unit_qc_checks
        WHERE unit_work_completion_id IN (${placeholders})
        GROUP BY unit_work_completion_id
      ) latest
        ON latest.latest_qc_check_id = qc.unit_qc_check_id
      LEFT JOIN users reviewer
        ON reviewer.user_id = qc.reviewed_by_user_id
    `,
    ids
  );

  rows.forEach((row) => {
    const mapped = mapQcCheckRow(row);
    result.set(mapped.unitWorkCompletionId, mapped);
  });

  return result;
}

async function listQcChecksForCompletion(unitWorkCompletionId, connection = pool) {
  const safeCompletionId = normalizePositiveInteger(unitWorkCompletionId, 'Unit work completion ID');

  if (!await isQcCheckSchemaReady(connection)) {
    return [];
  }

  const [rows] = await connection.query(
    `
      SELECT
        qc.unit_qc_check_id,
        qc.unit_id,
        qc.unit_work_completion_id,
        qc.reviewed_by_user_id,
        qc.decision_code,
        qc.review_notes,
        qc.reviewed_at,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email
      FROM unit_qc_checks qc
      LEFT JOIN users reviewer
        ON reviewer.user_id = qc.reviewed_by_user_id
      WHERE qc.unit_work_completion_id = ?
      ORDER BY qc.reviewed_at ASC, qc.unit_qc_check_id ASC
    `,
    [safeCompletionId]
  );

  return rows.map(mapQcCheckRow);
}

async function getLatestQcCheckForCompletion(unitWorkCompletionId, connection = pool) {
  const safeCompletionId = normalizePositiveInteger(unitWorkCompletionId, 'Unit work completion ID');
  const result = await listLatestQcChecksForCompletions([safeCompletionId], connection);
  return result.get(safeCompletionId) || null;
}

async function recordQcReview({ unitId, unitWorkCompletionId, reviewedByUserId, decisionCode, reviewNotes }) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const safeCompletionId = normalizePositiveInteger(unitWorkCompletionId, 'Unit work completion ID');
  const safeReviewerId = normalizePositiveInteger(reviewedByUserId, 'Reviewer user ID');
  const safeDecisionCode = normalizeDecisionCode(decisionCode);
  const safeReviewNotes = normalizeReviewNotes(reviewNotes, safeDecisionCode);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!await isQcCheckSchemaReady(connection)) {
      const error = new Error('QC review storage is not ready. Run the Stage 9B migration.');
      error.code = 'BWT_QC_SCHEMA_REQUIRED';
      throw error;
    }

    const [[unit]] = await connection.query(
      `
        SELECT
          u.unit_id,
          u.is_parked,
          u.lot_id AS current_lot_id,
          u.created_at AS unit_created_at,
          completion.unit_work_completion_id,
          completion.lot_id AS completion_lot_id,
          completion.credit_source,
          completion.work_cycle_key,
          completion.completed_at,
          completion.reversed_at,
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
        WHERE u.unit_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeCompletionId, safeUnitId]
    );

    if (!unit) {
      const error = new Error('The selected unit could not be found.');
      error.code = 'BWT_QC_COMPLETION_NOT_FOUND';
      throw error;
    }

    if (Number(unit.is_parked || 0) === 1) {
      const error = new Error('A parked unit cannot be reviewed by Quality Control.');
      error.code = 'BWT_QC_UNIT_PARKED';
      throw error;
    }

    assertCurrentQcCompletionCycle(unit, {
      code: 'BWT_QC_COMPLETION_STALE',
      message: 'This Unit completion is no longer the current work cycle. Refresh the Unit Browser before recording a Quality Control decision.'
    });

    const previous = await getLatestQcCheckForCompletion(safeCompletionId, connection);

    if (previous && previous.decisionCode === 'accepted') {
      const error = new Error('This completion cycle has already been accepted by Quality Control. Reverse completion and record a new completion cycle before reviewing it again.');
      error.code = 'BWT_QC_REVIEW_FINAL';
      throw error;
    }

    if (previous && previous.decisionCode === 'rejected') {
      const correction = await unitQcCorrectionModel.getLatestCorrectionForQcCheck(previous.qcCheckId, connection);
      if (!correction) {
        const error = new Error('The assigned technician must mark this Unit corrected before Quality Control can review it again.');
        error.code = 'BWT_QC_RECHECK_NOT_READY';
        throw error;
      }
    }

    const [insertResult] = await connection.query(
      `
        INSERT INTO unit_qc_checks (
          unit_id,
          unit_work_completion_id,
          reviewed_by_user_id,
          decision_code,
          review_notes
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [safeUnitId, safeCompletionId, safeReviewerId, safeDecisionCode, safeReviewNotes]
    );

    const qcCheckId = Number(insertResult.insertId);
    const nextLabel = decisionLabel(safeDecisionCode);
    const changes = [
      {
        fieldKey: 'qc_decision',
        fieldLabel: 'Quality Control Decision',
        changeType: previous ? 'changed' : 'recorded',
        oldValueText: previous ? previous.decisionLabel : null,
        newValueText: nextLabel,
        sortOrder: 10
      }
    ];

    if (safeReviewNotes) {
      changes.push({
        fieldKey: 'qc_notes',
        fieldLabel: 'Quality Control Notes',
        changeType: 'recorded',
        oldValueText: null,
        newValueText: safeReviewNotes,
        sortOrder: 20
      });
    }

    await unitAuditEventModel.insertEventWithConnection(connection, {
      unitId: safeUnitId,
      actorUserId: safeReviewerId,
      eventType: safeDecisionCode === 'accepted' ? 'unit_qc_accepted' : 'unit_qc_rejected',
      eventSource: 'quality_control',
      eventSummary: safeDecisionCode === 'accepted'
        ? 'Quality Control accepted the Unit'
        : 'Quality Control rejected the Unit',
      metadata: {
        qcCheckId,
        unitWorkCompletionId: safeCompletionId,
        decisionCode: safeDecisionCode,
        previousQcCheckId: previous ? previous.qcCheckId : null
      },
      changes
    });

    await connection.commit();
    return getLatestQcCheckForCompletion(safeCompletionId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  VALID_DECISIONS,
  decisionLabel,
  getLatestQcCheckForCompletion,
  isQcCheckSchemaReady,
  listLatestQcChecksForCompletions,
  listQcChecksForCompletion,
  mapQcCheckRow,
  normalizeDecisionCode,
  normalizeReviewNotes,
  recordQcReview
};
