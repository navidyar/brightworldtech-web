'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { LABEL_FIELD_GROUPS } = require('../config/labelFieldRegistry');

const APPLY = process.argv.includes('--apply');

async function tableExists(connection) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'label_dynamic_field_config'
     LIMIT 1`
  );
  return rows.length > 0;
}

async function createTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS label_dynamic_field_config (
      field_key VARCHAR(120) NOT NULL,
      display_label VARCHAR(120) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (field_key),
      KEY idx_label_dynamic_field_config_active_order (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function registryRows() {
  return LABEL_FIELD_GROUPS.flatMap((group) => group.fields.map((field, index) => ({
    fieldKey: field.key,
    label: field.label,
    sortOrder: (index + 1) * 10,
    groupCode: group.code
  })));
}

async function seedMissingRows(connection, rows) {
  let inserted = 0;
  for (const row of rows) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO label_dynamic_field_config
        (field_key, display_label, is_active, sort_order)
       VALUES (?, NULL, 1, ?)`,
      [row.fieldKey, row.sortOrder]
    );
    inserted += Number(result.affectedRows || 0);
  }
  return inserted;
}

async function loadStoredRows(connection) {
  if (!await tableExists(connection)) return [];
  const [rows] = await connection.query(
    `SELECT field_key, display_label, is_active, sort_order
     FROM label_dynamic_field_config
     ORDER BY sort_order, field_key`
  );
  return rows;
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const registry = registryRows();
    const existedBefore = await tableExists(connection);
    const storedBefore = existedBefore ? await loadStoredRows(connection) : [];
    const registryKeySet = new Set(registry.map((row) => row.fieldKey));
    const staleRows = storedBefore.filter((row) => !registryKeySet.has(String(row.field_key || '')));
    const missingRows = registry.filter((row) => !storedBefore.some((stored) => stored.field_key === row.fieldKey));

    console.log(`Label Builder supported dynamic fields: ${registry.length}`);
    console.log(`Configuration table exists: ${existedBefore ? 'yes' : 'no'}`);
    console.log(`Stored field settings: ${storedBefore.length}`);
    console.log(`Supported fields not yet stored: ${missingRows.length}`);
    console.log(`Stored keys no longer supported by code: ${staleRows.length}`);

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.beginTransaction();
    await createTable(connection);
    const inserted = await seedMissingRows(connection, registry);
    await connection.commit();

    const storedAfter = await loadStoredRows(connection);
    console.log('Label Builder dynamic-field configuration migration applied.');
    console.log(`New field settings inserted: ${inserted}`);
    console.log(`Stored field settings after migration: ${storedAfter.length}`);
    console.log('Existing labels, active states, and ordering were preserved.');
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
