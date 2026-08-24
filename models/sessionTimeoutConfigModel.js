'use strict';

const { getConfigValueBySystemId } = require('./configLookupModel');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  normalizeSessionInactivityTimeoutMinutes
} = require('../services/sessionInactivityTimeoutPolicy');

const CACHE_TTL_MS = 30 * 1000;
let cachedMinutes = null;
let cacheExpiresAt = 0;

function setCachedSessionInactivityTimeoutMinutes(value) {
  cachedMinutes = normalizeSessionInactivityTimeoutMinutes(value);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cachedMinutes;
}

function clearSessionInactivityTimeoutCache() {
  cachedMinutes = null;
  cacheExpiresAt = 0;
}

async function getConfiguredSessionInactivityTimeoutMinutes(options = {}) {
  const now = Date.now();

  if (!options.forceRefresh && Number.isInteger(cachedMinutes) && now < cacheExpiresAt) {
    return cachedMinutes;
  }

  try {
    const value = await getConfigValueBySystemId(SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES);
    return setCachedSessionInactivityTimeoutMinutes(value?.value);
  } catch (error) {
    console.warn('Session inactivity timeout configuration could not be loaded; using the 120-minute default.', error.message || error);
    cachedMinutes = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cachedMinutes;
  }
}

module.exports = {
  CACHE_TTL_MS,
  getConfiguredSessionInactivityTimeoutMinutes,
  setCachedSessionInactivityTimeoutMinutes,
  clearSessionInactivityTimeoutCache
};
