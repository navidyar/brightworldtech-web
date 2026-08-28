'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  UNIT_FIELD_SOURCE_KEY_MAPPINGS,
  planUnitFieldSourceKeyMigration
} = require('../services/unitFieldSourceKeyMigration');

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const ACTIVE_MAPPINGS = ROLLBACK
  ? UNIT_FIELD_SOURCE_KEY_MAPPINGS.map(({ legacyKey, canonicalKey }) => ({
    legacyKey: canonicalKey,
    canonicalKey: legacyKey
  }))
  : UNIT_FIELD_SOURCE_KEY_MAPPINGS;
const ALL_KEYS = ACTIVE_MAPPINGS.flatMap(({ legacyKey, canonicalKey }) => [legacyKey, canonicalKey]);

async function assertSchema(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'unit_field_sources'`
  );
  const columns = new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
  const missing = ['unit_field_source_id', 'unit_id', 'field_key'].filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`unit_field_sources is missing required columns: ${missing.join(', ')}.`);
  }
}

async function loadRelevantRows(connection, { lock = false } = {}) {
  const placeholders = ALL_KEYS.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT unit_field_source_id, unit_id, field_key
     FROM unit_field_sources
     WHERE field_key IN (${placeholders})
     ORDER BY unit_id, field_key${lock ? ' FOR UPDATE' : ''}`,
    ALL_KEYS
  );
  return rows;
}

function printPlan(plan, mode) {
  console.log(`\nUnit field-source key normalization (${mode})`);
  console.log(`Relevant rows scanned: ${plan.rowsScanned}`);
  for (const mapping of plan.mappings) {
    console.log(
      `- ${mapping.legacyKey} -> ${mapping.canonicalKey}: `
      + `${mapping.legacyRows} legacy, ${mapping.canonicalRows} canonical, `
      + `${mapping.collisions} collision(s), ${mapping.updatesPlanned} update(s)`
    );
  }
  console.log(`Blocking collisions: ${plan.collisions}`);
  console.log(`Updates planned: ${plan.updatesPlanned}`);
}

async function applyMigration(connection) {
  await connection.beginTransaction();
  try {
    const plan = planUnitFieldSourceKeyMigration(
      await loadRelevantRows(connection, { lock: true }),
      ACTIVE_MAPPINGS
    );
    printPlan(plan, 'preflight');
    if (plan.collisions > 0) {
      throw new Error('Canonical Unit field-source collisions exist. No rows were changed.');
    }

    for (const mapping of plan.mappings) {
      await connection.query(
        'UPDATE unit_field_sources SET field_key = ? WHERE field_key = ?',
        [mapping.canonicalKey, mapping.legacyKey]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  if (ROLLBACK && !APPLY) {
    throw new Error('--rollback must be paired with --apply. Use the audit command for a read-only forward report.');
  }
  const connection = await pool.getConnection();
  try {
    await assertSchema(connection);
    const before = planUnitFieldSourceKeyMigration(await loadRelevantRows(connection), ACTIVE_MAPPINGS);
    printPlan(before, ROLLBACK ? 'rollback preflight' : APPLY ? 'dry-run before apply' : 'dry-run');
    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
      return;
    }
    if (before.collisions > 0) {
      throw new Error('Canonical Unit field-source collisions exist. Resolve them before applying this migration.');
    }

    await applyMigration(connection);
    const after = planUnitFieldSourceKeyMigration(await loadRelevantRows(connection), ACTIVE_MAPPINGS);
    printPlan(after, ROLLBACK ? 'rolled back' : 'applied');
    if (after.mappings.some((mapping) => mapping.legacyRows > 0) || after.collisions > 0) {
      throw new Error('Unit field-source key verification failed after the transaction committed.');
    }
    console.log(`\nUnit field-source keys ${ROLLBACK ? 'rolled back' : 'normalized'} successfully.`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
