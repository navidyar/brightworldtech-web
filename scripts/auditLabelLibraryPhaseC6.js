'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const labelPrinterModel = require('../models/labelPrinterModel');

async function main() {
  const groups = (await labelPrinterModel.listGroups()).filter((group) => Number(group.is_active) === 1);
  const rows = await labelPrinterModel.listRoutingGroupRows();
  const memberCounts = new Map();
  for (const row of rows) {
    const id = Number(row.label_printer_group_id);
    memberCounts.set(id, (memberCounts.get(id) || 0) + 1);
  }

  console.log('\nStage 10W89 Label Printer Group Routing audit (read-only)');
  console.log(`Active printer groups: ${groups.length}`);
  for (const group of groups) {
    console.log(`- ${group.name}: ${memberCounts.get(Number(group.label_printer_group_id)) || 0} enabled routing member(s)`);
  }
  console.log('Routing priority: online/profile-compatible -> known shortest CUPS queue -> provisioned path -> lower lifetime print count -> group order.');
  console.log('Failover: another group member is tried only when the previous member failed before CUPS accepted any copies.');
  console.log('Partial submissions are never automatically duplicated onto another printer.');
  console.log('No database, filesystem, CUPS, or printer changes were made.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
