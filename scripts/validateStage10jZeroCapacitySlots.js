'use strict';

const { pool } = require('../models/db');

async function main() {
  try {
    const [[readiness]] = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)
          FROM information_schema.TABLE_CONSTRAINTS tc
          INNER JOIN information_schema.CHECK_CONSTRAINTS cc
            ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
           AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
            AND tc.CONSTRAINT_NAME IN (
              'chk_units_previous_ram_gb',
              'chk_units_ram_gb',
              'chk_units_previous_storage_gb',
              'chk_units_storage_gb',
              'chk_unit_memory_modules_size',
              'chk_unit_storage_devices_size',
              'chk_unit_previous_memory_modules_size',
              'chk_unit_previous_storage_devices_size'
            )
            AND tc.CONSTRAINT_TYPE = 'CHECK'
            AND REPLACE(REPLACE(LOWER(cc.CHECK_CLAUSE), ' ', ''), CHAR(96), '') LIKE '%>=0%'
        ) AS nonnegative_capacity_checks,
        (
          SELECT COUNT(*)
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('unit_memory_modules', 'unit_previous_memory_modules')
            AND COLUMN_NAME = 'memory_install_type_code'
            AND IS_NULLABLE = 'YES'
        ) AS nullable_install_columns
    `);

    if (Number(readiness.nonnegative_capacity_checks || 0) !== 8) {
      throw new Error('Stage 10J database readiness is missing one or more non-negative capacity checks.');
    }

    if (Number(readiness.nullable_install_columns || 0) !== 2) {
      throw new Error('Stage 10J database readiness requires nullable install type on both memory tables.');
    }

    const [[counts]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM unit_memory_modules WHERE size_gb = 0) AS current_memory_zero_rows,
        (SELECT COUNT(*) FROM unit_storage_devices WHERE size_gb = 0) AS current_storage_zero_rows,
        (SELECT COUNT(*) FROM unit_previous_memory_modules WHERE size_gb = 0) AS previous_memory_zero_rows,
        (SELECT COUNT(*) FROM unit_previous_storage_devices WHERE size_gb = 0) AS previous_storage_zero_rows
    `);

    console.log(
      'Stage 10J zero-capacity slots valid: '
      + `${Number(counts.current_memory_zero_rows || 0)} current memory, `
      + `${Number(counts.current_storage_zero_rows || 0)} current storage, `
      + `${Number(counts.previous_memory_zero_rows || 0)} previous memory, `
      + `${Number(counts.previous_storage_zero_rows || 0)} previous storage zero row(s).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
