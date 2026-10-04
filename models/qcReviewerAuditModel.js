'use strict';

const { pool } = require('./db');
const techUnitModel = require('./techUnitModel');
const unitAuditEventModel = require('./unitAuditEventModel');

const VALID_OUTCOMES = new Set(['agree', 'missed_defect', 'false_rejection']);
const REQUIRED_COLUMNS = new Set([
  'qc_reviewer_audit_id',
  'unit_qc_check_id',
  'audited_by_user_id',
  'audit_outcome',
  'audit_notes',
  'audited_at'
]);

function normalizePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label} must be a positive integer.`);
    error.code = 'BWT_QC_REVIEWER_AUDIT_INPUT_INVALID';
    throw error;
  }
  return parsed;
}

function normalizeOutcome(value) {
  const outcome = String(value || '').trim().toLowerCase();
  if (!VALID_OUTCOMES.has(outcome)) {
    const error = new Error('Choose Agree, QC Missed Defect, or QC False Rejection.');
    error.code = 'BWT_QC_REVIEWER_AUDIT_INPUT_INVALID';
    throw error;
  }
  return outcome;
}

function normalizeNotes(value, outcome) {
  const notes = String(value || '').trim();
  if (notes.length > 2000) {
    const error = new Error('QC reviewer audit notes must be 2,000 characters or fewer.');
    error.code = 'BWT_QC_REVIEWER_AUDIT_INPUT_INVALID';
    throw error;
  }
  if (outcome !== 'agree' && !notes) {
    const error = new Error('Explain the QC discrepancy when the audit does not agree with the original QC decision.');
    error.code = 'BWT_QC_REVIEWER_AUDIT_INPUT_INVALID';
    throw error;
  }
  return notes || null;
}

function outcomeLabel(outcome) {
  if (outcome === 'agree') return 'Agree';
  if (outcome === 'missed_defect') return 'QC Missed Defect';
  if (outcome === 'false_rejection') return 'QC False Rejection';
  return 'Unknown';
}

function mapAuditReviewRow(row) {
  if (!row) return null;
  const qcCheckId = Number(row.unit_qc_check_id);
  const unitId = Number(row.unit_id);
  const reviewerUserId = Number(row.reviewed_by_user_id);
  const auditOutcome = String(row.audit_outcome || '').trim().toLowerCase();
  const assetNumber = Number(row.asset_number);
  return {
    qcCheckId: Number.isSafeInteger(qcCheckId) ? qcCheckId : null,
    unitId: Number.isSafeInteger(unitId) ? unitId : null,
    unitLabel: Number.isSafeInteger(assetNumber) && assetNumber > 0
      ? techUnitModel.getDisplayAssetTag(assetNumber)
      : `Unit #${unitId}`,
    completionId: Number(row.unit_work_completion_id) || null,
    completedAt: row.completed_at || null,
    reviewerUserId: Number.isSafeInteger(reviewerUserId) ? reviewerUserId : null,
    reviewerName: [row.reviewer_first_name, row.reviewer_last_name].filter(Boolean).join(' ').trim()
      || row.reviewer_email
      || (reviewerUserId ? `Reviewer #${reviewerUserId}` : 'Quality Control'),
    decisionCode: String(row.decision_code || '').trim().toLowerCase(),
    decisionLabel: String(row.decision_code || '').trim().toLowerCase() === 'accepted' ? 'Accepted' : 'Rejected',
    reviewNotes: String(row.review_notes || '').trim(),
    reviewedAt: row.reviewed_at || null,
    isReverted: Boolean(row.reverted_at),
    audit: row.qc_reviewer_audit_id ? {
      auditId: Number(row.qc_reviewer_audit_id),
      outcome: auditOutcome,
      outcomeLabel: outcomeLabel(auditOutcome),
      notes: String(row.audit_notes || '').trim(),
      auditedAt: row.audited_at || null,
      auditedByUserId: Number(row.audited_by_user_id) || null,
      auditedByName: [row.auditor_first_name, row.auditor_last_name].filter(Boolean).join(' ').trim()
        || row.auditor_email
        || 'QC Auditor'
    } : null
  };
}

async function isQcReviewerAuditSchemaReady(connection = pool) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'qc_reviewer_audits'`
  );
  const columns = new Set(rows.map((row) => String(row.column_name || '')));
  return [...REQUIRED_COLUMNS].every((columnName) => columns.has(columnName));
}

async function assertSchemaReady(connection = pool) {
  if (await isQcReviewerAuditSchemaReady(connection)) return;
  const error = new Error('QC reviewer audit storage is not ready. Run the QC reviewer oversight migration.');
  error.code = 'BWT_QC_REVIEWER_AUDIT_SCHEMA_REQUIRED';
  throw error;
}

async function getReviewForAudit(qcCheckId, connection = pool) {
  const safeQcCheckId = normalizePositiveInteger(qcCheckId, 'QC check ID');
  await assertSchemaReady(connection);
  const [rows] = await connection.query(
    `SELECT
        qc.unit_qc_check_id,
        qc.unit_id,
        qc.unit_work_completion_id,
        qc.reviewed_by_user_id,
        qc.decision_code,
        qc.review_notes,
        qc.reviewed_at,
        qc.reverted_at,
        completion.completed_at,
        unit_record.asset_number,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email,
        audit.qc_reviewer_audit_id,
        audit.audited_by_user_id,
        audit.audit_outcome,
        audit.audit_notes,
        audit.audited_at,
        auditor.first_name AS auditor_first_name,
        auditor.last_name AS auditor_last_name,
        auditor.email AS auditor_email
       FROM unit_qc_checks qc
       INNER JOIN unit_work_completions completion
         ON completion.unit_work_completion_id = qc.unit_work_completion_id
        AND completion.unit_id = qc.unit_id
       INNER JOIN units unit_record
         ON unit_record.unit_id = qc.unit_id
       LEFT JOIN users reviewer
         ON reviewer.user_id = qc.reviewed_by_user_id
       LEFT JOIN qc_reviewer_audits audit
         ON audit.unit_qc_check_id = qc.unit_qc_check_id
       LEFT JOIN users auditor
         ON auditor.user_id = audit.audited_by_user_id
      WHERE qc.unit_qc_check_id = ?
      LIMIT 1`,
    [safeQcCheckId]
  );
  return mapAuditReviewRow(rows[0] || null);
}

async function recordReviewerAudit({ qcCheckId, auditedByUserId, outcome, notes = '' }) {
  const safeQcCheckId = normalizePositiveInteger(qcCheckId, 'QC check ID');
  const safeAuditorUserId = normalizePositiveInteger(auditedByUserId, 'Auditor user ID');
  const safeOutcome = normalizeOutcome(outcome);
  const safeNotes = normalizeNotes(notes, safeOutcome);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await assertSchemaReady(connection);
    const [rows] = await connection.query(
      `SELECT qc.unit_qc_check_id, qc.unit_id, qc.reviewed_by_user_id, qc.decision_code, qc.reverted_at
         FROM unit_qc_checks qc
        WHERE qc.unit_qc_check_id = ?
        LIMIT 1
        FOR UPDATE`,
      [safeQcCheckId]
    );
    const review = rows[0] || null;
    if (!review) {
      const error = new Error('The selected QC decision could not be found.');
      error.code = 'BWT_QC_REVIEWER_AUDIT_NOT_FOUND';
      throw error;
    }
    if (review.reverted_at) {
      const error = new Error('A reverted QC decision cannot receive a new reviewer audit.');
      error.code = 'BWT_QC_REVIEWER_AUDIT_REVERTED';
      throw error;
    }
    if (Number(review.reviewed_by_user_id) === safeAuditorUserId) {
      const error = new Error('A QC reviewer cannot audit their own QC decision.');
      error.code = 'BWT_QC_REVIEWER_AUDIT_SELF_REVIEW';
      throw error;
    }

    const [existing] = await connection.query(
      'SELECT qc_reviewer_audit_id FROM qc_reviewer_audits WHERE unit_qc_check_id = ? LIMIT 1 FOR UPDATE',
      [safeQcCheckId]
    );
    if (existing.length) {
      const error = new Error('This QC decision has already been audited.');
      error.code = 'BWT_QC_REVIEWER_AUDIT_EXISTS';
      throw error;
    }

    const [result] = await connection.query(
      `INSERT INTO qc_reviewer_audits (
        unit_qc_check_id, audited_by_user_id, audit_outcome, audit_notes, audited_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
      [safeQcCheckId, safeAuditorUserId, safeOutcome, safeNotes]
    );

    await unitAuditEventModel.insertEventWithConnection(connection, {
      unitId: Number(review.unit_id),
      actorUserId: safeAuditorUserId,
      eventType: 'unit_qc_reviewer_audited',
      eventSource: 'qc_team_oversight',
      eventSummary: `QC reviewer audit recorded: ${outcomeLabel(safeOutcome)}.`,
      metadata: {
        qcCheckId: safeQcCheckId,
        qcReviewerAuditId: Number(result.insertId),
        originalReviewerUserId: Number(review.reviewed_by_user_id) || null,
        originalDecision: String(review.decision_code || ''),
        auditOutcome: safeOutcome,
        auditNotes: safeNotes
      },
      changes: []
    });

    await connection.commit();
    return await getReviewForAudit(safeQcCheckId, connection);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  VALID_OUTCOMES,
  getReviewForAudit,
  isQcReviewerAuditSchemaReady,
  outcomeLabel,
  recordReviewerAudit
};
