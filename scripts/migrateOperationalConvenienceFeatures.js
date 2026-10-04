'use strict';
require('dotenv').config();
const { pool } = require('../models/db');
const APPLY = process.argv.includes('--apply');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return Boolean(rows[0]);
}

async function planned(connection) {
  const changes = [];
  if (!await columnExists(connection, 'label_printers', 'alias_label')) changes.push('add label_printers.alias_label');
  if (!await columnExists(connection, 'users', 'tool_pin_hash')) changes.push('add users.tool_pin_hash');
  if (!await columnExists(connection, 'users', 'tool_pin_updated_at')) changes.push('add users.tool_pin_updated_at');
  if (!await columnExists(connection, 'users', 'tool_pin_failed_count')) changes.push('add users.tool_pin_failed_count');
  if (!await columnExists(connection, 'users', 'tool_pin_locked_until')) changes.push('add users.tool_pin_locked_until');
  return changes;
}

async function apply(connection) {
  if (!await columnExists(connection, 'label_printers', 'alias_label'))
    await connection.query(`ALTER TABLE label_printers ADD COLUMN alias_label VARCHAR(120) COLLATE utf8mb4_unicode_ci NULL AFTER display_name`);
  if (!await columnExists(connection, 'users', 'tool_pin_hash'))
    await connection.query(`ALTER TABLE users ADD COLUMN tool_pin_hash VARCHAR(255) NULL AFTER password_hash`);
  if (!await columnExists(connection, 'users', 'tool_pin_updated_at'))
    await connection.query(`ALTER TABLE users ADD COLUMN tool_pin_updated_at DATETIME NULL AFTER tool_pin_hash`);
  if (!await columnExists(connection, 'users', 'tool_pin_failed_count'))
    await connection.query(`ALTER TABLE users ADD COLUMN tool_pin_failed_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER tool_pin_updated_at`);
  if (!await columnExists(connection, 'users', 'tool_pin_locked_until'))
    await connection.query(`ALTER TABLE users ADD COLUMN tool_pin_locked_until DATETIME NULL AFTER tool_pin_failed_count`);
}

(async () => {
  const connection = await pool.getConnection();
  try {
    const before = await planned(connection);
    console.log(`Operational convenience migration (${APPLY ? 'apply' : 'audit'})`);
    if (!before.length) console.log('Schema already satisfies printer alias and Tool PIN requirements.');
    else before.forEach((change) => console.log(`- ${change}`));
    if (APPLY && before.length) {
      await apply(connection);
      const after = await planned(connection);
      if (after.length) throw new Error(`Migration incomplete: ${after.join(', ')}`);
      console.log('Migration applied successfully.');
    } else if (!APPLY && before.length) {
      console.log('No changes made. Re-run with --apply.');
    }
  } finally {
    connection.release();
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exit(1); });
