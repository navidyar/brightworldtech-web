'use strict';

function extractCupsRequestId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const explicit = text.match(/request id is\s+([^\s(]+)/i);
  if (explicit) return explicit[1];
  const token = text.match(/\b([A-Za-z0-9_.-]+-\d+)\b/);
  return token ? token[1] : null;
}

function parseLpstatJobBlocks(output) {
  const blocks = new Map();
  let currentId = null;
  let currentLines = [];
  const flush = () => {
    if (currentId) blocks.set(currentId, currentLines.join('\n'));
    currentId = null;
    currentLines = [];
  };
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const match = line.match(/^(\S+-\d+)\s+/);
    if (match) {
      flush();
      currentId = match[1];
      currentLines = [line];
    } else if (currentId) {
      currentLines.push(line);
    }
  }
  flush();
  return blocks;
}

function completedBlockStatus(blockText) {
  const text = String(blockText || '').toLowerCase();
  if (/\b(aborted|canceled|cancelled|failed|stopped)\b/.test(text)) return 'failed';
  return 'sent';
}

function normalizeRequestOutputs(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function summarizeStates(states = []) {
  const normalized = states.map((entry) => String(entry?.status || 'unknown'));
  if (!normalized.length || normalized.some((status) => status === 'queued' || status === 'unknown')) return null;
  const sent = normalized.filter((status) => status === 'sent').length;
  const failed = normalized.filter((status) => status === 'failed').length;
  if (sent === normalized.length) return { status: 'sent', failureMessage: null };
  if (failed === normalized.length) return { status: 'failed', failureMessage: 'CUPS reported that the queued print job did not complete successfully.' };
  if (sent > 0 && failed > 0) return { status: 'partial', failureMessage: 'Some queued copies completed in CUPS while others did not.' };
  return null;
}

module.exports = {
  extractCupsRequestId,
  parseLpstatJobBlocks,
  completedBlockStatus,
  normalizeRequestOutputs,
  summarizeStates
};
