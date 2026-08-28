'use strict';

const { pool } = require('./db');
const unitAuditEventModel = require('./unitAuditEventModel');
const lotQcRequirementModel = require('./lotQcRequirementModel');
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
  'reviewed_at',
  'reverted_at',
  'reverted_by_user_id',
  'reversion_reason'
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
    reviewedAt: row.reviewed_at || null,
    isReverted: Boolean(row.reverted_at),
    revertedAt: row.reverted_at || null,
    revertedByUserId: Number(row.reverted_by_user_id) || null,
    revertedByName: [row.reverted_by_first_name, row.reverted_by_last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || row.reverted_by_email || '',
    reversionReason: String(row.reversion_reason || '').trim()
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
        qc.reverted_at,
        qc.reverted_by_user_id,
        qc.reversion_reason,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email,
        reverted_by.first_name AS reverted_by_first_name,
        reverted_by.last_name AS reverted_by_last_name,
        reverted_by.email AS reverted_by_email
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
      LEFT JOIN users reverted_by
        ON reverted_by.user_id = qc.reverted_by_user_id
      WHERE qc.reverted_at IS NULL
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
        qc.reverted_at,
        qc.reverted_by_user_id,
        qc.reversion_reason,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email,
        reverted_by.first_name AS reverted_by_first_name,
        reverted_by.last_name AS reverted_by_last_name,
        reverted_by.email AS reverted_by_email
      FROM unit_qc_checks qc
      LEFT JOIN users reviewer
        ON reviewer.user_id = qc.reviewed_by_user_id
      LEFT JOIN users reverted_by
        ON reverted_by.user_id = qc.reverted_by_user_id
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

    await lotQcRequirementModel.assertUnitQcRequired({ unitId: safeUnitId, connection });

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


function normalizeReversionReason(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    const error = new Error('Enter a reason for reverting the Quality Control decision.');
    error.code = 'BWT_QC_REVERSION_REASON_REQUIRED';
    throw error;
  }
  if (normalized.length > 2000) {
    const error = new Error('QC reversion reason must be 2,000 characters or fewer.');
    error.code = 'BWT_QC_REVERSION_REASON_TOO_LONG';
    throw error;
  }
  return normalized;
}

async function lockQcReviewReversionTargetWithConnection(connection, {
  unitId,
  qcCheckId
}) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const safeQcCheckId = normalizePositiveInteger(qcCheckId, 'QC check ID');

  if (!await isQcCheckSchemaReady(connection)) {
    const error = new Error('QC reversion storage is not ready. Apply the Stage 10W70C migration.');
    error.code = 'BWT_QC_SCHEMA_REQUIRED';
    throw error;
  }

  const [[state]] = await connection.query(
    `
      SELECT
        qc.unit_qc_check_id,
        qc.unit_id,
        qc.unit_work_completion_id,
        qc.reviewed_by_user_id,
        qc.decision_code,
        qc.review_notes,
        qc.reviewed_at,
        qc.reverted_at,
        u.lot_id AS current_lot_id,
        u.created_at AS unit_created_at,
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
      FROM unit_qc_checks qc
      INNER JOIN unit_work_completions completion
        ON completion.unit_work_completion_id = qc.unit_work_completion_id
       AND completion.unit_id = qc.unit_id
      INNER JOIN units u
        ON u.unit_id = qc.unit_id
      WHERE qc.unit_qc_check_id = ?
        AND qc.unit_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [safeQcCheckId, safeUnitId]
  );

  if (!state) {
    const error = new Error('The selected Quality Control decision could not be found.');
    error.code = 'BWT_QC_REVERSION_NOT_FOUND';
    throw error;
  }

  if (state.reverted_at) {
    const error = new Error('This Quality Control decision has already been reverted.');
    error.code = 'BWT_QC_REVERSION_ALREADY_REVERTED';
    throw error;
  }

  await lotQcRequirementModel.assertUnitQcRequired({ unitId: safeUnitId, connection });

  assertCurrentQcCompletionCycle(state, {
    code: 'BWT_QC_REVERSION_COMPLETION_STALE',
    message: 'This Quality Control decision belongs to an older Unit work cycle and cannot be reverted.'
  });

  const [[latest]] = await connection.query(
    `
      SELECT unit_qc_check_id, reverted_at
      FROM unit_qc_checks
      WHERE unit_work_completion_id = ?
      ORDER BY unit_qc_check_id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [state.unit_work_completion_id]
  );

  if (Number(latest && latest.unit_qc_check_id || 0) !== safeQcCheckId) {
    const error = new Error('A newer Quality Control decision exists. Refresh the Unit and review the latest decision.');
    error.code = 'BWT_QC_REVERSION_NOT_LATEST';
    throw error;
  }

  if (latest && latest.reverted_at) {
    const error = new Error('This Quality Control decision has already been reverted.');
    error.code = 'BWT_QC_REVERSION_ALREADY_REVERTED';
    throw error;
  }

  return state;
}

async function revertQcReviewWithConnection(connection, {
  unitId,
  qcCheckId,
  revertedByUserId,
  reversionReason,
  unitRequestId = null
}) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const safeQcCheckId = normalizePositiveInteger(qcCheckId, 'QC check ID');
  const safeRevertedByUserId = normalizePositiveInteger(revertedByUserId, 'Reverting user ID');
  const safeReason = normalizeReversionReason(reversionReason);
  const safeUnitRequestId = unitRequestId ? normalizePositiveInteger(unitRequestId, 'Unit Request ID') : null;
  const state = await lockQcReviewReversionTargetWithConnection(connection, {
    unitId: safeUnitId,
    qcCheckId: safeQcCheckId
  });

  const [updateResult] = await connection.query(
    `
      UPDATE unit_qc_checks
      SET
        reverted_at = CURRENT_TIMESTAMP(6),
        reverted_by_user_id = ?,
        reversion_reason = ?
      WHERE unit_qc_check_id = ?
        AND reverted_at IS NULL
      LIMIT 1
    `,
    [safeRevertedByUserId, safeReason, safeQcCheckId]
  );

  if (Number(updateResult.affectedRows || 0) !== 1) {
    const error = new Error('The Quality Control decision changed before it could be reverted. Refresh and try again.');
    error.code = 'BWT_QC_REVERSION_STALE';
    throw error;
  }

  await unitAuditEventModel.insertEventWithConnection(connection, {
    unitId: safeUnitId,
    actorUserId: safeRevertedByUserId,
    eventType: 'unit_qc_reverted',
    eventSource: safeUnitRequestId ? 'quality_control_reversion_request' : 'quality_control_reversion',
    eventSummary: 'Quality Control decision reverted to Awaiting QC',
    metadata: {
      qcCheckId: safeQcCheckId,
      unitWorkCompletionId: Number(state.unit_work_completion_id),
      decisionCode: String(state.decision_code || ''),
      ...(safeUnitRequestId ? { unitRequestId: safeUnitRequestId } : {})
    },
    changes: [
      {
        fieldKey: 'qc_decision',
        fieldLabel: 'Quality Control Decision',
        changeType: 'reverted',
        oldValueText: decisionLabel(String(state.decision_code || '')),
        newValueText: 'Awaiting QC',
        sortOrder: 10
      },
      {
        fieldKey: 'qc_reversion_reason',
        fieldLabel: 'QC Reversion Reason',
        changeType: 'recorded',
        oldValueText: null,
        newValueText: safeReason,
        sortOrder: 20
      }
    ]
  });

  return {
    reverted: true,
    unitId: safeUnitId,
    qcCheckId: safeQcCheckId,
    unitWorkCompletionId: Number(state.unit_work_completion_id),
    previousDecisionCode: String(state.decision_code || '')
  };
}

async function revertQcReview(values) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await revertQcReviewWithConnection(connection, values);
    await connection.commit();
    return result;
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
  lockQcReviewReversionTargetWithConnection,
  mapQcCheckRow,
  normalizeDecisionCode,
  normalizeReviewNotes,
  normalizeReversionReason,
  recordQcReview,
  revertQcReview,
  revertQcReviewWithConnection
};
