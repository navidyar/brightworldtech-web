'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertCanReverseUnitCompletion,
  canReverseUnitCompletion,
  normalizeCompletionReversalReason
} = require('./unitCompletionReversalPolicy');

test('Tech Lead, Management, and Admin may reverse Unit completion', () => {
  assert.equal(canReverseUnitCompletion(['tech_lead']), true);
  assert.equal(canReverseUnitCompletion(['management']), true);
  assert.equal(canReverseUnitCompletion(['admin']), true);
  assert.equal(canReverseUnitCompletion(['tech']), false);
  assert.equal(canReverseUnitCompletion([]), false);
});

test('completion reversal requires a meaningful reason', () => {
  assert.equal(normalizeCompletionReversalReason('  Completed accidentally  '), 'Completed accidentally');
  assert.throws(() => normalizeCompletionReversalReason(''), /reason is required/i);
  assert.throws(() => assertCanReverseUnitCompletion(['tech']), /Only a Tech Lead/i);
});
