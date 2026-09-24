'use strict';

const { spawn } = require('node:child_process');
const labelPrinterModel = require('../models/labelPrinterModel');
const { canUsePrinter, probeTcpPort } = require('./labelPrinterPolicy');
const {
  rankPrinterRouteCandidates,
  parseCupsPrinterNames,
  parseCupsQueueDepths
} = require('./labelPrinterRoutingPolicy');
const { extractCupsRequestId, parseLpstatJobBlocks, completedBlockStatus } = require('./labelPrintCupsStatusPolicy');
const { printerSubmissionLockKey, withPrinterSubmissionLock } = require('./labelPrinterSubmissionLock');

const REGISTRY_ID_PREFIX = 'registry-';
const GROUP_ID_PREFIX = 'group-';
const AUTO_QUEUE_PREFIX = 'BWT_LabelPrinter_';
const CUPS_COMMAND_TIMEOUT_MS = 5000;
const CUPS_ADMIN_COMMAND_TIMEOUT_MS = 20000;
const PRINTER_PROBE_INITIAL_TIMEOUT_MS = 1800;
const PRINTER_PROBE_FAST_ROUTE_TIMEOUT_MS = 500;
const PRINTER_PROBE_RETRY_TIMEOUT_MS = 3500;
const CUPS_ROUTE_STATUS_TIMEOUT_MS = 1500;
const abortPolicyQueues = new Set();
const automaticQueueSignatures = new Set();

class LabelPrinterUnavailableError extends Error {}
class LabelPrinterRuntimeError extends Error {}

function buildRegistryPrinterId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Printer ID must be a positive integer.');
  return `${REGISTRY_ID_PREFIX}${id}`;
}


function buildPrinterGroupId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Printer group ID must be a positive integer.');
  return `${GROUP_ID_PREFIX}${id}`;
}

function parsePrinterGroupId(value) {
  const match = String(value || '').trim().match(/^group-(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseRegistryPrinterId(value) {
  const match = String(value || '').trim().match(/^registry-(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function buildPrinterLabel(name, location) {
  const safeName = String(name || '').trim() || 'Label Printer';
  const safeLocation = String(location || '').trim();
  return safeLocation ? `${safeName} · ${safeLocation}` : safeName;
}
function mapRegistryPrinterToPrintOption(row) {
  const registryPrinterId = Number(row.label_printer_id);
  return Object.freeze({
    id: buildRegistryPrinterId(registryPrinterId),
    registryPrinterId,
    label: buildPrinterLabel(row.display_name, row.location_label),
    name: String(row.display_name || 'Label Printer'),
    location: String(row.location_label || ''),
    host: String(row.host_address || ''),
    port: Number(row.port) || 9100,
    protocolCode: String(row.protocol_code || 'raw_9100'),
    queue: String(row.cups_queue_name || '').trim() || null,
    manufacturer: String(row.manufacturer || ''),
    model: String(row.model || ''),
    printerProfileCode: String(row.printer_profile_code || ''),
    mediaCode: String(row.media_code || ''),
    dpi: row.dpi === null || row.dpi === undefined ? null : Number(row.dpi),
    scopeCode: String(row.scope_code || ''),
    ownerUserId: row.owner_user_id === null || row.owner_user_id === undefined ? null : Number(row.owner_user_id),
    isShared: Number(row.is_shared) === 1,
    kind: 'printer',
    lifetimePrintCount: Number(row.lifetime_print_count || 0),
    groupSortOrder: Number(row.group_sort_order || 0),
    lastProbeStatus: String(row.last_probe_status || '') || null,
    lastProbeAt: row.last_probe_at || null,
    endpoint: `${String(row.protocol_code || 'raw_9100')}://${String(row.host_address || '')}:${Number(row.port) || 9100}`
  });
}

function isRegistryRowPrintCapable(row) {
  if (!row || Number(row.is_enabled) !== 1) return false;
  if (String(row.cups_queue_name || '').trim()) return true;
  return String(row.protocol_code || '') === 'raw_9100';
}

async function listPrintPrintersForUser({ userId, roleCodes = [] }) {
  try {
    const rows = await labelPrinterModel.listAvailablePrintersForUser({ userId, roleCodes });
    return Object.freeze(rows.filter(isRegistryRowPrintCapable).map(mapRegistryPrinterToPrintOption));
  } catch (error) {
    console.warn('Label printer registry unavailable:', error.message);
    return Object.freeze([]);
  }
}

async function listPrintDestinationsForUser({ userId, roleCodes = [] }) {
  const printers = await listPrintPrintersForUser({ userId, roleCodes });
  const rows = await labelPrinterModel.listRoutingGroupRows();
  const groups = new Map();
  for (const row of rows) {
    if (!canUsePrinter(row, userId, roleCodes)) continue;
    const groupId = Number(row.label_printer_group_id);
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: buildPrinterGroupId(groupId),
        kind: 'group',
        registryGroupId: groupId,
        label: `Group · ${String(row.group_name || `Printer Group ${groupId}`)}`,
        name: String(row.group_name || `Printer Group ${groupId}`),
        description: String(row.group_description || ''),
        members: []
      });
    }
    groups.get(groupId).members.push(mapRegistryPrinterToPrintOption(row));
  }

  return Object.freeze([
    ...[...groups.values()].filter((group) => group.members.length > 0).map((group) => Object.freeze({ ...group, members: Object.freeze(group.members) })),
    ...printers
  ]);
}

async function resolvePrintDestinationForUser({ destinationId, userId, roleCodes = [] }) {
  const safeId = String(destinationId || '').trim();
  const groupId = parsePrinterGroupId(safeId);
  if (groupId) {
    const destinations = await listPrintDestinationsForUser({ userId, roleCodes });
    return destinations.find((destination) => destination.kind === 'group' && destination.registryGroupId === groupId) || null;
  }
  return resolvePrintPrinterForUser({ printerId: safeId, userId, roleCodes });
}

async function resolvePrintPrinterForUser({ printerId, userId, roleCodes = [] }) {
  const registryPrinterId = parseRegistryPrinterId(printerId);
  if (registryPrinterId) {
    const row = await labelPrinterModel.getPrinterById(registryPrinterId);
    if (!row || !canUsePrinter(row, userId, roleCodes) || !isRegistryRowPrintCapable(row)) return null;
    return mapRegistryPrinterToPrintOption(row);
  }

  return null;
}

function runCupsCommand(command, args, timeoutMs = CUPS_COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new LabelPrinterRuntimeError(`${command} timed out.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new LabelPrinterRuntimeError(`${command} could not be started: ${error.message}`));
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new LabelPrinterRuntimeError(String(stderr || stdout || `${command} exited with code ${code}.`).trim().slice(0, 1000)));
        return;
      }
      resolve(Object.freeze({ stdout: stdout.trim(), stderr: stderr.trim() }));
    });
  });
}

function automaticQueueName(registryPrinterId) {
  const id = Number(registryPrinterId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Registry printer ID is required for automatic CUPS provisioning.');
  return `${AUTO_QUEUE_PREFIX}${id}`;
}

function isAutomaticQueueName(queue, registryPrinterId) {
  return String(queue || '') === automaticQueueName(registryPrinterId);
}

async function cupsQueueExists(queue) {
  if (!queue) return false;
  try {
    await runCupsCommand('/usr/bin/lpstat', ['-p', String(queue)]);
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureAbortJobPolicy(queue) {
  const safeQueue = String(queue || '').trim();
  if (!safeQueue) throw new LabelPrinterRuntimeError('A CUPS queue is required.');
  if (abortPolicyQueues.has(safeQueue)) return;
  await runCupsCommand('/usr/sbin/lpadmin', [
    '-p', safeQueue,
    '-o', 'printer-error-policy=abort-job'
  ], CUPS_ADMIN_COMMAND_TIMEOUT_MS);
  abortPolicyQueues.add(safeQueue);
}

async function ensureCupsQueue(printer) {
  if (!printer) throw new LabelPrinterRuntimeError('The selected printer is not available.');

  let queue = String(printer.queue || '').trim();
  if (!printer.registryPrinterId) throw new LabelPrinterRuntimeError('The selected registry printer is missing its printer ID.');

  const isRaw = String(printer.protocolCode) === 'raw_9100';
  const queueExistsHintUsable = Boolean(queue)
    && printer.cupsQueueExistsKnown === true
    && typeof printer.cupsQueueExists === 'boolean';
  const queueExists = queue
    ? (queueExistsHintUsable ? printer.cupsQueueExists : await cupsQueueExists(queue))
    : false;

  if (queue && !isAutomaticQueueName(queue, printer.registryPrinterId)) {
    if (!queueExists) throw new LabelPrinterRuntimeError(`The configured CUPS queue “${queue}” is not available.`);
    await ensureAbortJobPolicy(queue);
    return printer;
  }
  if (!isRaw) {
    throw new LabelPrinterRuntimeError('This printer needs a configured CUPS queue before BWTDallas can print to it.');
  }

  if (!queue) queue = automaticQueueName(printer.registryPrinterId);
  const deviceUri = `socket://${printer.host}:${printer.port}`;
  const automaticQueueSignature = `${queue}|${deviceUri}`;
  if (queueExists && automaticQueueSignatures.has(automaticQueueSignature)) {
    await ensureAbortJobPolicy(queue);
    return Object.freeze({ ...printer, queue });
  }
  await runCupsCommand('/usr/sbin/lpadmin', [
    '-p', queue,
    '-E',
    '-v', deviceUri,
    '-m', 'raw',
    '-o', 'printer-error-policy=abort-job'
  ], CUPS_ADMIN_COMMAND_TIMEOUT_MS);
  abortPolicyQueues.add(queue);
  automaticQueueSignatures.add(automaticQueueSignature);

  if (String(printer.queue || '') !== queue) {
    await labelPrinterModel.setPrinterCupsQueue(printer.registryPrinterId, queue);
  }

  return Object.freeze({ ...printer, queue });
}

async function recordPrinterReachability(printer, reachable, details = {}) {
  if (!printer?.registryPrinterId) return;
  try {
    await labelPrinterModel.recordPrinterProbe(printer.registryPrinterId, {
      status: reachable ? 'reachable' : 'offline',
      details: {
        protocolCode: printer.protocolCode,
        hostAddress: printer.host,
        port: printer.port,
        ...details
      }
    });
  } catch (error) {
    console.warn('Printer probe status could not be recorded:', error.message);
  }
}

async function probePrinterOnce(printer, timeoutMs) {
  if (!printer?.host || !printer?.port) {
    return false;
  }
  return probeTcpPort(printer.host, printer.port, timeoutMs);
}

async function assertPrinterOnline(printer) {
  if (!printer?.host || !printer?.port) {
    throw new LabelPrinterUnavailableError('The selected printer does not have a valid network endpoint.');
  }

  let reachable = await probePrinterOnce(printer, PRINTER_PROBE_INITIAL_TIMEOUT_MS);
  let attempts = 1;
  if (!reachable) {
    reachable = await probePrinterOnce(printer, PRINTER_PROBE_RETRY_TIMEOUT_MS);
    attempts = 2;
  }

  await recordPrinterReachability(printer, reachable, {
    source: 'print_preflight',
    attempts,
    initialTimeoutMs: PRINTER_PROBE_INITIAL_TIMEOUT_MS,
    retryTimeoutMs: attempts > 1 ? PRINTER_PROBE_RETRY_TIMEOUT_MS : null
  });

  if (!reachable) {
    throw new LabelPrinterUnavailableError(`${printer.label} is offline or unreachable. No print job was sent to CUPS.`);
  }
  return true;
}


async function getCupsRequestStates(requests = []) {
  const normalized = [];
  for (const request of Array.isArray(requests) ? requests : []) {
    const requestId = extractCupsRequestId(request?.requestOutput || request?.requestId);
    const queue = String(request?.queue || '').trim();
    if (!requestId || !queue) {
      normalized.push(Object.freeze({ ...request, requestId, status: 'unknown' }));
      continue;
    }
    normalized.push({ ...request, requestId, queue });
  }

  const queueNames = [...new Set(normalized.filter((entry) => entry.requestId && entry.queue).map((entry) => entry.queue))];
  const queueStates = new Map();
  await Promise.all(queueNames.map(async (queue) => {
    try {
      const [pending, completed] = await Promise.all([
        runCupsCommand('/usr/bin/lpstat', ['-W', 'not-completed', '-o', queue], CUPS_ROUTE_STATUS_TIMEOUT_MS),
        runCupsCommand('/usr/bin/lpstat', ['-W', 'completed', '-l', '-o', queue], CUPS_ROUTE_STATUS_TIMEOUT_MS)
      ]);
      const pendingIds = new Set(parseLpstatJobBlocks(pending.stdout).keys());
      const completedBlocks = parseLpstatJobBlocks(completed.stdout);
      queueStates.set(queue, { pendingIds, completedBlocks });
    } catch (error) {
      queueStates.set(queue, null);
    }
  }));

  return Object.freeze(normalized.map((entry) => {
    if (!entry.requestId || !entry.queue) return Object.freeze({ ...entry, status: 'unknown' });
    const state = queueStates.get(entry.queue);
    if (!state) return Object.freeze({ ...entry, status: 'unknown' });
    if (state.pendingIds.has(entry.requestId)) return Object.freeze({ ...entry, status: 'queued' });
    if (state.completedBlocks.has(entry.requestId)) {
      return Object.freeze({
        ...entry,
        status: completedBlockStatus(state.completedBlocks.get(entry.requestId))
      });
    }
    return Object.freeze({ ...entry, status: 'unknown' });
  }));
}

async function getPrinterQueueLoad(printer) {
  const queue = String(printer?.queue || '').trim();
  if (!queue) {
    return Object.freeze({ queueStatusKnown: true, queueDepth: 0, needsProvisioning: true });
  }
  try {
    const result = await runCupsCommand('/usr/bin/lpstat', ['-o', queue], CUPS_ROUTE_STATUS_TIMEOUT_MS);
    const queueDepth = String(result.stdout || '').split(/\r?\n/).filter((line) => line.trim()).length;
    return Object.freeze({ queueStatusKnown: true, queueDepth, needsProvisioning: false });
  } catch (_) {
    return Object.freeze({ queueStatusKnown: false, queueDepth: 0, needsProvisioning: false });
  }
}

async function getPrinterQueueLoads(printers = []) {
  const list = Array.isArray(printers) ? printers : [];
  let printerNames = null;
  let queueDepths = null;
  await Promise.all([
    runCupsCommand('/usr/bin/lpstat', ['-p'], CUPS_ROUTE_STATUS_TIMEOUT_MS)
      .then((result) => { printerNames = parseCupsPrinterNames(result.stdout); })
      .catch(() => {}),
    runCupsCommand('/usr/bin/lpstat', ['-o'], CUPS_ROUTE_STATUS_TIMEOUT_MS)
      .then((result) => { queueDepths = parseCupsQueueDepths(result.stdout); })
      .catch(() => {})
  ]);

  return list.map((printer) => {
    const queue = String(printer?.queue || '').trim();
    if (!queue) {
      return Object.freeze({
        queueStatusKnown: true,
        queueDepth: 0,
        needsProvisioning: true,
        cupsQueueExistsKnown: true,
        cupsQueueExists: false
      });
    }

    const existsKnown = printerNames instanceof Set;
    const exists = existsKnown ? printerNames.has(queue) : null;
    const depthKnown = queueDepths instanceof Map;
    const automaticMissing = existsKnown && !exists
      && printer?.registryPrinterId
      && isAutomaticQueueName(queue, printer.registryPrinterId)
      && String(printer.protocolCode) === 'raw_9100';

    return Object.freeze({
      queueStatusKnown: automaticMissing ? true : Boolean(exists && depthKnown),
      queueDepth: exists && depthKnown ? Number(queueDepths.get(queue) || 0) : 0,
      needsProvisioning: Boolean(automaticMissing),
      cupsQueueExistsKnown: existsKnown,
      cupsQueueExists: existsKnown ? Boolean(exists) : false
    });
  });
}

async function rankAvailablePrinters(printers = []) {
  const unique = [];
  const seen = new Set();
  for (const printer of Array.isArray(printers) ? printers : []) {
    const id = Number(printer?.registryPrinterId || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(printer);
  }

  const currentRows = await labelPrinterModel.getPrintersByIds(unique.map((printer) => printer.registryPrinterId));
  const currentById = new Map(currentRows.map((row) => [Number(row.label_printer_id), row]));
  const refreshed = unique.map((printer) => {
    const row = currentById.get(Number(printer.registryPrinterId));
    if (!row || Number(row.is_enabled) !== 1) return null;
    return Object.freeze({
      ...mapRegistryPrinterToPrintOption({ ...row, group_sort_order: printer.groupSortOrder }),
      groupSortOrder: printer.groupSortOrder
    });
  }).filter(Boolean);

  const fastReachability = await Promise.all(
    refreshed.map((printer) => probePrinterOnce(printer, PRINTER_PROBE_FAST_ROUTE_TIMEOUT_MS))
  );
  const useRetryPass = !fastReachability.some(Boolean) && refreshed.length > 0;
  const finalReachability = useRetryPass
    ? await Promise.all(refreshed.map((printer) => probePrinterOnce(printer, PRINTER_PROBE_RETRY_TIMEOUT_MS)))
    : fastReachability;

  await Promise.all(refreshed.map((printer, index) => {
    if (!useRetryPass && !finalReachability[index]) return Promise.resolve();
    return recordPrinterReachability(printer, finalReachability[index], {
      source: 'group_route',
      attempts: useRetryPass ? 2 : 1,
      fastTimeoutMs: PRINTER_PROBE_FAST_ROUTE_TIMEOUT_MS,
      retryTimeoutMs: useRetryPass ? PRINTER_PROBE_RETRY_TIMEOUT_MS : null
    });
  }));

  const online = refreshed.filter((_, index) => finalReachability[index]);
  const queueLoads = await getPrinterQueueLoads(online);
  const candidates = online.map((printer, index) => ({
    ...printer,
    ...queueLoads[index]
  }));
  return Object.freeze(rankPrinterRouteCandidates(candidates).map((candidate) => Object.freeze(candidate)));
}

async function preparePrinterForSubmission(printer) {
  if (!printer) throw new LabelPrinterRuntimeError('Select an available label printer.');
  await assertPrinterOnline(printer);
  return ensureCupsQueue(printer);
}

async function recordQueuedCopies(printer, copies) {
  const safeCopies = Math.max(0, Number(copies) || 0);
  if (!printer?.registryPrinterId || safeCopies <= 0) return;
  await labelPrinterModel.recordPrinterQueuedCopies(printer.registryPrinterId, safeCopies);
}


module.exports = {
  REGISTRY_ID_PREFIX,
  GROUP_ID_PREFIX,
  AUTO_QUEUE_PREFIX,
  LabelPrinterUnavailableError,
  LabelPrinterRuntimeError,
  buildRegistryPrinterId,
  buildPrinterGroupId,
  parsePrinterGroupId,
  parseRegistryPrinterId,
  mapRegistryPrinterToPrintOption,
  isRegistryRowPrintCapable,
  listPrintPrintersForUser,
  listPrintDestinationsForUser,
  resolvePrintPrinterForUser,
  resolvePrintDestinationForUser,
  automaticQueueName,
  isAutomaticQueueName,
  cupsQueueExists,
  ensureAbortJobPolicy,
  ensureCupsQueue,
  assertPrinterOnline,
  getPrinterQueueLoad,
  getCupsRequestStates,
  rankAvailablePrinters,
  preparePrinterForSubmission,
  recordQueuedCopies,
  printerSubmissionLockKey,
  withPrinterSubmissionLock
};
