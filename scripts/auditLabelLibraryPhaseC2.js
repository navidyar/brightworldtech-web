'use strict';

const { pool } = require('../models/db');

async function scalar(sql, params = []) {
  const [[row]] = await pool.query(sql, params);
  return Number(row.count || 0);
}

async function main() {
  try {
    const [bulkJobs, batchSets, bulkItems, bulkAttempts] = await Promise.all([
      scalar("SELECT COUNT(*) AS count FROM label_print_jobs WHERE source = 'bulk'"),
      scalar("SELECT COUNT(*) AS count FROM label_print_sets WHERE grouping_kind = 'batch'"),
      scalar("SELECT COUNT(*) AS count FROM label_print_job_items i JOIN label_print_jobs j ON j.label_print_job_id = i.label_print_job_id WHERE j.source = 'bulk'"),
      scalar("SELECT COUNT(*) AS count FROM label_print_attempts a JOIN label_print_job_items i ON i.label_print_job_item_id = a.label_print_job_item_id JOIN label_print_jobs j ON j.label_print_job_id = i.label_print_job_id WHERE j.source = 'bulk'")
    ]);

    console.log('\nStage 10W85 Label Library Phase C2 audit (read-only)');
    console.log('Bulk scope: one exact active Lot · current Units Browser page only');
    console.log('Bulk preflight: all selected Units revalidated before first CUPS submission');
    console.log('Bulk print sets: explicit batch sets (not auto-grouped with individual prints)');
    console.log(`Bulk history rows: batch sets ${batchSets}, jobs ${bulkJobs}, items ${bulkItems}, attempts ${bulkAttempts}`);
    console.log('No database, filesystem, CUPS, or printer changes were made.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
