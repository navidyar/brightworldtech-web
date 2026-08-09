'use strict';

const CATALOG_REQUEST_ROLE_CODES = new Set(['admin', 'management', 'tech_lead', 'tech']);

function normalizeRoleCodes(roleCodes) {
  return Array.isArray(roleCodes)
    ? roleCodes.map((roleCode) => String(roleCode || '').trim()).filter(Boolean)
    : [];
}

function canSubmitCatalogRequest(roleCodes) {
  return normalizeRoleCodes(roleCodes)
    .some((roleCode) => CATALOG_REQUEST_ROLE_CODES.has(roleCode));
}

function canSubmitCatalogRequestFromRequest(req) {
  return canSubmitCatalogRequest(
    req && req.currentUser && Array.isArray(req.currentUser.roles)
      ? req.currentUser.roles
      : []
  );
}

module.exports = {
  CATALOG_REQUEST_ROLE_CODES,
  normalizeRoleCodes,
  canSubmitCatalogRequest,
  canSubmitCatalogRequestFromRequest
};
