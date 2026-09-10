'use strict';

const crypto = require('crypto');

const DEFAULT_API_SESSION_HOURS = 12;
const MIN_API_SESSION_HOURS = 1;
const MAX_API_SESSION_HOURS = 24;

function hashApiToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex');
}

function createApiToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getApiSessionHours(env = process.env) {
  const requested = Number.parseInt(String(env.BWT_API_SESSION_HOURS || ''), 10);
  if (!Number.isFinite(requested)) return DEFAULT_API_SESSION_HOURS;
  return Math.min(MAX_API_SESSION_HOURS, Math.max(MIN_API_SESSION_HOURS, requested));
}

function getApiSessionExpiry(env = process.env, now = new Date()) {
  return new Date(now.getTime() + (getApiSessionHours(env) * 60 * 60 * 1000));
}

module.exports = {
  DEFAULT_API_SESSION_HOURS,
  MIN_API_SESSION_HOURS,
  MAX_API_SESSION_HOURS,
  hashApiToken,
  createApiToken,
  getApiSessionHours,
  getApiSessionExpiry
};
