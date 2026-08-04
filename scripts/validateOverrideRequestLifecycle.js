'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const [[column]] = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'unit_override_requests'
        AND column_name = 'requested_destination_lot_id'
      LIMIT 1
    `
  );

  if (!column) {
    throw new Error('Stage 7B is missing unit_override_requests.requested_destination_lot_id.');
  }

  const [[foreignKey]] = await pool.query(
    `
      SELECT constraint_name
      FROM information_schema.referential_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = 'unit_override_requests'
        AND constraint_name = 'fk_unit_override_requests_requested_destination'
      LIMIT 1
    `
  );

  if (!foreignKey) {
    throw new Error('Stage 7B requested-destination foreign key is missing.');
  }

  const [[counts]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN request_type = 'manual_tech_override_request' THEN 1 ELSE 0 END) AS manual_count,
        SUM(
          CASE
            WHEN request_type = 'manual_tech_override_request'
              AND LOWER(request_status) = 'pending'
              AND requested_destination_lot_id IS NULL
            THEN 1
            ELSE 0
          END
        ) AS incomplete_pending_count,
        SUM(
          CASE
            WHEN request_type = 'manual_tech_override_request'
              AND LOWER(request_status) = 'pending'
            THEN 1
            ELSE 0
          END
        ) AS pending_count
      FROM unit_override_requests
    `
  );

  if (Number(counts.incomplete_pending_count || 0) > 0) {
    throw new Error(`${counts.incomplete_pending_count} pending manual override request(s) have no requested destination Lot.`);
  }

  console.log(
    `Override request lifecycle valid: ${Number(counts.manual_count || 0)} manual requests, ${Number(counts.pending_count || 0)} pending, 0 incomplete pending destinations.`
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
