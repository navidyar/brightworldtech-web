'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const COLUMN_NAME = 'windows_display_version';
const COLUMN_DDL = 'VARCHAR(80) NULL';

async function getState(connection) {
  const [[specTable]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'`
  );
  if (Number(specTable?.row_count || 0) !== 1) {
    throw new Error('Required table is missing: unit_specifications');
  }

  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_specifications'
        AND COLUMN_NAME = ?`,
    [COLUMN_NAME]
  );
  const [[count]] = await connection.query('SELECT COUNT(*) AS row_count FROM unit_specifications');
  return {
    columnPresent: Number(column?.row_count || 0) === 1,
    specificationRows: Number(count?.row_count || 0)
  };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await getState(connection);
    console.log('\nStage 10W79K1 API Contract Completion preflight');
    console.log(`Unit Specifications rows: ${before.specificationRows}`);
    console.log(`Windows Release column: ${before.columnPresent ? 'present' : 'not installed'}`);

    if (!before.columnPresent) {
      console.log(`\nPending additive column:\n- unit_specifications.${COLUMN_NAME}`);
    } else {
      console.log('\nNo schema operations are pending.');
    }

    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply to install the additive column.');
      return;
    }

    if (!before.columnPresent) {
      await connection.query(`ALTER TABLE unit_specifications ADD COLUMN ${COLUMN_NAME} ${COLUMN_DDL}`);
    }

    const after = await getState(connection);
    if (!after.columnPresent) throw new Error('Windows Release column verification failed.');
    console.log('\nStage 10W79K1 API Contract Completion schema applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
