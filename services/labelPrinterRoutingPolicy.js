'use strict';

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function routeTuple(candidate = {}) {
  return [
    candidate.queueStatusKnown === false ? 1 : 0,
    Math.max(0, numeric(candidate.queueDepth, 0)),
    candidate.needsProvisioning ? 1 : 0,
    Math.max(0, numeric(candidate.lifetimePrintCount, 0)),
    Math.max(0, numeric(candidate.groupSortOrder, 0)),
    Math.max(0, numeric(candidate.registryPrinterId, 0))
  ];
}

function comparePrinterRouteCandidates(left, right) {
  const a = routeTuple(left);
  const b = routeTuple(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return String(left.label || '').localeCompare(String(right.label || ''));
}

function rankPrinterRouteCandidates(candidates = []) {
  return [...candidates].sort(comparePrinterRouteCandidates);
}

function parseCupsPrinterNames(output = '') {
  const names = new Set();
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^printer\s+(\S+)\s+/);
    if (match) names.add(match[1]);
  }
  return names;
}

function parseCupsQueueDepths(output = '') {
  const depths = new Map();
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^(.+)-(\d+)\s+/);
    if (!match) continue;
    depths.set(match[1], Number(depths.get(match[1]) || 0) + 1);
  }
  return depths;
}

module.exports = {
  routeTuple,
  comparePrinterRouteCandidates,
  rankPrinterRouteCandidates,
  parseCupsPrinterNames,
  parseCupsQueueDepths
};
