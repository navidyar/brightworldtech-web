'use strict';

const DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES = 120;
const MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES = 5;
const MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES = 24 * 60;

function parseSessionInactivityTimeoutMinutes(value) {
  const rawValue = String(value ?? '').trim();
  const minutes = Number.parseInt(rawValue, 10);

  if (!/^\d+$/.test(rawValue) || !Number.isInteger(minutes)) {
    return null;
  }

  if (minutes < MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES || minutes > MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES) {
    return null;
  }

  return minutes;
}

function normalizeSessionInactivityTimeoutMinutes(value) {
  return parseSessionInactivityTimeoutMinutes(value) ?? DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES;
}

function formatSessionInactivityTimeout(minutes) {
  const normalized = normalizeSessionInactivityTimeoutMinutes(minutes);

  if (normalized % 60 === 0) {
    const hours = normalized / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  if (normalized > 60) {
    const hours = Math.floor(normalized / 60);
    const remainingMinutes = normalized % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${normalized} minute${normalized === 1 ? '' : 's'}`;
}

module.exports = {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  parseSessionInactivityTimeoutMinutes,
  normalizeSessionInactivityTimeoutMinutes,
  formatSessionInactivityTimeout
};
