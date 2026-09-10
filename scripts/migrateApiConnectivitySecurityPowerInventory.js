'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const COLUMNS = Object.freeze([
  ['wifi_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['wifi_technology', 'VARCHAR(120) NULL'],
  ['wifi_adapter_model', 'VARCHAR(255) NULL'],
  ['lte_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['lte_technology', 'VARCHAR(120) NULL'],
  ['lte_module_model', 'VARCHAR(255) NULL'],
  ['lte_imei', 'VARCHAR(32) NULL'],
  ['secure_boot_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['tpm_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['tpm_version', 'VARCHAR(32) NULL'],
  ['tpm_enabled_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['tpm_activated_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['keyboard_backlight_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['ac_adapter_wattage', 'INT UNSIGNED NULL'],
  ['bios_adapter_warning_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['bios_adapter_warning_message', 'VARCHAR(1000) NULL']
]);

async function columnSet(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'`
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const columns = await columnSet(connection);
    const missing = COLUMNS.filter(([name]) => !columns.has(name));
    const [specCount] = await connection.query('SELECT COUNT(*) AS total FROM unit_specifications');

    console.log('\nStage 10W79H Connectivity, Security & Power preflight');
    console.log(`Unit Specifications rows: ${Number(specCount[0]?.total || 0)}`);
    console.log(`Tool-only columns present: ${COLUMNS.length - missing.length}/${COLUMNS.length}`);
    if (!missing.length) {
      console.log('\nNo schema operations are pending.');
      console.log('No database changes were made.');
      return;
    }

    console.log('\nPending additive columns:');
    missing.forEach(([name]) => console.log(`- unit_specifications.${name}`));
    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply to install these additive columns.');
      return;
    }

    for (const [name, ddl] of missing) {
      await connection.query(`ALTER TABLE unit_specifications ADD COLUMN ${name} ${ddl}`);
    }
    console.log('\nStage 10W79H Connectivity, Security & Power schema applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
