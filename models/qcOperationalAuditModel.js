'use strict';

const { pool } = require('./db');
const unitQcCheckModel = require('./unitQcCheckModel');
const unitQcCorrectionModel = require('./unitQcCorrectionModel');
const qcGradingModel = require('./qcGradingModel');
const qcReportingModel = require('./qcReportingModel');
const { calculateQcGradeSummary } = require('../services/qcGradingService');
const { buildManagementQcReport } = require('../services/qcReportingService');
const {
  buildQcOperationalAudit,
  inspectQcReviewSequences
} = require('../services/qcOperationalAuditService');

const RECONCILIATION_FIELDS = Object.freeze([
  'reviewedUnits',
  'reviewActions',
  'firstPassAcceptedUnits',
  'firstPassRejectedUnits',
  'currentlyAcceptedUnits',
  'pendingCorrectionUnits',
  'readyForRecheckUnits',
  'rejectedUnits',
  'correctedUnits',
  'repeatedReviewUnits'
]);

function summariesMatch(left = {}, right = {}) {
  return RECONCILIATION_FIELDS.every((fieldName) => (
    Number(left[fieldName] || 0) === Number(right[fieldName] || 0)
  )) && ['qualityGrade', 'currentAcceptanceRate', 'correctionResolutionRate']
    .every((fieldName) => (
      (left[fieldName] === null && right[fieldName] === null)
      || Number(left[fieldName]) === Number(right[fieldName])
    ));
}

async function getQcRole(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT code, name, is_active
      FROM roles
      WHERE code = 'qc'
      LIMIT 1
    `
  );
  return rows[0] || {};
}

async function getQcIntegrityCounts(connection = pool) {
  const [[reviewCounts]] = await connection.query(
    `
      SELECT
        COUNT(*) AS review_rows,
        COALESCE(SUM(CASE WHEN qc.unit_id <> completion.unit_id THEN 1 ELSE 0 END), 0) AS review_unit_mismatches,
        COALESCE(SUM(CASE WHEN completion.credit_source <> 'manual_completion' THEN 1 ELSE 0 END), 0) AS non_manual_completion_reviews,
        COALESCE(SUM(CASE WHEN completion.reversed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS reversed_completion_reviews
      FROM unit_qc_checks qc
      INNER JOIN unit_work_completions completion
        ON completion.unit_work_completion_id = qc.unit_work_completion_id
    `
  );

  const [[correctionCounts]] = await connection.query(
    `
      SELECT
        COUNT(*) AS correction_rows,
        COALESCE(SUM(CASE WHEN rejected.decision_code <> 'rejected' THEN 1 ELSE 0 END), 0) AS correction_decision_mismatches,
        COALESCE(SUM(CASE
          WHEN correction.unit_id <> rejected.unit_id
            OR correction.unit_work_completion_id <> rejected.unit_work_completion_id
          THEN 1 ELSE 0 END), 0) AS correction_unit_mismatches,
        COALESCE(SUM(CASE WHEN correction.submitted_at < rejected.reviewed_at THEN 1 ELSE 0 END), 0) AS correction_before_rejection
      FROM unit_qc_corrections correction
      INNER JOIN unit_qc_checks rejected
        ON rejected.unit_qc_check_id = correction.rejected_qc_check_id
    `
  );

  return {
    reviewRows: Number(reviewCounts.review_rows || 0),
    reviewUnitMismatches: Number(reviewCounts.review_unit_mismatches || 0),
    nonManualCompletionReviews: Number(reviewCounts.non_manual_completion_reviews || 0),
    reversedCompletionReviews: Number(reviewCounts.reversed_completion_reviews || 0),
    correctionRows: Number(correctionCounts.correction_rows || 0),
    correctionDecisionMismatches: Number(correctionCounts.correction_decision_mismatches || 0),
    correctionUnitMismatches: Number(correctionCounts.correction_unit_mismatches || 0),
    correctionBeforeRejection: Number(correctionCounts.correction_before_rejection || 0)
  };
}

async function listQcSequenceRows(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        qc.unit_work_completion_id,
        qc.unit_qc_check_id,
        qc.decision_code,
        qc.reviewed_at,
        correction.unit_qc_correction_id,
        correction.submitted_at AS correction_submitted_at
      FROM unit_qc_checks qc
      LEFT JOIN unit_qc_corrections correction
        ON correction.rejected_qc_check_id = qc.unit_qc_check_id
      ORDER BY qc.unit_work_completion_id, qc.unit_qc_check_id
    `
  );
  return rows;
}

async function getQcHistoryCoverage(connection = pool) {
  const [[row]] = await connection.query(
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM unit_qc_checks qc
          WHERE NOT EXISTS (
            SELECT 1
            FROM unit_audit_events audit_event
            WHERE audit_event.unit_id = qc.unit_id
              AND audit_event.event_type IN ('unit_qc_accepted', 'unit_qc_rejected')
              AND CAST(JSON_UNQUOTE(JSON_EXTRACT(audit_event.event_metadata_json, '$.qcCheckId')) AS UNSIGNED)
                = qc.unit_qc_check_id
          )
        ) AS missing_review_audit_events,
        (
          SELECT COUNT(*)
          FROM unit_qc_corrections correction
          WHERE NOT EXISTS (
            SELECT 1
            FROM unit_audit_events audit_event
            WHERE audit_event.unit_id = correction.unit_id
              AND audit_event.event_type = 'unit_qc_correction_submitted'
              AND CAST(JSON_UNQUOTE(JSON_EXTRACT(audit_event.event_metadata_json, '$.qcCorrectionId')) AS UNSIGNED)
                = correction.unit_qc_correction_id
          )
        ) AS missing_correction_audit_events
    `
  );

  return {
    missingReviewAuditEvents: Number(row.missing_review_audit_events || 0),
    missingCorrectionAuditEvents: Number(row.missing_correction_audit_events || 0)
  };
}

async function getQcReportingReconciliation(connection = pool) {
  const [gradingRows, reportingRows] = await Promise.all([
    qcGradingModel.listQcReviewActions({}, connection),
    qcReportingModel.listManagementQcReportingRows({}, connection)
  ]);
  const gradingSummary = calculateQcGradeSummary(gradingRows);
  const report = buildManagementQcReport(reportingRows);

  return {
    reconciled: summariesMatch(gradingSummary, report.summary),
    reviewedTechnicians: report.reviewedTechnicians,
    reviewActions: report.summary.reviewActions,
    gradingSummary,
    reportingSummary: report.summary
  };
}

async function getQcOperationalAudit(connection = pool) {
  const [role, reviewSchemaReady, correctionSchemaReady] = await Promise.all([
    getQcRole(connection),
    unitQcCheckModel.isQcCheckSchemaReady(connection),
    unitQcCorrectionModel.isQcCorrectionSchemaReady(connection)
  ]);
  const storage = { reviewSchemaReady, correctionSchemaReady };

  if (!reviewSchemaReady || !correctionSchemaReady) {
    return {
      audit: buildQcOperationalAudit({
        role,
        storage,
        reporting: { reconciled: false }
      }),
      role,
      storage,
      integrity: {},
      history: {},
      sequences: inspectQcReviewSequences([]),
      reporting: { reconciled: false }
    };
  }

  const [integrity, sequenceRows, history, reporting] = await Promise.all([
    getQcIntegrityCounts(connection),
    listQcSequenceRows(connection),
    getQcHistoryCoverage(connection),
    getQcReportingReconciliation(connection)
  ]);
  const sequences = inspectQcReviewSequences(sequenceRows);
  const audit = buildQcOperationalAudit({
    role,
    storage,
    integrity,
    history,
    sequences,
    reporting
  });

  return {
    audit,
    role,
    storage,
    integrity,
    history,
    sequences,
    reporting
  };
}

module.exports = {
  RECONCILIATION_FIELDS,
  getQcHistoryCoverage,
  getQcIntegrityCounts,
  getQcOperationalAudit,
  getQcReportingReconciliation,
  getQcRole,
  listQcSequenceRows,
  summariesMatch
};
