'use strict';
require('dotenv').config();
const { pool } = require('../models/db');

const REQUIRED_COLUMNS = [
  'unit_qc_check_id',
  'unit_id',
  'unit_work_completion_id',
  'reviewed_by_user_id',
  'decision_code',
  'review_notes',
  'reviewed_at'
];

const REQUIRED_INDEXES = [
  'PRIMARY',
  'idx_unit_qc_checks_unit_latest',
  'idx_unit_qc_checks_completion_latest',
  'idx_unit_qc_checks_reviewer_time',
  'idx_unit_qc_checks_decision_time'
];

const REQUIRED_FOREIGN_KEYS = [
  'fk_unit_qc_checks_unit',
  'fk_unit_qc_checks_completion',
  'fk_unit_qc_checks_reviewer'
];

const EXPECTED_TYPE_PAIRS = [
  ['unit_id', 'units', 'unit_id'],
  ['unit_work_completion_id', 'unit_work_completions', 'unit_work_completion_id'],
  ['reviewed_by_user_id', 'users', 'user_id']
];

function normalizeType(value) {
  return String(value || '').trim().toLowerCase();
}

async function main() {
  const [[role]] = await pool.query("SELECT name, is_active FROM roles WHERE code = 'qc' LIMIT 1");
  if (!role || Number(role.is_active) !== 1 || String(role.name || '') !== 'Quality Control') {
    throw new Error('The Quality Control role label is not configured correctly.');
  }

  const [columns] = await pool.query(`
    SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
  `);
  const columnsByName = new Map(columns.map((row) => [row.column_name, row]));
  REQUIRED_COLUMNS.forEach((name) => {
    if (!columnsByName.has(name)) throw new Error(`unit_qc_checks.${name} is missing.`);
  });

  const [indexes] = await pool.query(`
    SELECT DISTINCT INDEX_NAME AS index_name
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
  `);
  const indexNames = new Set(indexes.map((row) => row.index_name));
  REQUIRED_INDEXES.forEach((name) => {
    if (!indexNames.has(name)) throw new Error(`unit_qc_checks index ${name} is missing.`);
  });

  const [foreignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME AS constraint_name
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
  `);
  const foreignKeyNames = new Set(foreignKeys.map((row) => row.constraint_name));
  REQUIRED_FOREIGN_KEYS.forEach((name) => {
    if (!foreignKeyNames.has(name)) throw new Error(`unit_qc_checks foreign key ${name} is missing.`);
  });

  for (const [childColumnName, parentTableName, parentColumnName] of EXPECTED_TYPE_PAIRS) {
    const [[parentColumn]] = await pool.query(`
      SELECT COLUMN_TYPE AS column_type
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `, [parentTableName, parentColumnName]);

    if (!parentColumn) {
      throw new Error(`${parentTableName}.${parentColumnName} is missing.`);
    }

    const childType = normalizeType(columnsByName.get(childColumnName).column_type);
    const parentType = normalizeType(parentColumn.column_type);
    if (childType !== parentType) {
      throw new Error(
        `unit_qc_checks.${childColumnName} type ${childType || '(missing)'} does not match `
        + `${parentTableName}.${parentColumnName} type ${parentType || '(missing)'}.`
      );
    }
  }

  const [[countRow]] = await pool.query('SELECT COUNT(*) AS review_count FROM unit_qc_checks');
  console.log(`Stage 9B QC review workflow valid: ${Number(countRow.review_count || 0)} review record(s).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(async () => pool.end());
