'use strict';

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

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
