'use strict';

const rawCatalog = require('../config/processorMetadataCatalog.json');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/[™®]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

const catalogEntries = Object.freeze(Object.entries(rawCatalog).map(([modelCode, metadata]) => Object.freeze({
  modelCode,
  brandName: normalizeText(metadata.brandName),
  processorFamily: normalizeText(metadata.processorFamily) || null,
  generation: normalizeText(metadata.generation) || null,
  baseSpeedGhz: metadata.baseSpeedGhz === null || metadata.baseSpeedGhz === undefined
    ? null
    : Number(metadata.baseSpeedGhz)
})));

const catalogByCode = new Map(catalogEntries.map((entry) => [normalizeKey(entry.modelCode), entry]));

function getProcessorMetadata(modelCode) {
  return catalogByCode.get(normalizeKey(modelCode)) || null;
}

function listProcessorMetadata() {
  return catalogEntries.slice();
}

module.exports = {
  getProcessorMetadata,
  listProcessorMetadata,
  normalizeKey,
  normalizeText
};
