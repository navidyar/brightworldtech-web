'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const COLUMNS = Object.freeze([
  ['battery_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['battery_health_percent_observed', 'DECIMAL(5,2) NULL'],
  ['camera_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"],
  ['fingerprint_hardware_state_code', "VARCHAR(24) NOT NULL DEFAULT 'unknown'"]
]);

async function columnSet(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'`
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.total || 0) === 1;
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const requiredTables = ['unit_specifications', 'unit_batteries', 'unit_cameras', 'unit_biometrics', 'unit_tool_observations'];
    const missingTables = [];
    for (const table of requiredTables) if (!(await tableExists(connection, table))) missingTables.push(table);
    if (missingTables.length) throw new Error(`Required tables are missing: ${missingTables.join(', ')}.`);

    const columns = await columnSet(connection);
    const missing = COLUMNS.filter(([name]) => !columns.has(name));
    const [specCount] = await connection.query('SELECT COUNT(*) AS total FROM unit_specifications');
    const [batteryCount] = await connection.query('SELECT COUNT(*) AS total FROM unit_batteries');
    const [cameraCount] = await connection.query('SELECT COUNT(*) AS total FROM unit_cameras');
    const [biometricCount] = await connection.query('SELECT COUNT(*) AS total FROM unit_biometrics');

    console.log('\nStage 10W79I Battery, Camera, Biometrics & TechTools Tests preflight');
    console.log(`Unit Specifications rows: ${Number(specCount[0]?.total || 0)}`);
    console.log(`Battery rows: ${Number(batteryCount[0]?.total || 0)}`);
    console.log(`Camera rows: ${Number(cameraCount[0]?.total || 0)}`);
    console.log(`Biometric rows: ${Number(biometricCount[0]?.total || 0)}`);
    console.log(`Tool-only summary columns present: ${COLUMNS.length - missing.length}/${COLUMNS.length}`);

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

    for (const [name, ddl] of missing) await connection.query(`ALTER TABLE unit_specifications ADD COLUMN ${name} ${ddl}`);
    console.log('\nStage 10W79I Battery, Camera, Biometrics & TechTools Tests schema applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
