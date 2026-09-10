'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const TRIGGER_NAME = 'trg_storage_clear_stale_details_before_update';
const REQUIRED_BASE_COLUMNS = [
  'unit_storage_device_id', 'unit_id', 'slot_label', 'size_gb',
  'storage_type_config_value_id', 'wipe_status_config_value_id', 'is_current',
  'model_number', 'serial_number', 'firmware_version'
];
const ADDITIVE_COLUMNS = Object.freeze({
  raw_size_bytes: 'BIGINT UNSIGNED NULL',
  storage_interface: 'VARCHAR(80) NULL',
  media_type: 'VARCHAR(80) NULL',
  health_status: 'VARCHAR(120) NULL',
  storage_install_type_code: "VARCHAR(40) NOT NULL DEFAULT 'unknown'"
});

async function loadColumns(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_storage_devices'`
  );
  return new Set(rows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
}

async function assertBaseSchema(connection, columns) {
  const missing = REQUIRED_BASE_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) {
    throw new Error(`unit_storage_devices is missing required Stage 10W79F columns: ${missing.join(', ')}.`);
  }
  const [sourceRows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_field_sources'`
  );
  const sourceColumns = new Set(sourceRows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
  for (const column of ['unit_id', 'field_key', 'source_code']) {
    if (!sourceColumns.has(column)) throw new Error(`unit_field_sources.${column} is required for Stage 10W79F.`);
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

async function main() {
  const connection = await pool.getConnection();
  try {
    let columns = await loadColumns(connection);
    await assertBaseSchema(connection, columns);
    let missingColumns = Object.keys(ADDITIVE_COLUMNS).filter((column) => !columns.has(column));
    const triggerPresent = await triggerExists(connection);
    const [[deviceRow]] = await connection.query(
      'SELECT COUNT(*) AS row_count FROM unit_storage_devices WHERE is_current = 1'
    );
    const [[manualRow]] = await connection.query(
      `SELECT COUNT(*) AS row_count
         FROM unit_field_sources
        WHERE field_key = 'storage_devices' AND source_code = 'tech_edit'`
    );

    console.log('\nStage 10W79F API Storage inventory preflight');
    console.log(`Current storage device rows: ${Number(deviceRow?.row_count || 0)}`);
    console.log(`Manual storage source markers: ${Number(manualRow?.row_count || 0)}`);
    console.log(`New tool-detail columns present: ${Object.keys(ADDITIVE_COLUMNS).length - missingColumns.length}/${Object.keys(ADDITIVE_COLUMNS).length}`);
    console.log(`Stale-storage invalidation trigger: ${triggerPresent ? 'present' : 'not installed'}`);

    if (!APPLY) {
      if (missingColumns.length) {
        console.log('\nPending additive columns:');
        for (const column of missingColumns) console.log(`- unit_storage_devices.${column}`);
      } else {
        console.log('\nNo additive column operations are pending.');
      }
      if (!triggerPresent) {
        console.log(`Root-only safeguard still required after column apply: ${TRIGGER_NAME}`);
      }
      console.log('No database changes were made.');
      return;
    }

    for (const column of missingColumns) {
      await connection.query(`ALTER TABLE unit_storage_devices ADD COLUMN ${column} ${ADDITIVE_COLUMNS[column]}`);
    }

    columns = await loadColumns(connection);
    missingColumns = Object.keys(ADDITIVE_COLUMNS).filter((column) => !columns.has(column));
    if (missingColumns.length) throw new Error(`Stage 10W79F column verification failed: ${missingColumns.join(', ')}.`);

    console.log('\nStage 10W79F additive Storage columns applied successfully.');
    if (!(await triggerExists(connection))) {
      console.log(`The root-only trigger ${TRIGGER_NAME} is still not installed; create it with the provided root command before live Storage writes.`);
    } else {
      console.log(`Stale-storage invalidation trigger verified: ${TRIGGER_NAME}`);
    }
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
