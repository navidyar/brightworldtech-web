'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const {
  DEFAULT_RECENT_PRINTS_MINUTES,
  DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES,
  parseRecentPrintsMinutes,
  parsePrintSetGroupingGapMinutes
} = require('../services/labelPrintSettingsPolicy');

const APPLY = process.argv.includes('--apply');

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0]?.COLUMN_TYPE || null;
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function inspect(connection) {
  const blockingIssues = [];
  const operations = [];
  if (!await tableExists(connection, 'users')) blockingIssues.push('Missing required users table.');
  const userIdType = blockingIssues.length ? null : await getColumnType(connection, 'users', 'user_id');
  if (!userIdType) blockingIssues.push('Could not resolve users.user_id type.');

  const exists = blockingIssues.length === 0 && await tableExists(connection, 'label_print_settings');
  let row = null;
  if (!exists && blockingIssues.length === 0) {
    operations.push('create_label_print_settings');
  } else if (exists) {
    const columns = await getColumns(connection, 'label_print_settings');
    const required = ['label_print_settings_id', 'recent_prints_minutes', 'print_set_grouping_gap_minutes', 'updated_by_user_id', 'created_at', 'updated_at'];
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length) blockingIssues.push(`label_print_settings is missing required columns: ${missing.join(', ')}.`);
    if (!missing.length) {
      const [rows] = await connection.query(
        `SELECT label_print_settings_id, recent_prints_minutes, print_set_grouping_gap_minutes
         FROM label_print_settings WHERE label_print_settings_id = 1 LIMIT 1`
      );
      row = rows[0] || null;
      if (!row) operations.push('insert_default_label_print_settings');
      else {
        if (parseRecentPrintsMinutes(row.recent_prints_minutes) === null) operations.push('normalize_recent_prints_minutes');
        if (parsePrintSetGroupingGapMinutes(row.print_set_grouping_gap_minutes) === null) operations.push('normalize_grouping_gap_minutes');
      }
    }
  }
  return { blockingIssues, operations, exists, row, userIdType };
}

function printReport(state, mode) {
  console.log(`\nStage 10W86 Label Library Phase C3 settings (${mode})`);
  console.log(`Recent Prints default: ${DEFAULT_RECENT_PRINTS_MINUTES} minute(s)`);
  console.log(`Print Set grouping default: ${DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES} minute(s)`);
  console.log(`Settings table: ${state.exists ? 'present' : 'not installed'}`);
  if (state.row) {
    console.log(`Configured Recent Prints duration: ${state.row.recent_prints_minutes} minute(s)`);
    console.log(`Configured Print Set grouping gap: ${state.row.print_set_grouping_gap_minutes} minute(s)`);
  }
  if (state.blockingIssues.length) {
    console.log('\nBlocking issues:');
    state.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }
  if (state.operations.length) {
    console.log('\nPending operations:');
    state.operations.forEach((operation) => console.log(`- ${operation}`));
  } else if (!state.blockingIssues.length) {
    console.log('\nRecent Prints settings are installed and valid.');
  }
}

async function applyMigration(connection, state) {
  if (state.blockingIssues.length) throw new Error('Refusing to apply while blocking issues remain.');
  await connection.beginTransaction();
  try {
    if (!state.exists) {
      await connection.query(`CREATE TABLE label_print_settings (
        label_print_settings_id TINYINT UNSIGNED NOT NULL,
        recent_prints_minutes SMALLINT UNSIGNED NOT NULL DEFAULT ${DEFAULT_RECENT_PRINTS_MINUTES},
        print_set_grouping_gap_minutes SMALLINT UNSIGNED NOT NULL DEFAULT ${DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES},
        updated_by_user_id ${state.userIdType} NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (label_print_settings_id),
        CONSTRAINT fk_label_print_settings_updated_by FOREIGN KEY (updated_by_user_id)
          REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    await connection.query(
      `INSERT INTO label_print_settings
        (label_print_settings_id, recent_prints_minutes, print_set_grouping_gap_minutes)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE
         recent_prints_minutes = IF(recent_prints_minutes BETWEEN 1 AND 1440, recent_prints_minutes, VALUES(recent_prints_minutes)),
         print_set_grouping_gap_minutes = IF(print_set_grouping_gap_minutes BETWEEN 1 AND 60, print_set_grouping_gap_minutes, VALUES(print_set_grouping_gap_minutes))`,
      [DEFAULT_RECENT_PRINTS_MINUTES, DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const pre = await inspect(connection);
    printReport(pre, APPLY ? 'pre-apply' : 'dry-run');
    if (pre.blockingIssues.length) { process.exitCode = 1; return; }
    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
      return;
    }
    await applyMigration(connection, pre);
    const post = await inspect(connection);
    printReport(post, 'post-apply');
    if (post.blockingIssues.length || post.operations.length) throw new Error('Phase C3 settings verification failed after apply.');
    console.log('\nStage 10W86 Label Library Phase C3 settings applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
