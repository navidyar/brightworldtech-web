'use strict';

const { pool } = require('./db');

const ASSIGNMENT_HISTORY_COLUMNS = new Set([
  'unit_assignment_history_id',
  'unit_id',
  'to_user_id',
  'changed_at'
]);

async function getQcTechnicianAttributionCapabilities(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (
          (TABLE_NAME = 'units' AND COLUMN_NAME = 'assigned_to_user_id')
          OR TABLE_NAME = 'unit_assignment_history'
        )
    `
  );

  const unitColumns = new Set();
  const assignmentHistoryColumns = new Set();

  rows.forEach((row) => {
    const tableName = String(row.table_name || '');
    const columnName = String(row.column_name || '');

    if (tableName === 'units') unitColumns.add(columnName);
    if (tableName === 'unit_assignment_history') assignmentHistoryColumns.add(columnName);
  });

  return {
    hasCurrentAssignment: unitColumns.has('assigned_to_user_id'),
    hasAssignmentHistory: [...ASSIGNMENT_HISTORY_COLUMNS]
      .every((columnName) => assignmentHistoryColumns.has(columnName))
  };
}

module.exports = {
  ASSIGNMENT_HISTORY_COLUMNS,
  getQcTechnicianAttributionCapabilities
};
