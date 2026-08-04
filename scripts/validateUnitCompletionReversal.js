'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const [columnRows] = await pool.query(
    `
      SELECT column_name, extra
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'unit_work_completions'
    `
  );
  const columns = new Map(columnRows.map((row) => [row.column_name, row]));
  const requiredColumns = ['reversed_at', 'reversed_by_user_id', 'reversal_reason', 'active_work_cycle_key'];
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(`Unit completion reversal is missing columns: ${missingColumns.join(', ')}`);
  }

  const [indexRows] = await pool.query(
    `
      SELECT index_name, non_unique
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'unit_work_completions'
    `
  );
  const activeCycleIndex = indexRows.find((row) => row.index_name === 'uniq_unit_work_completions_active_cycle');

  if (!activeCycleIndex || Number(activeCycleIndex.non_unique) !== 0) {
    throw new Error('The active Unit-completion work-cycle unique index is missing.');
  }

  const [[counts]] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN reversed_at IS NULL THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN reversed_at IS NOT NULL THEN 1 ELSE 0 END) AS reversed_count
      FROM unit_work_completions
    `
  );

  console.log(
    `Unit completion reversal valid: ${Number(counts.active_count || 0)} active completions, ${Number(counts.reversed_count || 0)} reversed completions.`
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
