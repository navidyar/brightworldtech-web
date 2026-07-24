'use strict';

const { pool } = require('../models/db');
const lotModel = require('../models/lotModel');
const lotValidationModel = require('../models/lotValidationModel');

async function main() {
  const lots = await lotModel.listLots({ includeHidden: true });
  let unitsChecked = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let needsReviewCount = 0;
  let openCount = 0;
  let incompleteIdentityCount = 0;

  for (const lot of lots) {
    const report = await lotValidationModel.buildLotValidationReport(lot.lot_id);

    unitsChecked += report.unitsChecked;
    acceptedCount += report.acceptedCount;
    rejectedCount += report.rejectedCount;
    needsReviewCount += report.needsReviewCount;
    openCount += report.openCount;
    incompleteIdentityCount += report.units.filter((unit) => (
      !unit.unitId || !String(unit.label || '').trim()
    )).length;
  }

  if (incompleteIdentityCount > 0) {
    throw new Error(`${incompleteIdentityCount} units did not resolve a usable identity label.`);
  }

  console.log(
    `Lot validation reader valid: ${lots.length} lots, ${unitsChecked} units checked, ` +
    `${acceptedCount} accepted, ${rejectedCount} rejected, ${needsReviewCount} needs review, ${openCount} open.`
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
