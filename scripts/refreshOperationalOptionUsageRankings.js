require('dotenv').config();

const {
  refreshOperationalOptionUsageRankings
} = require('../models/operationalOptionRankingModel');

async function main() {
  const result = await refreshOperationalOptionUsageRankings();

  if (!result.supported) {
    throw new Error(result.reason || 'Stage 10M operational ranking storage is not ready.');
  }

  if (!result.refreshed) {
    console.log(result.reason || 'Operational option ranking refresh was skipped.');
    return;
  }

  console.log(`Operational option rankings refreshed: ${result.rankingRowCount} row(s) in ${result.durationMs}ms.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
