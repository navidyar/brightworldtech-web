'use strict';

const BINARY_TB_GB = 1024;
const TB_NORMALIZATION_TOLERANCE = 0.03;

function normalizePositiveCapacity(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function getNominalTerabyteCount(valueGb) {
  const numericGb = normalizePositiveCapacity(valueGb);

  if (numericGb === null || numericGb < BINARY_TB_GB * (1 - TB_NORMALIZATION_TOLERANCE)) {
    return null;
  }

  const terabytes = Math.max(1, Math.round(numericGb / BINARY_TB_GB));
  const targetGb = terabytes * BINARY_TB_GB;
  const relativeDifference = Math.abs(numericGb - targetGb) / targetGb;

  return relativeDifference <= TB_NORMALIZATION_TOLERANCE ? terabytes : null;
}

function formatBrowserCapacityGb(valueGb) {
  const numericGb = normalizePositiveCapacity(valueGb);

  if (numericGb === null) {
    return '';
  }

  const nominalTerabytes = getNominalTerabyteCount(numericGb);
  if (nominalTerabytes !== null) {
    return `${nominalTerabytes}TB`;
  }

  const formattedGb = Number.isInteger(numericGb)
    ? String(numericGb)
    : String(Number(numericGb.toFixed(2)));

  return `${formattedGb}GB`;
}

function buildTerabyteSearchRangeGb(terabytes) {
  const numericTb = normalizePositiveCapacity(terabytes);

  if (numericTb === null) {
    return null;
  }

  const targetGb = numericTb * BINARY_TB_GB;

  return {
    minGb: Math.ceil(targetGb * (1 - TB_NORMALIZATION_TOLERANCE)),
    maxGb: Math.floor(targetGb * (1 + TB_NORMALIZATION_TOLERANCE))
  };
}

function parseCapacitySearchTerm(value) {
  const term = String(value || '').trim();
  if (!term) return null;

  const keyedMatch = term.match(/^(memory|ram|m|storage|disk|s)\s*(?::|=|\s)\s*(\d+(?:\.\d+)?)\s*(gb|tb)?$/i);
  const displayMatch = term.match(/^(\d+(?:\.\d+)?)\s*(gb|tb)\s+(memory|ram|storage|disk)$/i);
  const match = keyedMatch || displayMatch;

  if (!match) return null;

  const fieldToken = keyedMatch ? match[1] : match[3];
  const numericToken = keyedMatch ? match[2] : match[1];
  const unitToken = String((keyedMatch ? match[3] : match[2]) || 'gb').toLowerCase();
  const numericValue = normalizePositiveCapacity(numericToken);

  if (numericValue === null) return null;

  const normalizedField = /^(memory|ram|m)$/i.test(fieldToken) ? 'memory' : 'storage';

  if (unitToken === 'tb') {
    const range = buildTerabyteSearchRangeGb(numericValue);
    return range ? { field: normalizedField, unit: 'tb', value: numericValue, ...range } : null;
  }

  return {
    field: normalizedField,
    unit: 'gb',
    value: numericValue,
    minGb: numericValue,
    maxGb: numericValue
  };
}

module.exports = {
  BINARY_TB_GB,
  TB_NORMALIZATION_TOLERANCE,
  buildTerabyteSearchRangeGb,
  formatBrowserCapacityGb,
  getNominalTerabyteCount,
  parseCapacitySearchTerm
};
