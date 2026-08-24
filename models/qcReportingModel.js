'use strict';

const { pool } = require('./db');
const unitQcCheckModel = require('./unitQcCheckModel');
const unitQcCorrectionModel = require('./unitQcCorrectionModel');
const { getQcTechnicianAttributionCapabilities } = require('./qcTechnicianAttributionModel');
const { buildQcTechnicianAttributionSql } = require('../services/qcTechnicianAttribution');

function normalizePositiveIntegerList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((left, right) => left - right);
}

function buildManagementQcReportingFilters(filters = {}, technicianExpression) {
  const clauses = [];
  const params = [];
  const startAt = String(filters.startAt || '').trim();
  const endAt = String(filters.endAt || '').trim();
  const technicianUserIds = normalizePositiveIntegerList(filters.technicianUserIds);

  if (startAt) {
    clauses.push('completion.completed_at >= ?');
    params.push(startAt);
  }

  if (endAt) {
    clauses.push('completion.completed_at < ?');
    params.push(endAt);
  }

  if (technicianUserIds.length > 0) {
    clauses.push(`${technicianExpression} IN (${technicianUserIds.map(() => '?').join(', ')})`);
    params.push(...technicianUserIds);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join('\n      AND ')}` : '',
    params
  };
}

function buildManagementQcReportingQuery({
  correctionSchemaIsReady = false,
  technicianAttributionCapabilities = {},
  filters = {}
} = {}) {
  const technicianAttribution = buildQcTechnicianAttributionSql({
    capabilities: technicianAttributionCapabilities,
    unitAlias: 'reporting_attribution_unit',
    assignmentAlias: 'reporting_attribution_assignment'
  });
  const reportingFilters = buildManagementQcReportingFilters(
    filters,
    technicianAttribution.expression
  );

  return {
    sql: `
      SELECT
        ${technicianAttribution.expression} AS technician_user_id,
        technician.first_name AS technician_first_name,
        technician.last_name AS technician_last_name,
        technician.email AS technician_email,
        completion.unit_work_completion_id,
        completion.unit_id,
        completion.completed_at,
        qc.unit_qc_check_id,
        qc.decision_code,
        qc.review_notes,
        qc.reviewed_at,
        qc.reviewed_by_user_id AS reviewer_user_id,
        reviewer.first_name AS reviewer_first_name,
        reviewer.last_name AS reviewer_last_name,
        reviewer.email AS reviewer_email,
        ${correctionSchemaIsReady ? 'CASE WHEN correction.unit_qc_correction_id IS NULL THEN 0 ELSE 1 END' : '0'} AS has_correction_submission
      FROM unit_qc_checks qc
      INNER JOIN unit_work_completions completion
        ON completion.unit_work_completion_id = qc.unit_work_completion_id
       AND completion.unit_id = qc.unit_id
       AND completion.credit_source = 'manual_completion'
       AND completion.reversed_at IS NULL
      ${technicianAttribution.joins}
      LEFT JOIN users technician
        ON technician.user_id = ${technicianAttribution.expression}
      LEFT JOIN users reviewer
        ON reviewer.user_id = qc.reviewed_by_user_id
      ${correctionSchemaIsReady ? `LEFT JOIN unit_qc_corrections correction
        ON correction.rejected_qc_check_id = qc.unit_qc_check_id` : ''}
      ${reportingFilters.whereSql || 'WHERE 1 = 1'}
        AND qc.reverted_at IS NULL
      ORDER BY qc.unit_qc_check_id
    `,
    params: reportingFilters.params
  };
}

function buildManagementQcReportingTechnicianOptionsQuery({
  technicianAttributionCapabilities = {}
} = {}) {
  const technicianAttribution = buildQcTechnicianAttributionSql({
    capabilities: technicianAttributionCapabilities,
    unitAlias: 'reporting_option_unit',
    assignmentAlias: 'reporting_option_assignment'
  });

  return `
    SELECT DISTINCT
      ${technicianAttribution.expression} AS technician_user_id,
      technician.first_name,
      technician.last_name,
      technician.email
    FROM unit_qc_checks qc
    INNER JOIN unit_work_completions completion
      ON completion.unit_work_completion_id = qc.unit_work_completion_id
     AND completion.unit_id = qc.unit_id
     AND completion.credit_source = 'manual_completion'
     AND completion.reversed_at IS NULL
    ${technicianAttribution.joins}
    LEFT JOIN users technician
      ON technician.user_id = ${technicianAttribution.expression}
    WHERE ${technicianAttribution.expression} IS NOT NULL
      AND qc.reverted_at IS NULL
    ORDER BY technician.last_name, technician.first_name, technician.email, technician_user_id
  `;
}

function normalizeTechnicianOption(row = {}) {
  const userId = Number(row.technician_user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;

  const fullName = [row.first_name, row.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return {
    userId,
    label: fullName || String(row.email || '').trim() || `Technician #${userId}`
  };
}

async function assertQcReportingStorageReady(connection = pool) {
  if (!await unitQcCheckModel.isQcCheckSchemaReady(connection)) {
    const error = new Error('QC reporting storage is not ready. Run and validate the Stage 9B migration.');
    error.code = 'BWT_QC_REPORTING_SCHEMA_REQUIRED';
    throw error;
  }
}

async function listManagementQcReportingTechnicianOptions(connection = pool) {
  await assertQcReportingStorageReady(connection);
  const technicianAttributionCapabilities = await getQcTechnicianAttributionCapabilities(connection);
  const [rows] = await connection.query(buildManagementQcReportingTechnicianOptionsQuery({
    technicianAttributionCapabilities
  }));

  return rows.map(normalizeTechnicianOption).filter(Boolean);
}

async function listManagementQcReportingRows(filters = {}, connection = pool) {
  await assertQcReportingStorageReady(connection);

  const [correctionSchemaIsReady, technicianAttributionCapabilities] = await Promise.all([
    unitQcCorrectionModel.isQcCorrectionSchemaReady(connection),
    getQcTechnicianAttributionCapabilities(connection)
  ]);
  const query = buildManagementQcReportingQuery({
    correctionSchemaIsReady,
    technicianAttributionCapabilities,
    filters
  });
  const [rows] = await connection.query(query.sql, query.params);
  return rows;
}

module.exports = {
  buildManagementQcReportingFilters,
  buildManagementQcReportingQuery,
  buildManagementQcReportingTechnicianOptionsQuery,
  listManagementQcReportingRows,
  listManagementQcReportingTechnicianOptions,
  normalizeTechnicianOption
};
