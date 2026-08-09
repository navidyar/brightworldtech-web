'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const checks = [
  {
    label: 'current memory',
    table: 'unit_memory_modules',
    currentClause: 'AND is_current = 1',
    predicates: [
      'speed_mhz IS NOT NULL',
      "NULLIF(TRIM(manufacturer_name), '') IS NOT NULL",
      "NULLIF(TRIM(part_number), '') IS NOT NULL",
      "NULLIF(TRIM(serial_number), '') IS NOT NULL",
      "NULLIF(TRIM(change_notes), '') IS NOT NULL"
    ]
  },
  {
    label: 'previous memory',
    table: 'unit_previous_memory_modules',
    currentClause: '',
    predicates: [
      'speed_mhz IS NOT NULL',
      "NULLIF(TRIM(manufacturer_name), '') IS NOT NULL",
      "NULLIF(TRIM(part_number), '') IS NOT NULL",
      "NULLIF(TRIM(serial_number), '') IS NOT NULL",
      "NULLIF(TRIM(change_notes), '') IS NOT NULL"
    ]
  },
  {
    label: 'current storage',
    table: 'unit_storage_devices',
    currentClause: 'AND is_current = 1',
    predicates: [
      "NULLIF(TRIM(manufacturer_name), '') IS NOT NULL",
      "NULLIF(TRIM(model_number), '') IS NOT NULL",
      "NULLIF(TRIM(serial_number), '') IS NOT NULL",
      "NULLIF(TRIM(firmware_version), '') IS NOT NULL",
      "NULLIF(TRIM(change_notes), '') IS NOT NULL"
    ]
  },
  {
    label: 'previous storage',
    table: 'unit_previous_storage_devices',
    currentClause: '',
    predicates: [
      "NULLIF(TRIM(manufacturer_name), '') IS NOT NULL",
      "NULLIF(TRIM(model_number), '') IS NOT NULL",
      "NULLIF(TRIM(serial_number), '') IS NOT NULL",
      "NULLIF(TRIM(firmware_version), '') IS NOT NULL",
      'wipe_status_config_value_id IS NOT NULL',
      "NULLIF(TRIM(change_notes), '') IS NOT NULL"
    ]
  }
];

async function tableExists(tableName) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(row.count || 0) === 1;
}

async function main() {
  const results = [];

  for (const check of checks) {
    if (!(await tableExists(check.table))) {
      throw new Error(`Required component table is missing: ${check.table}`);
    }

    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM \`${check.table}\`
        WHERE (${check.predicates.join(' OR ')})
          ${check.currentClause}`
    );
    results.push({ label: check.label, count: Number(row.count || 0) });
  }

  const total = results.reduce((sum, result) => sum + result.count, 0);
  console.log(
    `Stage 10T optional component detail inventory: ${total} row(s) contain preserved legacy detail `
      + `(${results.map((result) => `${result.label}: ${result.count}`).join(', ')}).`
  );
  console.log('These values are no longer posted as hidden form fields and remain preserved server-side during ordinary edits.');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error && error.message ? error.message : error);
    await pool.end();
    process.exit(1);
  });
