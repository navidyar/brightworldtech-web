'use strict';

const UNIT_API_ROLE_CODES = new Set(['admin', 'management', 'tech_lead', 'tech']);

function normalizeRoleCodes(user) {
  return Array.isArray(user && user.roles)
    ? user.roles.map((roleCode) => String(roleCode || '').trim()).filter(Boolean)
    : [];
}

function canUseUnitApi(user) {
  return normalizeRoleCodes(user).some((roleCode) => UNIT_API_ROLE_CODES.has(roleCode));
}

module.exports = {
  UNIT_API_ROLE_CODES,
  normalizeRoleCodes,
  canUseUnitApi
};
