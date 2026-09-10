'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCandidateFromRows } = require('./apiConfigValueResolver');

const ROWS = [
  { id: 1, label: 'Pass', code: 'pass', value: 'Passed' },
  { id: 2, label: 'Fail', code: 'fail', value: 'Failed' },
  { id: 3, label: 'Not Applicable', code: 'not_applicable', value: 'N/A' }
];

test('system-category resolver uses exact normalized values rather than fuzzy substrings', () => {
  assert.equal(resolveCandidateFromRows(ROWS, 'PASS').resolvedId, 1);
  assert.equal(resolveCandidateFromRows(ROWS, 'pass maybe').status, 'unmapped');
});

test('resolver can use explicit semantic aliases without guessing arbitrary values', () => {
  assert.equal(resolveCandidateFromRows(ROWS, 'available', ['Pass']).resolvedId, 1);
  assert.equal(resolveCandidateFromRows(ROWS, 'not available', ['Fail']).resolvedId, 2);
});

test('resolver keeps unmapped and ambiguous outcomes explicit', () => {
  assert.equal(resolveCandidateFromRows(ROWS, 'Warning').status, 'unmapped');
  const duplicated = [...ROWS, { id: 4, label: 'Pass', code: 'ok', value: 'OK' }];
  assert.equal(resolveCandidateFromRows(duplicated, 'Pass').status, 'ambiguous');
});
