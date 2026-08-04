'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseHardwareCapacityToGb,
  formatHardwareCapacityGb,
  normalizeHardwareCapacityForStorage
} = require('./hardwareCapacity');

test('capacity parser accepts GB, TB, case-insensitive units, and bare GB values', () => {
  assert.deepEqual(parseHardwareCapacityToGb('0'), { valid: true, gb: 0, canonical: '0GB' });
  assert.deepEqual(parseHardwareCapacityToGb('0GB'), { valid: true, gb: 0, canonical: '0GB' });
  assert.deepEqual(parseHardwareCapacityToGb('16'), { valid: true, gb: 16, canonical: '16GB' });
  assert.deepEqual(parseHardwareCapacityToGb('512GB'), { valid: true, gb: 512, canonical: '512GB' });
  assert.deepEqual(parseHardwareCapacityToGb('1tb'), { valid: true, gb: 1024, canonical: '1TB' });
  assert.deepEqual(parseHardwareCapacityToGb('2 TB'), { valid: true, gb: 2048, canonical: '2TB' });
  assert.deepEqual(parseHardwareCapacityToGb('1.5TB'), { valid: true, gb: 1536, canonical: '1.5TB' });
});

test('capacity parser normalizes common decimal and binary GB entries to TB', () => {
  assert.deepEqual(parseHardwareCapacityToGb('1000'), { valid: true, gb: 1024, canonical: '1TB' });
  assert.deepEqual(parseHardwareCapacityToGb('1024'), { valid: true, gb: 1024, canonical: '1TB' });
  assert.deepEqual(parseHardwareCapacityToGb('1000GB'), { valid: true, gb: 1024, canonical: '1TB' });
  assert.deepEqual(parseHardwareCapacityToGb('2000'), { valid: true, gb: 2048, canonical: '2TB' });
  assert.deepEqual(parseHardwareCapacityToGb('2048GB'), { valid: true, gb: 2048, canonical: '2TB' });
  assert.deepEqual(parseHardwareCapacityToGb('3000'), { valid: true, gb: 3072, canonical: '3TB' });
  assert.deepEqual(parseHardwareCapacityToGb('3072'), { valid: true, gb: 3072, canonical: '3TB' });
});

test('capacity parser rejects malformed or nonstandard large GB values', () => {
  assert.equal(parseHardwareCapacityToGb('1.5GB').valid, false);
  assert.equal(parseHardwareCapacityToGb('1.3TB').valid, false);
  assert.equal(parseHardwareCapacityToGb('one TB').valid, false);
  assert.equal(parseHardwareCapacityToGb('1500').valid, false);
  assert.equal(parseHardwareCapacityToGb('1536').valid, false);
  assert.equal(parseHardwareCapacityToGb('1234GB').valid, false);
});

test('capacity formatter presents zero and common decimal and binary terabyte values clearly', () => {
  assert.equal(formatHardwareCapacityGb(0), '0GB');
  assert.equal(formatHardwareCapacityGb(512), '512GB');
  assert.equal(formatHardwareCapacityGb(1000), '1TB');
  assert.equal(formatHardwareCapacityGb(1024), '1TB');
  assert.equal(formatHardwareCapacityGb(1536), '1.5TB');
  assert.equal(formatHardwareCapacityGb(2000), '2TB');
  assert.equal(formatHardwareCapacityGb(2048), '2TB');
});

test('storage normalization keeps invalid input visible and stores valid input as numeric GB', () => {
  assert.equal(normalizeHardwareCapacityForStorage('0'), '0');
  assert.equal(normalizeHardwareCapacityForStorage('1TB'), '1024');
  assert.equal(normalizeHardwareCapacityForStorage('512GB'), '512');
  assert.equal(normalizeHardwareCapacityForStorage('1000'), '1024');
  assert.equal(normalizeHardwareCapacityForStorage('2048'), '2048');
  assert.equal(normalizeHardwareCapacityForStorage('bad value'), 'bad value');
  assert.equal(normalizeHardwareCapacityForStorage(''), '');
});
