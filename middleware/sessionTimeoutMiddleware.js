'use strict';

const {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES
} = require('../services/sessionInactivityTimeoutPolicy');
const {
  getConfiguredSessionInactivityTimeoutMinutes
} = require('../models/sessionTimeoutConfigModel');

async function applyConfiguredSessionTimeout(req, res, next) {
  try {
    const minutes = await getConfiguredSessionInactivityTimeoutMinutes();
    const timeoutMs = minutes * 60 * 1000;

    req.sessionInactivityTimeoutMinutes = minutes;
    req.sessionInactivityTimeoutMs = timeoutMs;

    if (req.session?.cookie) {
      req.session.cookie.maxAge = timeoutMs;
    }

    return next();
  } catch (error) {
    const fallbackMs = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    req.sessionInactivityTimeoutMinutes = DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES;
    req.sessionInactivityTimeoutMs = fallbackMs;

    if (req.session?.cookie) {
      req.session.cookie.maxAge = fallbackMs;
    }

    return next();
  }
}

module.exports = {
  applyConfiguredSessionTimeout
};
