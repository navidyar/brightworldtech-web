'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function scalar(sql) {
  const [rows] = await pool.query(sql);
  return Number(rows[0]?.count || 0);
}

async function main() {
  const [bulkJobs, bulkJobsWithCopies, historicalSplitJobs] = await Promise.all([
    scalar("SELECT COUNT(*) AS count FROM label_print_jobs WHERE source = 'bulk'"),
    scalar(`SELECT COUNT(DISTINCT j.label_print_job_id) AS count
      FROM label_print_jobs j
      JOIN label_print_job_items i ON i.label_print_job_id = j.label_print_job_id
      JOIN label_print_attempts a ON a.label_print_job_item_id = i.label_print_job_item_id
      WHERE j.source = 'bulk' AND a.copies_submitted > 0`),
    scalar(`SELECT COUNT(*) AS count FROM (
      SELECT j.label_print_job_id
      FROM label_print_jobs j
      JOIN label_print_job_items i ON i.label_print_job_id = j.label_print_job_id
      JOIN label_print_attempts a ON a.label_print_job_item_id = i.label_print_job_item_id
      WHERE j.source = 'bulk' AND a.copies_submitted > 0
      GROUP BY j.label_print_job_id
      HAVING COUNT(DISTINCT COALESCE(a.printer_key_snapshot, a.cups_queue_snapshot, a.endpoint_snapshot)) > 1
    ) split_bulk_jobs`)
  ]);

  console.log('\nStage 10W95 Label Bulk Printer Affinity audit (read-only)');
  console.log(`Bulk print jobs: ${bulkJobs}`);
  console.log(`Bulk jobs with accepted copies: ${bulkJobsWithCopies}`);
  console.log(`Historical bulk jobs using multiple printers: ${historicalSplitJobs}`);
  console.log('New behavior: each bulk group submission resolves one compatible online printer once and keeps all selected Units on that printer.');
  console.log('Submission serialization: app print submissions to the same physical printer wait behind an active bulk submission so its CUPS jobs stay contiguous.');
  console.log('Historical split jobs may predate this patch and are not modified.');
  console.log('No database, filesystem, CUPS, or printer changes were made.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
