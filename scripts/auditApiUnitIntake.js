'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

async function tableExists(connection, tableName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(row?.row_count || 0) === 1;
}

async function columnInfo(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function hasSystemValue(connection, systemId) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM system_config_values
     WHERE system_config_value_id = ?`,
    [systemId]
  );
  return Number(row?.row_count || 0) > 0;
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const requiredTables = [
      'users',
      'lots',
      'units',
      'unit_identifiers',
      'unit_audit_events',
      'unit_audit_event_changes',
      'api_tool_sessions',
      'unit_tool_runs'
    ];
    const missingTables = [];

    for (const tableName of requiredTables) {
      if (!await tableExists(connection, tableName)) missingTables.push(tableName);
    }

    const requiredUnitColumns = [
      'unit_id',
      'asset_number',
      'lot_id',
      'created_by_user_id',
      'unit_category_config_value_id',
      'current_unit_status_config_value_id'
    ];
    const missingColumns = [];
    for (const columnName of requiredUnitColumns) {
      if (!await columnInfo(connection, 'units', columnName)) missingColumns.push(columnName);
    }

    const requiredSystemValues = [
      SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_ASSET_TAG,
      SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_UNIT_SERIAL,
      SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_BIOS_SERIAL,
      SYSTEM_CONFIG_VALUE_IDS.UNIT_STATUS_RECEIVED
    ];
    const missingSystemValues = [];
    for (const systemId of requiredSystemValues) {
      if (!await hasSystemValue(connection, systemId)) missingSystemValues.push(systemId);
    }

    const categoryColumn = await columnInfo(connection, 'units', 'unit_category_config_value_id');
    const categoryCanBeOmitted = Boolean(categoryColumn && (
      String(categoryColumn.IS_NULLABLE).toUpperCase() === 'YES'
      || categoryColumn.COLUMN_DEFAULT !== null
    ));

    console.log('\nStage 10W79B API Unit intake preflight');
    console.log(`Required tables: ${missingTables.length ? `missing ${missingTables.join(', ')}` : 'present'}`);
    console.log(`Required units columns: ${missingColumns.length ? `missing ${missingColumns.join(', ')}` : 'present'}`);
    console.log(`Required system config bindings: ${missingSystemValues.length ? `missing ${missingSystemValues.join(', ')}` : 'present'}`);
    console.log(`Unit Category may be omitted at database insert: ${categoryCanBeOmitted ? 'yes' : 'no (new Tool-created Units require unit_category_config_value_id as a processing prerequisite)'}`);

    if (missingTables.length || missingColumns.length || missingSystemValues.length) {
      throw new Error('Stage 10W79B prerequisites are incomplete. No database changes were made.');
    }

    console.log('\nStage 10W79B read-only preflight passed. No database changes were made.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message || error);
  try {
    await pool.end();
  } catch (_) {}
  process.exitCode = 1;
});
