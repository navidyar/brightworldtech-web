'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const TRIGGER_NAME = 'trg_memory_clear_stale_speed_before_update';
const REQUIRED_COLUMNS = [
  'unit_memory_module_id', 'unit_id', 'slot_label', 'size_gb',
  'ram_type_config_value_id', 'memory_install_type_code', 'speed_mhz'
];

async function assertSchema(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_memory_modules'`
  );
  const columns = new Set(rows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) throw new Error(`unit_memory_modules is missing required Stage 10W79E columns: ${missing.join(', ')}.`);

  const [sourceRows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_field_sources'`
  );
  const sourceColumns = new Set(sourceRows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
  for (const column of ['unit_id', 'field_key', 'source_code']) {
    if (!sourceColumns.has(column)) throw new Error(`unit_field_sources.${column} is required for Stage 10W79E.`);
  }
}

async function triggerExists(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = ?`,
    [TRIGGER_NAME]
  );
  return Number(row?.row_count || 0) === 1;
}

async function createTrigger(connection) {
  await connection.query(`
    CREATE TRIGGER ${TRIGGER_NAME}
    BEFORE UPDATE ON unit_memory_modules
    FOR EACH ROW
    BEGIN
      IF (
        NOT (NEW.size_gb <=> OLD.size_gb)
        OR NOT (NEW.ram_type_config_value_id <=> OLD.ram_type_config_value_id)
        OR NOT (NEW.memory_install_type_code <=> OLD.memory_install_type_code)
      ) AND (NEW.speed_mhz <=> OLD.speed_mhz) THEN
        SET NEW.speed_mhz = NULL;
      END IF;
    END
  `);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    await assertSchema(connection);
    const exists = await triggerExists(connection);
    const [[moduleRow]] = await connection.query('SELECT COUNT(*) AS row_count FROM unit_memory_modules');
    const [[manualRow]] = await connection.query(
      `SELECT COUNT(*) AS row_count
         FROM unit_field_sources
        WHERE field_key = 'memory_modules' AND source_code = 'tech_edit'`
    );

    console.log('\nStage 10W79E API Memory inventory preflight');
    console.log(`Current memory module rows: ${Number(moduleRow?.row_count || 0)}`);
    console.log(`Manual memory source markers: ${Number(manualRow?.row_count || 0)}`);
    console.log(`Stale-speed invalidation trigger: ${exists ? 'present' : 'not installed'}`);

    if (!APPLY) {
      console.log(exists ? '\nNo schema operations are pending.' : `\nPending schema operation:\n- create_trigger: ${TRIGGER_NAME}`);
      console.log('No database changes were made.');
      return;
    }

    if (!exists) await createTrigger(connection);
    if (!(await triggerExists(connection))) throw new Error('Stage 10W79E trigger verification failed after apply.');
    console.log('\nStage 10W79E API Memory inventory schema safeguard applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message || error);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
