'use strict';

const crypto = require('crypto');

const TOOL_SOURCES = Object.freeze({
  SCANTOOL: 'scantool',
  TECHTOOLS: 'techtools'
});

const TOOL_SECRET_ENV = Object.freeze({
  [TOOL_SOURCES.SCANTOOL]: 'SCANTOOLS_API_SECRET',
  [TOOL_SOURCES.TECHTOOLS]: 'TECHTOOLS_API_SECRET'
});

function digestSecret(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest();
}

function secretsMatch(left, right) {
  if (!left || !right) return false;
  return crypto.timingSafeEqual(digestSecret(left), digestSecret(right));
}

function getConfiguredSecrets(env = process.env) {
  return Object.fromEntries(
    Object.entries(TOOL_SECRET_ENV).map(([source, envKey]) => [source, String(env[envKey] || '').trim()])
  );
}

function getToolCredentialConfigurationError(env = process.env) {
  const configured = getConfiguredSecrets(env);
  const missing = Object.entries(configured)
    .filter(([, secret]) => !secret)
    .map(([source]) => TOOL_SECRET_ENV[source]);

  if (missing.length) {
    return `Missing required API tool secret(s): ${missing.join(', ')}.`;
  }

  if (secretsMatch(configured[TOOL_SOURCES.SCANTOOL], configured[TOOL_SOURCES.TECHTOOLS])) {
    return 'SCANTOOLS_API_SECRET and TECHTOOLS_API_SECRET must be different.';
  }

  return null;
}

function resolveToolSource(rawSecret, env = process.env) {
  const configurationError = getToolCredentialConfigurationError(env);
  if (configurationError) {
    const error = new Error(configurationError);
    error.code = 'API_TOOL_CREDENTIAL_CONFIGURATION';
    throw error;
  }

  const provided = String(rawSecret || '').trim();
  if (!provided) return null;

  const configured = getConfiguredSecrets(env);
  if (secretsMatch(provided, configured[TOOL_SOURCES.SCANTOOL])) return TOOL_SOURCES.SCANTOOL;
  if (secretsMatch(provided, configured[TOOL_SOURCES.TECHTOOLS])) return TOOL_SOURCES.TECHTOOLS;
  return null;
}

module.exports = {
  TOOL_SOURCES,
  TOOL_SECRET_ENV,
  getToolCredentialConfigurationError,
  resolveToolSource
};
