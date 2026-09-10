'use strict';

const DEFAULT_RECENT_PRINTS_MINUTES = 15;
const MIN_RECENT_PRINTS_MINUTES = 1;
const MAX_RECENT_PRINTS_MINUTES = 1440;
const DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES = 3;
const MIN_PRINT_SET_GROUPING_GAP_MINUTES = 1;
const MAX_PRINT_SET_GROUPING_GAP_MINUTES = 60;

function parseWholeMinutes(value, min, max) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const minutes = Number(normalized);
  return Number.isSafeInteger(minutes) && minutes >= min && minutes <= max ? minutes : null;
}

function parseRecentPrintsMinutes(value) {
  return parseWholeMinutes(value, MIN_RECENT_PRINTS_MINUTES, MAX_RECENT_PRINTS_MINUTES);
}

function parsePrintSetGroupingGapMinutes(value) {
  return parseWholeMinutes(value, MIN_PRINT_SET_GROUPING_GAP_MINUTES, MAX_PRINT_SET_GROUPING_GAP_MINUTES);
}

function normalizeLabelPrintSettings(input = {}) {
  return Object.freeze({
    recentPrintsMinutes: parseRecentPrintsMinutes(input.recentPrintsMinutes) ?? DEFAULT_RECENT_PRINTS_MINUTES,
    printSetGroupingGapMinutes: parsePrintSetGroupingGapMinutes(input.printSetGroupingGapMinutes) ?? DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES
  });
}

module.exports = {
  DEFAULT_RECENT_PRINTS_MINUTES,
  MIN_RECENT_PRINTS_MINUTES,
  MAX_RECENT_PRINTS_MINUTES,
  DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES,
  MIN_PRINT_SET_GROUPING_GAP_MINUTES,
  MAX_PRINT_SET_GROUPING_GAP_MINUTES,
  parseRecentPrintsMinutes,
  parsePrintSetGroupingGapMinutes,
  normalizeLabelPrintSettings
};
