'use strict';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeManufacturerText(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeModelText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\b(?:model|series)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

module.exports = {
  normalizeText,
  normalizeManufacturerText,
  normalizeModelText
};
