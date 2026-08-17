'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

async function main() {
  const requiredColumns = [
    'requirement_signature',
    'lot_assignment_signature',
    'revoked_by_user_id',
    'revoked_at',
    'expired_at'
  ];
  const [rows] = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'unit_lot_validation_overrides'
        AND column_name IN (${requiredColumns.map(() => '?').join(', ')})
    `,
    requiredColumns
  );
  const found = new Set(rows.map((row) => row.column_name));
  const missing = requiredColumns.filter((columnName) => !found.has(columnName));

  if (missing.length > 0) {
    throw new Error(`Stage 5D migration is missing columns: ${missing.join(', ')}`);
  }

  const requiredStatuses = new Map([
    [SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_APPROVED, 'approved'],
    [SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_CANCELLED, 'cancelled'],
    [SYSTEM_CONFIG_VALUE_IDS.OVERRIDE_EXPIRED, 'expired']
  ]);
  const [statusRows] = await pool.query(
    `SELECT system_config_value_id
     FROM system_config_values
     WHERE system_config_value_id IN (${Array.from(requiredStatuses.keys()).join(', ')})`
  );
  const foundStatusIds = new Set(statusRows.map((row) => Number(row.system_config_value_id)));
  const missingStatuses = Array.from(requiredStatuses.entries())
    .filter(([systemId]) => !foundStatusIds.has(systemId))
    .map(([, label]) => label);

  if (missingStatuses.length > 0) {
    throw new Error(`Required override statuses are missing: ${missingStatuses.join(', ')}`);
  }

  console.log('Stage 5D Lot-validation Management acceptance storage is valid.');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
