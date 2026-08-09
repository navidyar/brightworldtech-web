'use strict';

function nonBlankText(value) {
  const normalized = String(value === null || value === undefined ? '' : value).trim();
  return normalized;
}

function formatWeight(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return '';
  }

  return numeric.toFixed(2);
}

function buildUnitWeightBrowserPresentation(unit = {}) {
  const hasIndividualWeight = Boolean(
    unit.productionWeightHasOverride
    || unit.hasUnitProductionWeightOverride
    || String(unit.productionWeightSourceCode || '').trim() === 'unit_override'
  );
  const formattedIndividualWeight = hasIndividualWeight
    ? (
      nonBlankText(unit.formattedUnitProductionWeightOverride)
      || nonBlankText(unit.formattedProductionWeight)
      || formatWeight(unit.unitProductionWeightOverride)
      || formatWeight(unit.productionWeight)
      || '—'
    )
    : '';

  return {
    showIndividualWeightPill: hasIndividualWeight,
    formattedIndividualWeightPill: formattedIndividualWeight
  };
}

module.exports = {
  buildUnitWeightBrowserPresentation
};
