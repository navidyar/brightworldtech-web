'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function countRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return Number(rows[0]?.row_count || 0);
}

async function audit(connection) {
  const mappingTable = await tableExists(connection, 'unit_model_intake_mappings');
  const shortFormColumn = await columnExists(connection, 'processor_models', 'label_short_form');
  const mappingCount = mappingTable
    ? await countRows(connection, 'SELECT COUNT(*) AS row_count FROM unit_model_intake_mappings')
    : 0;
  const shortFormCount = shortFormColumn
    ? await countRows(connection, "SELECT COUNT(*) AS row_count FROM processor_models WHERE NULLIF(TRIM(label_short_form), '') IS NOT NULL")
    : 0;
  return { mappingTable, shortFormColumn, mappingCount, shortFormCount };
}

async function applyMigration(connection) {
  if (!await columnExists(connection, 'processor_models', 'label_short_form')) {
    await connection.query('ALTER TABLE processor_models ADD COLUMN label_short_form VARCHAR(80) NULL AFTER model_code');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS unit_model_intake_mappings (
      unit_model_intake_mapping_id INT NOT NULL AUTO_INCREMENT,
      observed_manufacturer_id INT NOT NULL,
      observed_unit_category_config_value_id INT NOT NULL,
      observed_model_name VARCHAR(150) NOT NULL,
      observed_model_key VARCHAR(191) NOT NULL,
      target_unit_model_id INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by_user_id INT NULL,
      updated_by_user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (unit_model_intake_mapping_id),
      UNIQUE KEY uq_unit_model_intake_observation (
        observed_manufacturer_id,
        observed_unit_category_config_value_id,
        observed_model_key
      ),
      KEY idx_unit_model_intake_target (target_unit_model_id, is_active),
      CONSTRAINT fk_unit_model_intake_manufacturer
        FOREIGN KEY (observed_manufacturer_id) REFERENCES manufacturers (manufacturer_id),
      CONSTRAINT fk_unit_model_intake_category
        FOREIGN KEY (observed_unit_category_config_value_id) REFERENCES config_values (config_value_id),
      CONSTRAINT fk_unit_model_intake_target
        FOREIGN KEY (target_unit_model_id) REFERENCES unit_models (unit_model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function rollbackMigration(connection, state) {
  if (state.mappingCount > 0 || state.shortFormCount > 0) {
    throw new Error(
      `Rollback refused: ${state.mappingCount} model mapping(s) and ${state.shortFormCount} processor short form(s) contain user data.`
    );
  }
  if (state.mappingTable) await connection.query('DROP TABLE unit_model_intake_mappings');
  if (state.shortFormColumn) await connection.query('ALTER TABLE processor_models DROP COLUMN label_short_form');
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await audit(connection);
    console.log(`Model intake mapping table: ${before.mappingTable ? 'present' : 'missing'} (${before.mappingCount} row(s))`);
    console.log(`Processor label short-form column: ${before.shortFormColumn ? 'present' : 'missing'} (${before.shortFormCount} configured)`);

    if (!APPLY) {
      console.log(`No database changes were made. Re-run with ${ROLLBACK ? '--rollback --apply' : '--apply'} to continue.`);
      return;
    }

    if (ROLLBACK) {
      await rollbackMigration(connection, before);
      console.log('Model mapping and processor short-form schema rolled back.');
    } else {
      await applyMigration(connection);
      console.log('Model mapping and processor short-form schema applied.');
    }

    const after = await audit(connection);
    console.log(`Final mapping table: ${after.mappingTable ? 'present' : 'missing'}; short-form column: ${after.shortFormColumn ? 'present' : 'missing'}.`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
