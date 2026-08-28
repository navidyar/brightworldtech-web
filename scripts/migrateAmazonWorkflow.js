'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

function q(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return Boolean(rows[0]);
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME || '')));
}

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] ? String(rows[0].COLUMN_TYPE) : null;
}

async function getSystemIdentifierCategoryId(connection) {
  if (!await tableExists(connection, 'system_config_categories')) return null;
  const [rows] = await connection.query(
    `SELECT config_category_id FROM system_config_categories WHERE system_config_category_id = ? LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES]
  );
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function getAmazonIdentifierTypeId(connection) {
  if (!await tableExists(connection, 'system_config_values')) return null;
  const [rows] = await connection.query(
    `SELECT config_value_id FROM system_config_values WHERE system_config_value_id = ? LIMIT 1`,
    [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG]
  );
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function findAmazonIdentifierTypeByLabel(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumns = ['label', 'name', 'value'].filter((column) => columns.has(column));
  if (!categoryId || labelColumns.length === 0) return null;
  const clauses = labelColumns.map((column) => `LOWER(TRIM(${q(column)})) IN ('amazon asset tag', 'amazon asset tag (az)', 'az asset tag')`);
  const [rows] = await connection.query(
    `SELECT config_value_id FROM config_values WHERE config_category_id = ? AND (${clauses.join(' OR ')}) ORDER BY config_value_id LIMIT 1`,
    [categoryId]
  );
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function createAmazonIdentifierType(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const fields = ['config_category_id'];
  const values = [categoryId];
  for (const column of ['label', 'name']) {
    if (columns.has(column)) {
      fields.push(column);
      values.push('Amazon Asset Tag');
    }
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push('Amazon Asset Tag');
  }
  if (columns.has('code')) {
    fields.push('code');
    values.push('amazon_asset_tag');
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push('Permanent AZ-prefixed secondary asset tag used by Amazon Returns workflows.');
  }
  if (columns.has('sort_order')) {
    const [rows] = await connection.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order FROM config_values WHERE config_category_id = ?',
      [categoryId]
    );
    fields.push('sort_order');
    values.push(Number(rows[0]?.next_sort_order || 10));
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (columns.has('is_protected')) {
    fields.push('is_protected');
    values.push(1);
  }
  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureAmazonIdentifierBinding(connection) {
  const categoryId = await getSystemIdentifierCategoryId(connection);
  if (!categoryId) throw new Error('Unit Identifier Types system category binding (28) is missing.');
  let configValueId = await getAmazonIdentifierTypeId(connection);
  if (!configValueId) {
    configValueId = await findAmazonIdentifierTypeByLabel(connection, categoryId);
    if (!configValueId) configValueId = await createAmazonIdentifierType(connection, categoryId);
    await connection.query(
      `INSERT INTO system_config_values (system_config_value_id, config_value_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
      [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, configValueId]
    );
  }
  const columns = await getColumnSet(connection, 'config_values');
  if (columns.has('is_protected')) {
    await connection.query('UPDATE config_values SET is_protected = 1 WHERE config_value_id = ?', [configValueId]);
  }
  return configValueId;
}

async function ensureLotColumn(connection) {
  const columns = await getColumnSet(connection, 'lots');
  if (!columns.has('generate_amazon_asset_tag')) {
    await connection.query(
      'ALTER TABLE lots ADD COLUMN generate_amazon_asset_tag TINYINT(1) NOT NULL DEFAULT 0 AFTER start_new_production_cycle_on_move'
    );
  }
}

async function ensureAmazonDetailsTable(connection) {
  if (await tableExists(connection, 'unit_amazon_details')) return;
  const unitIdType = await getColumnType(connection, 'units', 'unit_id');
  const userIdType = await getColumnType(connection, 'users', 'user_id');
  if (!unitIdType || !userIdType) throw new Error('Could not resolve units.unit_id/users.user_id types.');
  await connection.query(`
    CREATE TABLE unit_amazon_details (
      unit_id ${unitIdType} NOT NULL,
      fnsku VARCHAR(100) NULL,
      asin VARCHAR(100) NULL,
      tracking_number VARCHAR(150) NULL,
      pallet_number VARCHAR(150) NULL,
      buyer_comments TEXT NULL,
      created_by_user_id ${userIdType} NULL,
      updated_by_user_id ${userIdType} NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (unit_id),
      KEY idx_unit_amazon_fnsku (fnsku),
      KEY idx_unit_amazon_asin (asin),
      KEY idx_unit_amazon_tracking (tracking_number),
      KEY idx_unit_amazon_pallet (pallet_number),
      CONSTRAINT fk_unit_amazon_details_unit FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
      CONSTRAINT fk_unit_amazon_details_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
      CONSTRAINT fk_unit_amazon_details_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
}

async function ensureSequenceTable(connection) {
  if (!await tableExists(connection, 'amazon_asset_tag_sequence')) {
    await connection.query(`
      CREATE TABLE amazon_asset_tag_sequence (
        sequence_id TINYINT UNSIGNED NOT NULL,
        last_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (sequence_id)
      ) ENGINE=InnoDB
    `);
  }
  await connection.query(
    `INSERT INTO amazon_asset_tag_sequence (sequence_id, last_number) VALUES (1, 0)
     ON DUPLICATE KEY UPDATE sequence_id = VALUES(sequence_id)`
  );
}

async function syncSequenceToExistingTags(connection, identifierTypeId) {
  if (!identifierTypeId || !await tableExists(connection, 'unit_identifiers')) return 0;
  const [rows] = await connection.query(
    `SELECT MAX(CAST(SUBSTRING(identifier_value, 3) AS UNSIGNED)) AS max_number
     FROM unit_identifiers
     WHERE identifier_type_config_value_id = ?
       AND identifier_value REGEXP '^AZ[0-9]{8}$'`,
    [identifierTypeId]
  );
  const maxNumber = Number(rows[0]?.max_number || 0);
  if (maxNumber > 99999999) throw new Error('An existing AZ identifier exceeds the supported 8-digit range.');
  await connection.query(
    'UPDATE amazon_asset_tag_sequence SET last_number = GREATEST(last_number, ?) WHERE sequence_id = 1',
    [maxNumber]
  );
  return maxNumber;
}

async function inspect(connection) {
  const requiredTables = ['units', 'users', 'lots', 'config_values', 'system_config_categories', 'system_config_values', 'unit_identifiers'];
  const missingRequiredTables = [];
  for (const table of requiredTables) if (!await tableExists(connection, table)) missingRequiredTables.push(table);
  const lotColumns = await getColumnSet(connection, 'lots');
  const amazonIdentifierTypeId = await getAmazonIdentifierTypeId(connection);
  const [azRows] = amazonIdentifierTypeId && await tableExists(connection, 'unit_identifiers')
    ? await connection.query('SELECT COUNT(*) AS row_count FROM unit_identifiers WHERE identifier_type_config_value_id = ?', [amazonIdentifierTypeId])
    : [[{ row_count: 0 }]];
  const [detailRows] = await tableExists(connection, 'unit_amazon_details')
    ? await connection.query('SELECT COUNT(*) AS row_count FROM unit_amazon_details')
    : [[{ row_count: 0 }]];
  return {
    missingRequiredTables,
    hasLotColumn: lotColumns.has('generate_amazon_asset_tag'),
    hasDetailsTable: await tableExists(connection, 'unit_amazon_details'),
    hasSequenceTable: await tableExists(connection, 'amazon_asset_tag_sequence'),
    amazonIdentifierTypeId,
    azTagCount: Number(azRows[0]?.row_count || 0),
    amazonDetailsCount: Number(detailRows[0]?.row_count || 0)
  };
}

function printReport(report, label) {
  console.log(`\nAmazon workflow migration (${label})`);
  console.log(`- lots.generate_amazon_asset_tag: ${report.hasLotColumn ? 'ready' : 'missing'}`);
  console.log(`- unit_amazon_details: ${report.hasDetailsTable ? 'ready' : 'missing'} (${report.amazonDetailsCount} row(s))`);
  console.log(`- amazon_asset_tag_sequence: ${report.hasSequenceTable ? 'ready' : 'missing'}`);
  console.log(`- Amazon Asset Tag identifier binding (204): ${report.amazonIdentifierTypeId || 'missing'} (${report.azTagCount} assigned tag(s))`);
  if (report.missingRequiredTables.length) console.log(`- blocking: missing ${report.missingRequiredTables.join(', ')}`);
  if (!APPLY && !report.missingRequiredTables.length) console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    printReport(before, APPLY ? 'preflight' : 'audit');
    if (before.missingRequiredTables.length) {
      process.exitCode = 1;
      return;
    }
    if (!APPLY) return;

    await ensureLotColumn(connection);
    await ensureAmazonDetailsTable(connection);
    await ensureSequenceTable(connection);
    const identifierTypeId = await ensureAmazonIdentifierBinding(connection);
    await syncSequenceToExistingTags(connection, identifierTypeId);

    const after = await inspect(connection);
    if (!after.hasLotColumn || !after.hasDetailsTable || !after.hasSequenceTable || !after.amazonIdentifierTypeId) {
      throw new Error('Amazon workflow migration verification failed.');
    }
    printReport(after, 'applied');
    console.log('\nAmazon workflow migration completed successfully. Existing Lots remain AZ-generation Off by default and existing Units were not backfilled.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
