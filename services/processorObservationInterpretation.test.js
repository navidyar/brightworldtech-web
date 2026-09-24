'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

process.env.DB_HOST ||= 'test';
process.env.DB_PORT ||= '3306';
process.env.DB_NAME ||= 'test';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'mysql2/promise') {
    return { createPool: () => ({}) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const processorCatalogModel = require('../models/processorCatalogModel');
Module._load = originalLoad;

test('interprets a natural Intel Core processor string into canonical catalog pieces', () => {
  const result = processorCatalogModel.interpretProcessorObservation({
    value: 'Intel(R) Core(TM) i9-10885H CPU @ 2.40GHz'
  });

  assert.equal(result.brandName, 'Intel');
  assert.equal(result.modelCode, 'i9-10885H');
  assert.equal(result.family, 'Core');
  assert.equal(result.generation, '10th Gen');
  assert.equal(result.baseSpeedGhz, 2.4);
  assert.equal(result.identity, 'i910885h');
});

test('reuses verified metadata when a natural observation matches a known catalog processor', () => {
  const result = processorCatalogModel.interpretProcessorObservation({
    value: 'Intel Xeon E-2176M CPU @ 2.70GHz'
  });

  assert.equal(result.brandName, 'Intel');
  assert.equal(result.modelCode, 'Xeon E-2176M');
  assert.equal(result.family, 'Xeon');
  assert.equal(result.generation, '8th Gen');
  assert.equal(result.baseSpeedGhz, 2.7);
  assert.equal(result.matchedMetadata, true);
});

test('interprets AMD Ryzen strings without dropping meaningful model-family text', () => {
  const result = processorCatalogModel.interpretProcessorObservation({
    value: 'AMD Ryzen 7 PRO 4750GE with Radeon Graphics @ 3.10GHz'
  });

  assert.equal(result.brandName, 'AMD');
  assert.equal(result.modelCode, 'Ryzen 7 PRO 4750GE');
  assert.equal(result.family, 'Ryzen');
  assert.equal(result.generation, '4000 Series');
  assert.equal(result.baseSpeedGhz, 3.1);
});

test('natural and canonical Intel Core strings normalize to the same processor identity', () => {
  assert.equal(
    processorCatalogModel.normalizeProcessorIdentity('Intel(R) Core(TM) i9-10885H CPU @ 2.40GHz', 'Intel'),
    processorCatalogModel.normalizeProcessorIdentity('i9-10885H', 'Intel')
  );
});

test('full observed string finds an existing canonical Processor Catalog entry', async () => {
  const matches = await processorCatalogModel.findLikelyProcessorMatches({
    brandName: 'Intel',
    modelCode: 'Intel(R) Core(TM) i9-10885H CPU @ 2.40GHz',
    processorOptions: [{
      id: 101,
      processorBrandId: 1,
      brandName: 'Intel',
      modelCode: 'i9-10885H',
      legacyFamily: 'Core',
      generation: '10th Gen',
      baseSpeedGhz: 2.4,
      isActive: true
    }]
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 101);
  assert.equal(matches[0].identityMatch, true);
});
