const MIN_LOT_PRODUCTION_WEIGHT = 0.10;

function parseRequiredLotProductionWeight(value) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return null;
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue) || numericValue < MIN_LOT_PRODUCTION_WEIGHT) {
    return null;
  }

  return numericValue;
}

module.exports = {
  MIN_LOT_PRODUCTION_WEIGHT,
  parseRequiredLotProductionWeight
};
