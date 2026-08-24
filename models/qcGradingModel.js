'use strict';

const { pool } = require('./db');
const unitQcCheckModel = require('./unitQcCheckModel');
const unitQcCorrectionModel = require('./unitQcCorrectionModel');
const { getQcTechnicianAttributionCapabilities } = require('./qcTechnicianAttributionModel');
const { buildQcTechnicianAttributionSql } = require('../services/qcTechnicianAttribution');
const {
  assertValidQcGradeSummary,
  calculateQcGradeSummariesByTechnician,
  calculateQcGradeSummary
} = require('../services/qcGradingService');

function normalizePositiveIntegerList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function normalizeOptionalDateTime(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date and time.`);
  }
  return date;
}

function buildQcReviewActionQuery({
  technicianUserIds = [],
  startAt = null,
  endAt = null,
  correctionSchemaIsReady = false,
  technicianAttributionCapabilities = {}
} = {}) {
  const safeTechnicianUserIds = normalizePositiveIntegerList(technicianUserIds);
  const safeStartAt = normalizeOptionalDateTime(startAt, 'QC grading start');
  const safeEndAt = normalizeOptionalDateTime(endAt, 'QC grading end');

  if (safeStartAt && safeEndAt && safeStartAt >= safeEndAt) {
    throw new Error('QC grading end must be later than its start.');
  }

  const technicianAttribution = buildQcTechnicianAttributionSql({
    capabilities: technicianAttributionCapabilities
  });
  const whereParts = [
    "completion.credit_source = 'manual_completion'",
    'completion.reversed_at IS NULL',
    'qc.reverted_at IS NULL'
  ];
  const params = [];

  if (safeTechnicianUserIds.length > 0) {
    whereParts.push(`${technicianAttribution.expression} IN (${safeTechnicianUserIds.map(() => '?').join(', ')})`);
    params.push(...safeTechnicianUserIds);
  }

  if (safeStartAt) {
    whereParts.push('completion.completed_at >= ?');
    params.push(safeStartAt);
  }

  if (safeEndAt) {
    whereParts.push('completion.completed_at < ?');
    params.push(safeEndAt);
  }

  return {
    sql: `
      SELECT
        ${technicianAttribution.expression} AS technician_user_id,
        completion.unit_work_completion_id,
        completion.unit_id,
        completion.completed_at,
        qc.unit_qc_check_id,
        qc.decision_code,
        qc.reviewed_at,
        ${correctionSchemaIsReady ? 'CASE WHEN correction.unit_qc_correction_id IS NULL THEN 0 ELSE 1 END' : '0'} AS has_correction_submission
      FROM unit_qc_checks qc
      INNER JOIN unit_work_completions completion
        ON completion.unit_work_completion_id = qc.unit_work_completion_id
       AND completion.unit_id = qc.unit_id
      ${technicianAttribution.joins}
      ${correctionSchemaIsReady ? `LEFT JOIN unit_qc_corrections correction
        ON correction.rejected_qc_check_id = qc.unit_qc_check_id` : ''}
      WHERE ${whereParts.join('\n        AND ')}
      ORDER BY
        technician_user_id,
        completion.unit_work_completion_id,
        qc.unit_qc_check_id
    `,
    params,
    technicianUserIds: safeTechnicianUserIds,
    startAt: safeStartAt,
    endAt: safeEndAt
  };
}

async function listQcReviewActions(filters = {}, connection = pool) {
  if (!await unitQcCheckModel.isQcCheckSchemaReady(connection)) {
    const error = new Error('QC grading storage is not ready. Run and validate the Stage 9B migration.');
    error.code = 'BWT_QC_SCHEMA_REQUIRED';
    throw error;
  }

  const [correctionSchemaIsReady, technicianAttributionCapabilities] = await Promise.all([
    unitQcCorrectionModel.isQcCorrectionSchemaReady(connection),
    getQcTechnicianAttributionCapabilities(connection)
  ]);
  const query = buildQcReviewActionQuery({
    ...filters,
    correctionSchemaIsReady,
    technicianAttributionCapabilities
  });
  const [rows] = await connection.query(query.sql, query.params);
  return rows;
}

async function getQcGradingTechnician(technicianUserId, connection = pool) {
  const safeTechnicianUserId = normalizePositiveIntegerList([technicianUserId])[0];
  if (!safeTechnicianUserId) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT user_id, first_name, last_name, email
      FROM users
      WHERE user_id = ?
      LIMIT 1
    `,
    [safeTechnicianUserId]
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  const displayName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    || row.email
    || `User #${row.user_id}`;

  return {
    userId: Number(row.user_id),
    displayName
  };
}

async function getOverallQcGradeSummary(filters = {}, connection = pool) {
  const rows = await listQcReviewActions(filters, connection);
  const summary = calculateQcGradeSummary(rows);
  const technicianSummaries = calculateQcGradeSummariesByTechnician(rows);

  assertValidQcGradeSummary(summary);
  technicianSummaries.forEach(assertValidQcGradeSummary);

  return {
    summary,
    gradedTechnicians: technicianSummaries.filter((item) => item.reviewedUnits > 0).length
  };
}

async function getTechnicianQcGradeSummary(technicianUserId, filters = {}, connection = pool) {
  const safeTechnicianUserId = normalizePositiveIntegerList([technicianUserId])[0];
  if (!safeTechnicianUserId) {
    throw new Error('A valid technician user ID is required for QC grading.');
  }

  const rows = await listQcReviewActions({
    ...filters,
    technicianUserIds: [safeTechnicianUserId]
  }, connection);
  const summary = calculateQcGradeSummary(rows, { technicianUserId: safeTechnicianUserId });
  assertValidQcGradeSummary(summary);
  return summary;
}

async function listTechnicianQcGradeSummaries(filters = {}, connection = pool) {
  const rows = await listQcReviewActions(filters, connection);
  const technicianUserIds = normalizePositiveIntegerList(filters.technicianUserIds);
  const summaries = calculateQcGradeSummariesByTechnician(rows, technicianUserIds);
  summaries.forEach(assertValidQcGradeSummary);
  return summaries;
}

module.exports = {
  buildQcReviewActionQuery,
  getOverallQcGradeSummary,
  getQcGradingTechnician,
  getTechnicianQcGradeSummary,
  listQcReviewActions,
  listTechnicianQcGradeSummaries,
  normalizeOptionalDateTime,
  normalizePositiveIntegerList
};
