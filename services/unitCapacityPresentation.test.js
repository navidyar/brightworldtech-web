'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatBrowserCapacityGb,
  parseCapacitySearchTerm
} = require('./unitCapacityPresentation');

test('Browser capacity presentation normalizes nominal TB-sized memory and storage values without changing smaller GB values', () => {
  assert.equal(formatBrowserCapacityGb(0), '');
  assert.equal(formatBrowserCapacityGb(512), '512GB');
  assert.equal(formatBrowserCapacityGb(1000), '1TB');
  assert.equal(formatBrowserCapacityGb(1024), '1TB');
  assert.equal(formatBrowserCapacityGb(1028), '1TB');
  assert.equal(formatBrowserCapacityGb(2000), '2TB');
  assert.equal(formatBrowserCapacityGb(2048), '2TB');
  assert.equal(formatBrowserCapacityGb(960), '960GB');
  assert.equal(formatBrowserCapacityGb(1500), '1500GB');
});

test('capacity search accepts explicit readable keys, short aliases, displayed labels, GB defaults, and TB ranges', () => {
  assert.deepEqual(parseCapacitySearchTerm('memory:16'), { field: 'memory', unit: 'gb', value: 16, minGb: 16, maxGb: 16 });
  assert.deepEqual(parseCapacitySearchTerm('M 8'), { field: 'memory', unit: 'gb', value: 8, minGb: 8, maxGb: 8 });
  assert.deepEqual(parseCapacitySearchTerm('storage:512GB'), { field: 'storage', unit: 'gb', value: 512, minGb: 512, maxGb: 512 });
  assert.deepEqual(parseCapacitySearchTerm('512GB Storage'), { field: 'storage', unit: 'gb', value: 512, minGb: 512, maxGb: 512 });
  assert.deepEqual(parseCapacitySearchTerm('s:1TB'), { field: 'storage', unit: 'tb', value: 1, minGb: 994, maxGb: 1054 });
  assert.equal(parseCapacitySearchTerm('Dell 5400'), null);
});
