'use strict';
require('dotenv').config();

const { pool } = require('../models/db');
const { DEFAULT_HUDDLE_ARCHIVE_DAYS, MIN_HUDDLE_ARCHIVE_DAYS, MAX_HUDDLE_ARCHIVE_DAYS } = require('../models/applicationSettingsModel');

const APPLY = process.argv.includes('--apply');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function inspect(connection) {
  const [[tableRow]] = await connection.query(
    `SELECT 1 AS present
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'application_settings'
     LIMIT 1`
  );
  if (!tableRow) return { tableExists: false, columnExists: false, row: null };

  const hasColumn = await columnExists(connection, 'application_settings', 'huddle_archive_days');
  let row = null;
  if (hasColumn) {
    const [rows] = await connection.query(
      `SELECT application_settings_id, huddle_archive_days
       FROM application_settings
       WHERE application_settings_id = 1
       LIMIT 1`
    );
    row = rows[0] || null;
  }
  return { tableExists: true, columnExists: hasColumn, row };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`Virtual Huddle retention setting (${APPLY ? 'apply' : 'audit'})`);
    console.log(`application_settings table: ${before.tableExists ? 'present' : 'missing'}`);
    console.log(`huddle_archive_days column: ${before.columnExists ? 'present' : 'missing'}`);
    console.log(`Default archive interval: ${DEFAULT_HUDDLE_ARCHIVE_DAYS} days`);

    if (!before.tableExists) throw new Error('application_settings is missing. Run migrate:application-timezone first.');
    if (before.row) {
      const value = Number(before.row.huddle_archive_days);
      if (!Number.isInteger(value) || value < MIN_HUDDLE_ARCHIVE_DAYS || value > MAX_HUDDLE_ARCHIVE_DAYS) {
        throw new Error(`Stored Huddle archive interval is outside ${MIN_HUDDLE_ARCHIVE_DAYS}-${MAX_HUDDLE_ARCHIVE_DAYS} days.`);
      }
      console.log(`Current archive interval: ${value} days`);
    }

    if (!APPLY) return;

    if (!before.columnExists) {
      await connection.query(
        `ALTER TABLE application_settings
         ADD COLUMN huddle_archive_days SMALLINT UNSIGNED NOT NULL DEFAULT ${DEFAULT_HUDDLE_ARCHIVE_DAYS}
         AFTER default_time_zone`
      );
    }

    await connection.query(
      `UPDATE application_settings
       SET huddle_archive_days = ?
       WHERE application_settings_id = 1
         AND (huddle_archive_days < ? OR huddle_archive_days > ?)`,
      [DEFAULT_HUDDLE_ARCHIVE_DAYS, MIN_HUDDLE_ARCHIVE_DAYS, MAX_HUDDLE_ARCHIVE_DAYS]
    );

    const after = await inspect(connection);
    const value = Number(after.row?.huddle_archive_days);
    if (!after.columnExists || !after.row || !Number.isInteger(value)
      || value < MIN_HUDDLE_ARCHIVE_DAYS || value > MAX_HUDDLE_ARCHIVE_DAYS) {
      throw new Error('Virtual Huddle retention setting verification failed.');
    }
    console.log(`Current archive interval: ${value} days`);
    console.log('Virtual Huddle retention setting applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
