'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

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

  const [statusRows] = await pool.query(
    `
      SELECT cv.code
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = 'override_statuses'
        AND cv.code IN ('approved', 'cancelled', 'expired')
    `
  );
  const statuses = new Set(statusRows.map((row) => row.code));
  const missingStatuses = ['approved', 'cancelled', 'expired'].filter((code) => !statuses.has(code));

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
