'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { listLotRequirementFields } = require('../config/lotRequirementRegistry');

const APPLY = process.argv.includes('--apply');

async function main() {
  const connection = await pool.getConnection();

  try {
    const [categoryRows] = await connection.query(
      `SELECT config_category_id
       FROM config_categories
       WHERE code = 'lot_requirement_types'
       LIMIT 1`
    );
    const categoryId = Number(categoryRows[0]?.config_category_id || 0);

    if (!categoryId) {
      throw new Error('The lot_requirement_types configuration category is missing.');
    }

    const definitions = listLotRequirementFields();
    const keys = definitions.map((definition) => definition.key);
    const placeholders = keys.map(() => '?').join(', ');
    const [existingRows] = await connection.query(
      `SELECT code
       FROM config_values
       WHERE config_category_id = ?
         AND code IN (${placeholders})`,
      [categoryId, ...keys]
    );
    const existing = new Set(existingRows.map((row) => String(row.code)));
    const missing = definitions.filter((definition) => !existing.has(definition.key));

    console.log(`Requirement registry fields: ${definitions.length}`);
    console.log(`Configured requirement types: ${definitions.length - missing.length}`);
    console.log(`Missing requirement types: ${missing.length}`);
    missing.forEach((definition) => console.log(`  - ${definition.key}: ${definition.label}`));

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply to add or refresh the registry-backed requirement types.');
      return;
    }

    await connection.beginTransaction();

    for (const [index, definition] of definitions.entries()) {
      await connection.query(
        `INSERT INTO config_values (
           config_category_id,
           code,
           label,
           value,
           sort_order,
           is_active
         ) VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           label = VALUES(label),
           value = VALUES(value),
           sort_order = VALUES(sort_order),
           is_active = 1`,
        [categoryId, definition.key, definition.label, definition.key, (index + 1) * 10]
      );
    }

    await connection.commit();
    console.log(`Applied ${definitions.length} requirement-type definitions.`);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback errors when no transaction was open.
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
