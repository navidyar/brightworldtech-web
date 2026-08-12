const DEFAULT_PASSWORD_LINK_EXPIRY_HOURS = 1;
const MIN_PASSWORD_LINK_EXPIRY_HOURS = 1;
const MAX_PASSWORD_LINK_EXPIRY_HOURS = 8;

function parsePasswordLinkExpiryHours(value) {
  const rawValue = String(value ?? '').trim();
  const hours = Number.parseInt(rawValue, 10);

  if (!/^\d+$/.test(rawValue) || !Number.isInteger(hours)) {
    return null;
  }

  if (hours < MIN_PASSWORD_LINK_EXPIRY_HOURS || hours > MAX_PASSWORD_LINK_EXPIRY_HOURS) {
    return null;
  }

  return hours;
}

function normalizePasswordLinkExpiryHours(value) {
  return parsePasswordLinkExpiryHours(value) ?? DEFAULT_PASSWORD_LINK_EXPIRY_HOURS;
}

module.exports = {
  DEFAULT_PASSWORD_LINK_EXPIRY_HOURS,
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  parsePasswordLinkExpiryHours,
  normalizePasswordLinkExpiryHours
};
