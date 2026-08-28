'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const CHECK_NAME = 'chk_lots_qc_required';

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) === 1;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function getCheckConstraint(connection) {
  const [rows] = await connection.query(
    `SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, cc.CHECK_CLAUSE
     FROM information_schema.TABLE_CONSTRAINTS tc
     LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
       AND tc.TABLE_NAME = 'lots'
       AND tc.CONSTRAINT_NAME = ?
     LIMIT 1`,
    [CHECK_NAME]
  );

  if (rows[0] && rows[0].CONSTRAINT_TYPE !== 'CHECK') {
    throw new Error(`${CHECK_NAME} exists but is not a CHECK constraint.`);
  }

  return rows[0] || null;
}

async function inspect(connection) {
  if (!(await tableExists(connection, 'lots'))) {
    throw new Error('Lot QC requirement migration requires the existing lots table.');
  }

  const column = await getColumn(connection, 'lots', 'qc_required');
  if (column && (
    !['tinyint', 'boolean'].includes(String(column.DATA_TYPE || '').toLowerCase())
    || String(column.IS_NULLABLE || '').toUpperCase() !== 'NO'
  )) {
    throw new Error('Existing lots.qc_required is incompatible. Expected a NOT NULL TINYINT/BOOLEAN column; refusing destructive replacement.');
  }

  let requiredCount = null;
  let notRequiredCount = null;
  let invalidCount = 0;
  if (column) {
    const [rows] = await connection.query(
      `SELECT
         SUM(CASE WHEN qc_required = 1 THEN 1 ELSE 0 END) AS required_count,
         SUM(CASE WHEN qc_required = 0 THEN 1 ELSE 0 END) AS not_required_count,
         SUM(CASE WHEN qc_required NOT IN (0, 1) THEN 1 ELSE 0 END) AS invalid_count
       FROM lots`
    );
    requiredCount = Number(rows[0]?.required_count || 0);
    notRequiredCount = Number(rows[0]?.not_required_count || 0);
    invalidCount = Number(rows[0]?.invalid_count || 0);
  }

  if (invalidCount > 0) {
    throw new Error(`${invalidCount} Lot row(s) contain an invalid qc_required value.`);
  }

  const [[summary]] = await connection.query('SELECT COUNT(*) AS lot_count FROM lots');
  return {
    column,
    checkConstraint: column ? await getCheckConstraint(connection) : null,
    lotCount: Number(summary?.lot_count || 0),
    requiredCount,
    notRequiredCount
  };
}

function printReport(state, mode) {
  console.log(`\nLot QC requirement migration (${mode})`);
  console.log(`Lots: ${state.lotCount}`);
  console.log(`qc_required column: ${state.column ? 'present' : 'missing'}`);
  if (state.column) {
    console.log(`QC required: ${state.requiredCount}`);
    console.log(`QC not required: ${state.notRequiredCount}`);
    console.log(`Check constraint: ${state.checkConstraint ? 'present' : 'missing'}`);
  } else {
    console.log('Planned initialization: all existing Lots -> QC required.');
  }
}

async function applyMigration(connection, initialState) {
  if (!initialState.column) {
    await connection.query(
      `ALTER TABLE lots
         ADD COLUMN qc_required TINYINT(1) NOT NULL DEFAULT 1`
    );
  }

  const column = await getColumn(connection, 'lots', 'qc_required');
  const defaultValue = column?.COLUMN_DEFAULT;
  if (defaultValue === null || Number(defaultValue) !== 1) {
    await connection.query(
      `ALTER TABLE lots
         MODIFY COLUMN qc_required TINYINT(1) NOT NULL DEFAULT 1`
    );
  }

  const checkConstraint = await getCheckConstraint(connection);
  if (!checkConstraint) {
    await connection.query(
      `ALTER TABLE lots
         ADD CONSTRAINT ${CHECK_NAME} CHECK (qc_required IN (0, 1))`
    );
  }

  return inspect(connection);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const initialState = await inspect(connection);
    printReport(initialState, APPLY ? 'preflight' : 'dry-run');
    if (!APPLY) return;

    const finalState = await applyMigration(connection, initialState);
    console.log('\nLot QC requirement migration completed successfully.');
    printReport(finalState, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
