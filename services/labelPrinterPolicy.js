'use strict';

const net = require('node:net');
const dns = require('node:dns').promises;

const LABEL_PRINTER_SCOPES = Object.freeze(['managed', 'solo']);
const LABEL_PRINTER_PROTOCOLS = Object.freeze([
  Object.freeze({ code: 'raw_9100', label: 'RAW 9100', defaultPort: 9100 }),
  Object.freeze({ code: 'lpd', label: 'LPD', defaultPort: 515 }),
  Object.freeze({ code: 'ipp', label: 'IPP', defaultPort: 631 })
]);
const TECH_LEAD_PLUS_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead']);
const MANAGEMENT_PLUS_ROLE_CODES = Object.freeze(['admin', 'management']);

class LabelPrinterInputError extends Error {}

function hasAnyRole(roleCodes, allowed) {
  const roles = Array.isArray(roleCodes) ? roleCodes : [];
  return roles.some((role) => allowed.includes(String(role)));
}

function isTechLeadPlus(roleCodes) {
  return hasAnyRole(roleCodes, TECH_LEAD_PLUS_ROLE_CODES);
}

function isManagementPlus(roleCodes) {
  return hasAnyRole(roleCodes, MANAGEMENT_PLUS_ROLE_CODES);
}

function isPrivateIpv4(host) {
  if (net.isIP(host) !== 4) return false;
  const parts = host.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function normalizeHostAddress(value) {
  const host = String(value || '').trim();
  if (!isPrivateIpv4(host)) {
    throw new LabelPrinterInputError('Enter a private/local IPv4 printer address.');
  }
  return host;
}

function protocolByCode(code) {
  return LABEL_PRINTER_PROTOCOLS.find((protocol) => protocol.code === String(code || '').trim()) || null;
}

function normalizePrinterInput(input = {}, { scope = 'solo' } = {}) {
  if (!LABEL_PRINTER_SCOPES.includes(scope)) throw new LabelPrinterInputError('Invalid printer scope.');
  const displayName = String(input.displayName || '').trim();
  if (!displayName || displayName.length > 120) throw new LabelPrinterInputError('Printer name is required and must be 120 characters or fewer.');
  const hostAddress = normalizeHostAddress(input.hostAddress);
  const protocol = protocolByCode(input.protocolCode || 'raw_9100');
  if (!protocol) throw new LabelPrinterInputError('Select a supported printer protocol.');
  const port = Number(input.port || protocol.defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new LabelPrinterInputError('Printer port must be between 1 and 65535.');
  const dpi = input.dpi === '' || input.dpi === null || input.dpi === undefined ? null : Number(input.dpi);
  if (dpi !== null && (!Number.isInteger(dpi) || dpi < 100 || dpi > 2400)) throw new LabelPrinterInputError('Printer DPI must be between 100 and 2400.');

  return Object.freeze({
    scope,
    displayName,
    locationLabel: String(input.locationLabel || '').trim().slice(0, 160) || null,
    hostAddress,
    port,
    protocolCode: protocol.code,
    cupsQueueName: String(input.cupsQueueName || '').trim().slice(0, 128) || null,
    manufacturer: String(input.manufacturer || '').trim().slice(0, 80) || null,
    model: String(input.model || '').trim().slice(0, 120) || null,
    detectedDescription: String(input.detectedDescription || '').trim().slice(0, 255) || null,
    printerProfileCode: String(input.printerProfileCode || '').trim().slice(0, 64) || null,
    mediaCode: String(input.mediaCode || '').trim().slice(0, 64) || null,
    dpi,
    isShared: scope === 'managed' ? true : Boolean(input.isShared),
    isEnabled: input.isEnabled === undefined ? true : Boolean(input.isEnabled)
  });
}

function canUsePrinter(printer, userId, roleCodes) {
  if (!printer || Number(printer.is_enabled) !== 1) return false;
  if (String(printer.scope_code) === 'managed') return true;
  if (Number(printer.is_shared) === 1) return true;
  if (Number(printer.owner_user_id) === Number(userId)) return true;
  return isTechLeadPlus(roleCodes);
}

function canEditSoloPrinter(printer, userId, roleCodes) {
  if (!printer || String(printer.scope_code) !== 'solo') return false;
  return Number(printer.owner_user_id) === Number(userId) || isManagementPlus(roleCodes);
}

function canJoinPrinterGroup(printer) {
  if (!printer || Number(printer.is_enabled) !== 1) return false;
  return String(printer.scope_code) === 'managed' || Number(printer.is_shared) === 1;
}

function probeTcpPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(Boolean(reachable));
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function probePrinterHost(hostValue) {
  const hostAddress = normalizeHostAddress(hostValue);
  const checks = await Promise.all(LABEL_PRINTER_PROTOCOLS.map(async (protocol) => ({
    ...protocol,
    reachable: await probeTcpPort(hostAddress, protocol.defaultPort)
  })));
  let reverseName = null;
  if (net.isIP(hostAddress)) {
    try {
      const names = await dns.reverse(hostAddress);
      reverseName = names[0] || null;
    } catch (_) {}
  }
  const reachable = checks.filter((check) => check.reachable);
  return Object.freeze({
    hostAddress,
    reverseName,
    reachable: reachable.length > 0,
    protocols: checks,
    suggestedProtocolCode: reachable[0]?.code || 'raw_9100',
    suggestedPort: reachable[0]?.defaultPort || 9100
  });
}

module.exports = {
  LABEL_PRINTER_SCOPES,
  LABEL_PRINTER_PROTOCOLS,
  TECH_LEAD_PLUS_ROLE_CODES,
  MANAGEMENT_PLUS_ROLE_CODES,
  LabelPrinterInputError,
  isPrivateIpv4,
  normalizeHostAddress,
  normalizePrinterInput,
  protocolByCode,
  isTechLeadPlus,
  isManagementPlus,
  canUsePrinter,
  canEditSoloPrinter,
  canJoinPrinterGroup,
  probePrinterHost
};
