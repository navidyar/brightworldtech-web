'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
function shouldStartNewProductionCycle({
  allowNewProductionCycle = true,
  destinationPolicyEnabled = false,
  hasCurrentProductionCredit = false,
  fromLotId = null,
  toLotId = null
} = {}) {
  const safeFromLotId = normalizePositiveInteger(fromLotId);
  const safeToLotId = normalizePositiveInteger(toLotId);

  return Boolean(
    allowNewProductionCycle
    && destinationPolicyEnabled
    && hasCurrentProductionCredit
    && safeFromLotId
    && safeToLotId
    && safeFromLotId !== safeToLotId
  );
}

function shouldGrantProductionCredit({ hasActiveProductionCredit = false } = {}) {
  return !hasActiveProductionCredit;
}

module.exports = {
  shouldStartNewProductionCycle,
  shouldGrantProductionCredit
};
