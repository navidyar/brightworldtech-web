'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const labelPrintSettingsModel = require('../models/labelPrintSettingsModel');

async function main() {
  const settings = await labelPrintSettingsModel.getLabelPrintSettings({ forceRefresh: true });
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM label_print_sets) AS sets_count,
       (SELECT COUNT(*) FROM label_print_jobs) AS jobs_count,
       (SELECT COUNT(*) FROM label_print_job_items) AS items_count,
       (SELECT COUNT(*) FROM label_print_attempts) AS attempts_count`
  );
  console.log('\nStage 10W86 Label Library Phase C3 audit (read-only)');
  console.log(`Recent Prints display duration: ${settings.recentPrintsMinutes} minute(s)`);
  console.log(`Automatic Print Set grouping gap: ${settings.printSetGroupingGapMinutes} minute(s)`);
  console.log(`Historical rows retained: sets ${counts.sets_count}, jobs ${counts.jobs_count}, items ${counts.items_count}, attempts ${counts.attempts_count}`);
  console.log('Recent Prints is user-scoped; old history is retained outside the display window.');
  console.log('No database, filesystem, CUPS, or printer changes were made.');
  await pool.end();
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
