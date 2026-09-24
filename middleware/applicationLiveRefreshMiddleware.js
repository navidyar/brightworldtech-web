'use strict';

const { publishApplicationLiveRefresh } = require('../services/applicationLiveRefreshEvents');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const NON_DATA_MUTATION_PATHS = Object.freeze([
  /^\/login$/,
  /^\/logout$/,
  /^\/setup-password$/,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/units\/resolve$/,
  /^\/management\/printers\/probe$/,
  /^\/tech\/printers\/probe$/,
  /^\/management\/label-library\/builder\/qr-preview$/,
  /^\/management\/label-library\/templates\/\d+\/builder\/test-print$/,
  /^\/management\/label-library\/templates\/\d+\/print$/,
  /^\/tech\/units\/lot-requirement-preview$/,
  /^\/tech\/units\/print-labels$/,
  /^\/tech\/units\/\d+\/print-label$/,
  /^\/tech\/units\/\d+\/intentional-duplicate-request\/modal$/,
  /^\/management\/virtual-huddle\/preview$/,
  /^\/virtual-huddle(?:\/|$)/,
  /^\/management\/virtual-huddle(?:\/|$)/
]);


function getApplicationMutationScope(path) {
  const normalizedPath = String(path || '').split('?')[0];

  if (/^\/unit-requests(?:\/|$)/.test(normalizedPath)
    || /^\/tech\/unit-catalog-requests(?:\/|$)/.test(normalizedPath)
    || /^\/api\/v1\/units\/catalog-requests(?:\/|$)/.test(normalizedPath)) {
    return 'requests';
  }

  if (/^\/tech\/units(?:\/|$)/.test(normalizedPath)
    || /^\/api\/v1\/units\/(?:commit|action)(?:\/|$)/.test(normalizedPath)
    || /^\/api\/v1\/units\/\d+\/wipe-certificates(?:\/|$)/.test(normalizedPath)) {
    return 'units';
  }

  if (/^\/(?:management|tech)\/printers(?:\/|$)/.test(normalizedPath)
    || /^\/management\/printer-groups(?:\/|$)/.test(normalizedPath)) {
    return 'printers';
  }

  if (/^\/management\/label-library(?:\/|$)/.test(normalizedPath)) return 'labels';
  if (/^\/management\/lots(?:\/|$)/.test(normalizedPath)) return 'lots';
  if (/^\/management\/config(?:\/|$)/.test(normalizedPath)) return 'config';
  if (/^\/management\/users(?:\/|$)/.test(normalizedPath)) return 'users';

  return 'application';
}

function normalizePositiveUnitId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getApplicationMutationUnitId(path, body = {}) {
  const normalizedPath = String(path || '').split('?')[0];
  const pathMatch = normalizedPath.match(/^\/tech\/units\/(\d+)(?:\/|$)/)
    || normalizedPath.match(/^\/api\/v1\/units\/(\d+)\/wipe-certificates(?:\/|$)/);

  if (pathMatch) return normalizePositiveUnitId(pathMatch[1]);

  if (/^\/api\/v1\/units\/(?:commit|action)(?:\/|$)/.test(normalizedPath)) {
    return normalizePositiveUnitId(body?.unit_id ?? body?.unitId);
  }

  return null;
}

function isSuccessfulMutationResponse(statusCode) {
  const status = Number(statusCode);
  return Number.isInteger(status) && status >= 200 && status < 400;
}

function isApplicationDataMutation(method, path) {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedPath = String(path || '').split('?')[0];

  if (!MUTATING_METHODS.has(normalizedMethod)) return false;
  return !NON_DATA_MUTATION_PATHS.some((pattern) => pattern.test(normalizedPath));
}

function publishSuccessfulApplicationMutations(req, res, next) {
  const method = req.method;
  const path = req.path || String(req.originalUrl || '').split('?')[0];

  if (!isApplicationDataMutation(method, path)) {
    return next();
  }

  res.once('finish', () => {
    if (!isSuccessfulMutationResponse(res.statusCode)) return;

    const scope = getApplicationMutationScope(path);

    publishApplicationLiveRefresh({
      reason: 'application-data-changed',
      scope,
      unitId: scope === 'units' ? getApplicationMutationUnitId(path, req.body) : null
    });
  });

  return next();
}

module.exports = {
  MUTATING_METHODS,
  NON_DATA_MUTATION_PATHS,
  getApplicationMutationScope,
  getApplicationMutationUnitId,
  isSuccessfulMutationResponse,
  isApplicationDataMutation,
  publishSuccessfulApplicationMutations
};
