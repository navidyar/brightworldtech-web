'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getLotRequirementField,
  isOperatorAllowedForField,
  normalizeOperatorCode,
  normalizeRequirementKey,
  validateLotRequirementRegistry
} = require('./lotRequirementRegistry');

test('lot requirement registry is internally valid', () => {
  assert.deepEqual(validateLotRequirementRegistry(), []);
});

test('legacy field aliases normalize to persisted requirement type codes', () => {
  assert.equal(normalizeRequirementKey('ram_size'), 'ram_gb');
  assert.equal(normalizeRequirementKey('storage_size'), 'storage_gb');
  assert.equal(normalizeRequirementKey('processor_model'), 'processor');
});

test('legacy operator aliases normalize to configured comparison operator codes', () => {
  assert.equal(normalizeOperatorCode('minimum'), 'greater_equal');
  assert.equal(normalizeOperatorCode('maximum'), 'less_equal');
});

test('numeric operators are restricted to numeric requirement fields', () => {
  assert.equal(isOperatorAllowedForField('ram_gb', 'greater_equal'), true);
  assert.equal(isOperatorAllowedForField('manufacturer', 'greater_equal'), false);
  assert.equal(getLotRequirementField('manufacturer').storageKind, 'manufacturer');
});
