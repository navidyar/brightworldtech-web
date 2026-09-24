'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePositiveInteger } = require('../utils/positiveInteger');

test('normalizePositiveInteger preserves the shared safe-positive-integer behavior', () => {
  assert.equal(normalizePositiveInteger(7), 7);
  assert.equal(normalizePositiveInteger(' 7 '), 7);
  assert.equal(normalizePositiveInteger(true), 1);
  assert.equal(normalizePositiveInteger(0), null);
  assert.equal(normalizePositiveInteger(-1), null);
  assert.equal(normalizePositiveInteger(1.5), null);
  assert.equal(normalizePositiveInteger(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(normalizePositiveInteger('not-a-number'), null);
});
