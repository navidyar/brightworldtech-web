'use strict';

const { pool } = require('../models/db');
const unitQcCorrectionModel = require('../models/unitQcCorrectionModel');

async function main() {
  if (!await unitQcCorrectionModel.isQcCorrectionSchemaReady(pool)) {
    throw new Error('Stage 9G QC correction storage is not ready. Run scripts/apply-stage-9g-qc-correction-workflow.sh.');
  }

  const [[row]] = await pool.query('SELECT COUNT(*) AS correction_count FROM unit_qc_corrections');
  console.log(`Stage 9G QC correction workflow valid: ${Number(row.correction_count || 0)} correction submission(s).`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
