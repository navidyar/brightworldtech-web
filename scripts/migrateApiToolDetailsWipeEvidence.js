'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const TABLE_NAME = 'unit_storage_wipe_certificates';
const REQUIRED_COLUMNS = [
  'unit_storage_wipe_certificate_id', 'unit_id', 'unit_storage_device_id', 'certificate_id',
  'recorded_by_user_id', 'tool_source', 'certificate_status', 'started_at', 'completed_at',
  'machine_serial', 'machine_uuid', 'drive_model', 'drive_serial', 'drive_size_bytes',
  'drive_interface', 'drive_media_type', 'wipe_method', 'wipe_result', 'verification_statement',
  'evidence_hash', 'created_at'
];

async function getTableState(connection) {
  const [tables] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE_NAME]
  );
  if (Number(tables[0]?.row_count || 0) !== 1) {
    return { exists: false, missingColumns: [...REQUIRED_COLUMNS], rowCount: 0 };
  }
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE_NAME]
  );
  const names = new Set(columns.map((row) => String(row.column_name || row.COLUMN_NAME)));
  const [[count]] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${TABLE_NAME}`);
  return {
    exists: true,
    missingColumns: REQUIRED_COLUMNS.filter((column) => !names.has(column)),
    rowCount: Number(count?.row_count || 0)
  };
}

async function assertPrerequisites(connection) {
  for (const tableName of ['units', 'unit_storage_devices', 'users']) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS row_count FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    if (Number(rows[0]?.row_count || 0) !== 1) throw new Error(`Required table is missing: ${tableName}`);
  }
}

async function createTable(connection) {
  await connection.query(`
    CREATE TABLE ${TABLE_NAME} (
      unit_storage_wipe_certificate_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id BIGINT NOT NULL,
      unit_storage_device_id BIGINT UNSIGNED NULL,
      certificate_id VARCHAR(191) NOT NULL,
      recorded_by_user_id INT NOT NULL,
      tool_source VARCHAR(32) NOT NULL DEFAULT 'scantool',
      certificate_status VARCHAR(80) NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      machine_serial VARCHAR(191) NULL,
      machine_uuid VARCHAR(64) NULL,
      drive_model VARCHAR(255) NULL,
      drive_serial VARCHAR(191) NULL,
      drive_size_bytes BIGINT UNSIGNED NULL,
      drive_interface VARCHAR(80) NULL,
      drive_media_type VARCHAR(80) NULL,
      wipe_method VARCHAR(191) NULL,
      wipe_result VARCHAR(120) NULL,
      verification_statement VARCHAR(1000) NULL,
      evidence_hash CHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (unit_storage_wipe_certificate_id),
      UNIQUE KEY uq_unit_storage_wipe_certificate_id (certificate_id),
      KEY idx_unit_storage_wipe_unit (unit_id, created_at),
      KEY idx_unit_storage_wipe_device (unit_storage_device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    await assertPrerequisites(connection);
    const before = await getTableState(connection);
    console.log('\nStage 10W79J Tool Details & Secure-Wipe Evidence preflight');
    console.log(`Secure-wipe evidence table: ${before.exists ? 'present' : 'not installed'}`);
    console.log(`Secure-wipe certificate rows: ${before.rowCount}`);
    if (before.exists && before.missingColumns.length > 0) {
      throw new Error(`Existing ${TABLE_NAME} table is incompatible; missing columns: ${before.missingColumns.join(', ')}`);
    }
    if (!before.exists) console.log(`Pending schema operation:\n- create_table: ${TABLE_NAME}`);
    else console.log('No schema operations are pending.');

    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply to install the append-only evidence table.');
      return;
    }
    if (!before.exists) await createTable(connection);
    const after = await getTableState(connection);
    if (!after.exists || after.missingColumns.length > 0) throw new Error('Secure-wipe evidence table verification failed.');
    console.log('\nStage 10W79J Tool Details & Secure-Wipe Evidence schema applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
