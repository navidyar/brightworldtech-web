'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const TABLE_NAME = 'unit_tool_observations';
const REQUIRED_COLUMNS = new Set([
  'unit_tool_observation_id',
  'tool_run_id',
  'unit_id',
  'field_key',
  'observation_state',
  'observed_value_json',
  'application_status',
  'application_reason',
  'previous_value_json',
  'created_at'
]);

async function tableState(connection) {
  const [tableRows] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE_NAME]
  );
  const exists = Number(tableRows[0]?.row_count || 0) === 1;
  if (!exists) return { exists: false, compatible: false, missingColumns: [...REQUIRED_COLUMNS], rowCount: 0 };

  const [columnRows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE_NAME]
  );
  const columns = new Set(columnRows.map((row) => String(row.column_name || row.COLUMN_NAME)));
  const missingColumns = [...REQUIRED_COLUMNS].filter((column) => !columns.has(column));
  const [[countRow]] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${TABLE_NAME}`);
  return {
    exists: true,
    compatible: missingColumns.length === 0,
    missingColumns,
    rowCount: Number(countRow?.row_count || 0)
  };
}

async function assertPrerequisites(connection) {
  const requiredColumns = {
    units: ['unit_id', 'processor_speed_ghz'],
    unit_specifications: ['unit_id', 'bios_version', 'os_build'],
    unit_field_sources: ['unit_id', 'field_key', 'source_code'],
    unit_tool_runs: [
      'tool_run_id', 'unit_id', 'tool_source', 'user_id', 'report_id',
      'report_schema', 'tool_version', 'collected_at', 'completed_at', 'status'
    ]
  };
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('units', 'unit_tool_runs', 'unit_field_sources', 'unit_specifications')`
  );
  const columnsByTable = new Map();
  for (const row of rows) {
    const tableName = String(row.table_name || row.TABLE_NAME || '');
    const columnName = String(row.column_name || row.COLUMN_NAME || '');
    if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, new Set());
    columnsByTable.get(tableName).add(columnName);
  }

  const missing = [];
  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const available = columnsByTable.get(tableName) || new Set();
    for (const columnName of columns) {
      if (!available.has(columnName)) missing.push(`${tableName}.${columnName}`);
    }
  }
  if (missing.length) throw new Error(`Missing Stage 10W79C prerequisite schema: ${missing.join(', ')}.`);
}

async function countUnitsMissingSpecifications(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM units u
       LEFT JOIN unit_specifications s ON s.unit_id = u.unit_id
      WHERE s.unit_id IS NULL`
  );
  return Number(row?.row_count || 0);
}

async function createTable(connection) {
  await connection.query(`
    CREATE TABLE unit_tool_observations (
      unit_tool_observation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tool_run_id BIGINT UNSIGNED NOT NULL,
      unit_id BIGINT NOT NULL,
      field_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      observation_state ENUM('known','confirmed_absent','unknown') NOT NULL,
      observed_value_json JSON NULL,
      application_status ENUM('applied','unchanged','blocked_manual','ignored_unknown') NOT NULL,
      application_reason VARCHAR(80) NOT NULL,
      previous_value_json JSON NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (unit_tool_observation_id),
      UNIQUE KEY uq_unit_tool_observations_run_field (tool_run_id, field_key),
      KEY idx_unit_tool_observations_unit_field (unit_id, field_key, unit_tool_observation_id),
      CONSTRAINT fk_unit_tool_observations_run
        FOREIGN KEY (tool_run_id) REFERENCES unit_tool_runs (tool_run_id) ON DELETE CASCADE,
      CONSTRAINT fk_unit_tool_observations_unit
        FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    await assertPrerequisites(connection);
    const before = await tableState(connection);
    const unitsMissingSpecifications = await countUnitsMissingSpecifications(connection);

    console.log('\nStage 10W79C API scalar inventory schema');
    console.log(`unit_tool_observations: ${before.exists ? 'present' : 'not installed'}`);
    if (before.exists) {
      console.log(`Compatible columns: ${before.compatible ? 'yes' : `no; missing ${before.missingColumns.join(', ')}`}`);
      console.log(`Existing observation rows: ${before.rowCount}`);
    }
    console.log(`Units missing unit_specifications rows: ${unitsMissingSpecifications}`);

    if (before.exists && !before.compatible) {
      throw new Error('An incompatible unit_tool_observations table already exists. No changes were made.');
    }

    if (!APPLY) {
      console.log(before.exists ? '\nNo schema operations are pending.' : '\nPending schema operation:\n- create_table: unit_tool_observations');
      console.log('No database changes were made.');
      return;
    }

    if (!before.exists) {
      await createTable(connection);
    }

    const after = await tableState(connection);
    if (!after.exists || !after.compatible) throw new Error('Stage 10W79C schema verification failed after apply.');
    console.log('\nStage 10W79C API scalar inventory schema applied successfully.');
    console.log(`Observation rows: ${after.rowCount}`);
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
