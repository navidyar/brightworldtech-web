'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyProcessorFamilyCodes,
  getIntelCoreGeneration,
  ordinal
} = require('./processorFamilyClassifier');

test('classifies Intel Core tier and generation families from common model names', () => {
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Intel Core i5-1255U' }), ['intel-i5-12th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i5-1260P' }), ['intel-i5-12th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i7-8650U' }), ['intel-i7-8th-gen']);
});

test('classifies AMD Ryzen tier and series without separating PRO variants', () => {
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'AMD', modelCode: 'Ryzen 5 PRO 7540U' }), ['amd-ryzen-5-7000-series']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'AMD', modelCode: 'Ryzen 7 8840U' }), ['amd-ryzen-7-8000-series']);
});

test('classifies Apple, Qualcomm, MediaTek, and Rockchip families', () => {
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Apple', modelCode: 'Apple M3 Max' }), ['apple-m3-family']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Qualcomm', modelCode: 'Snapdragon X Elite' }), ['qualcomm-snapdragon-x']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'MediaTek', modelCode: 'Kompanio 820' }), ['mediatek-kompanio']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Rockchip', modelCode: 'RK3399' }), ['rockchip-rk33xx']);
});

test('leaves ambiguous processor names uncategorized instead of guessing', () => {
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Generic Mobile CPU' }), []);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Unknown', modelCode: 'Ryzen 5 7530U' }), []);
});

test('Intel generation helpers handle four and five digit model numbers', () => {
  assert.equal(getIntelCoreGeneration('8350'), 8);
  assert.equal(getIntelCoreGeneration('1255'), 12);
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(13), '13th');
});
