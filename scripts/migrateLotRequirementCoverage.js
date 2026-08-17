'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../models/db');
const { listLotRequirementFields } = require('../config/lotRequirementRegistry');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY
} = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const [[categoryRow]] = await connection.query(
      `SELECT config_category_id
       FROM system_config_categories
       WHERE system_config_category_id = ?
       LIMIT 1`,
      [SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_TYPES]
    );
    const categoryId = Number(categoryRow?.config_category_id || 0);

    if (!categoryId) {
      throw new Error('The Lot Requirement Types system configuration category is missing. Apply the configuration ID foundation first.');
    }

    const definitions = listLotRequirementFields();
    const systemIds = definitions.map((definition) => Number(SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY[definition.key] || 0));
    const unmapped = definitions.filter((definition, index) => !systemIds[index]);
    if (unmapped.length) {
      throw new Error(`Requirement registry fields are missing numeric system identities: ${unmapped.map((definition) => definition.key).join(', ')}.`);
    }

    const [existingRows] = await connection.query(
      `SELECT scv.system_config_value_id, scv.config_value_id
       FROM system_config_values scv
       WHERE scv.system_config_value_id IN (${systemIds.map(() => '?').join(', ')})`,
      systemIds
    );
    const existingBySystemId = new Map(existingRows.map((row) => [Number(row.system_config_value_id), Number(row.config_value_id)]));
    const missing = definitions.filter((definition) => !existingBySystemId.has(Number(SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY[definition.key])));

    console.log(`Requirement registry fields: ${definitions.length}`);
    console.log(`Configured requirement types: ${definitions.length - missing.length}`);
    console.log(`Missing requirement types: ${missing.length}`);
    missing.forEach((definition) => console.log(`  - ${definition.key}: ${definition.label}`));

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply to add or refresh the registry-backed requirement types.');
      return;
    }

    const valueColumns = await getColumnSet(connection, 'config_values');
    await connection.beginTransaction();

    for (const [index, definition] of definitions.entries()) {
      const systemId = Number(SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY[definition.key]);
      let configValueId = existingBySystemId.get(systemId) || null;

      if (configValueId) {
        await connection.query(
          `UPDATE config_values
           SET label = ?, value = ?, sort_order = ?, is_active = 1${valueColumns.has('is_protected') ? ', is_protected = 1' : ''}
           WHERE config_value_id = ?`,
          [definition.label, definition.key, (index + 1) * 10, configValueId]
        );
        continue;
      }

      const fields = ['config_category_id', 'label', 'value', 'sort_order', 'is_active'];
      const values = [categoryId, definition.label, definition.key, (index + 1) * 10, 1];
      if (valueColumns.has('code')) {
        fields.splice(1, 0, 'code');
        values.splice(1, 0, `legacy_${crypto.randomUUID().replace(/-/g, '')}`);
      }
      if (valueColumns.has('is_protected')) {
        fields.push('is_protected');
        values.push(1);
      }

      const [insertResult] = await connection.query(
        `INSERT INTO config_values (${fields.map((field) => `\`${field}\``).join(', ')})
         VALUES (${fields.map(() => '?').join(', ')})`,
        values
      );
      configValueId = Number(insertResult.insertId);
      await connection.query(
        `INSERT INTO system_config_values (system_config_value_id, config_value_id)
         VALUES (?, ?)`,
        [systemId, configValueId]
      );
    }

    await connection.commit();
    console.log(`Applied ${definitions.length} requirement-type definitions using numeric system identities.`);
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
