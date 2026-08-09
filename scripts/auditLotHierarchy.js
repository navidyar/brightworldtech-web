'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const lotModel = require('../models/lotModel');

async function main() {
  const report = await lotModel.getLotHierarchyAudit();

  console.log(`Lots scanned: ${report.lotCount}`);
  console.log(`Self-parent references: ${report.selfReferences.length}`);
  console.log(`Missing-parent references: ${report.missingParents.length}`);
  console.log(`Multi-Lot cycles: ${report.cycles.length}`);
  console.log(`Affected Lots: ${report.affectedLotIds.length}`);

  if (report.selfReferences.length > 0) {
    console.log('\nSelf-parent references:');
    report.selfReferences.forEach((entry) => {
      console.log(`- Lot #${entry.lotId} ${entry.lotName || '(unnamed)'} -> itself`);
    });
  }

  if (report.missingParents.length > 0) {
    console.log('\nMissing-parent references:');
    report.missingParents.forEach((entry) => {
      console.log(`- Lot #${entry.lotId} ${entry.lotName || '(unnamed)'} -> missing parent #${entry.parentLotId}`);
    });
  }

  if (report.cycles.length > 0) {
    console.log('\nHierarchy cycles:');
    report.cycles.forEach((cycle) => {
      console.log(`- ${cycle.lots.map((lot) => `#${lot.lotId} ${lot.lotName || '(unnamed)'}`).join(' -> ')} -> #${cycle.lots[0].lotId}`);
    });
  }

  if (!report.hasIssues) {
    console.log('\nLot hierarchy audit passed. No self-references, missing parents, or cycles were found.');
  } else {
    console.log('\nLot hierarchy audit found integrity issues. No database changes were made.');
    console.log('Repair affected Parent Lot relationships through Lot Details/Edit Lot, then rerun this audit.');
  }
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
