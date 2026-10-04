'use strict';

const DEFAULT_ASSET_TAG_PREFIX = 'BWT';
const ASSET_TAG_DIGITS = 10;
const ASSET_NUMBER_START = 1111;
const AMAZON_ASSET_TAG_PREFIX = 'AZ';
const AMAZON_ASSET_TAG_DIGITS = 9;

function getAssetTagPrefix(prefix = process.env.ASSET_TAG_PREFIX) {
  const normalized = String(prefix || DEFAULT_ASSET_TAG_PREFIX).trim().toUpperCase();
  return normalized || DEFAULT_ASSET_TAG_PREFIX;
}

function normalizePositiveAssetNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatAssetTagNumber(assetNumber, { prefix, digits = ASSET_TAG_DIGITS } = {}) {
  const normalizedAssetNumber = normalizePositiveAssetNumber(assetNumber);
  if (!normalizedAssetNumber) return '';

  const normalizedDigits = Number.isInteger(Number(digits)) && Number(digits) > 0
    ? Number(digits)
    : ASSET_TAG_DIGITS;

  return `${getAssetTagPrefix(prefix)}${String(normalizedAssetNumber).padStart(normalizedDigits, '0')}`;
}

function formatAmazonAssetTag(sequenceNumber) {
  const safeNumber = normalizePositiveAssetNumber(sequenceNumber);
  if (!safeNumber || safeNumber > 999999999) {
    throw new Error('Amazon Asset Tag sequence is outside the supported AZ000000001-AZ999999999 range.');
  }
  return `${AMAZON_ASSET_TAG_PREFIX}${String(safeNumber).padStart(AMAZON_ASSET_TAG_DIGITS, '0')}`;
}

function normalizeAmazonAssetTag(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return /^AZ\d{9}$/.test(normalized) ? normalized : '';
}

module.exports = {
  AMAZON_ASSET_TAG_DIGITS,
  AMAZON_ASSET_TAG_PREFIX,
  ASSET_NUMBER_START,
  ASSET_TAG_DIGITS,
  DEFAULT_ASSET_TAG_PREFIX,
  formatAmazonAssetTag,
  formatAssetTagNumber,
  getAssetTagPrefix,
  normalizeAmazonAssetTag,
  normalizePositiveAssetNumber
};
