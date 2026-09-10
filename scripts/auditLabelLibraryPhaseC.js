'use strict';

const { pool } = require('../models/db');
const labelLibraryModel = require('../models/labelLibraryModel');
const { loadTemplateRuntime } = require('../services/labelLibraryPrintingService');
const { LABEL_PRINTERS } = require('../config/labelPrinting');
const { LABEL_PRINT_SET_GROUPING_GAP_MINUTES } = require('../config/labelLibrary');

async function tableCount(tableName) {
  const allowed = new Set(['label_print_sets', 'label_print_jobs', 'label_print_job_items', 'label_print_attempts']);
  if (!allowed.has(tableName)) throw new Error('Unsupported audit table.');
  const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(row.count || 0);
}

async function main() {
  try {
    const initialTemplate = await labelLibraryModel.getInitialRegisteredLabelTemplate();
    if (!initialTemplate) throw new Error('The Phase B initial Label Library template is not registered.');
    const runtime = await loadTemplateRuntime(initialTemplate.label_template_id);
    const configAsset = runtime.configAsset;
    const [sets, jobs, items, attempts] = await Promise.all([
      tableCount('label_print_sets'),
      tableCount('label_print_jobs'),
      tableCount('label_print_job_items'),
      tableCount('label_print_attempts')
    ]);

    console.log('\nStage 10W84 Label Library Phase C audit (read-only)');
    console.log(`Initial template: ${initialTemplate.name} (template ${initialTemplate.label_template_id}, ${initialTemplate.status})`);
    console.log(`Layout schema: ${runtime.layout.schemaVersion}`);
    console.log(`Legacy renderer compatibility: ${runtime.layout.legacyRendererId || 'none'}`);
    console.log(`Config asset: ${configAsset.sha256} · ${configAsset.byte_size} byte(s)`);
    console.log(`Configured printers: ${LABEL_PRINTERS.map((printer) => `${printer.label} -> ${printer.queue}`).join(', ')}`);
    console.log(`Automatic print-set grouping gap: ${LABEL_PRINT_SET_GROUPING_GAP_MINUTES} minute(s)`);
    console.log(`Print history rows: sets ${sets}, jobs ${jobs}, items ${items}, attempts ${attempts}`);
    console.log('No database, filesystem, CUPS, or printer changes were made.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
