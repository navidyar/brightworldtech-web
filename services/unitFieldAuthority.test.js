'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isActiveManualOverride,
  effectiveSourceCode,
  isReplaceableManualSource
} = require('./unitFieldAuthority');

test('manual override protects only its current BWTDallas production cycle', () => {
  const state = { sourceCode: 'manual_override', overrideProductionCycleKey: 'production:42:1' };
  assert.equal(isActiveManualOverride(state, 'production:42:1'), true);
  assert.equal(effectiveSourceCode(state, 'production:42:2'), 'expired_manual_override');
});

test('ordinary tech_edit and expired manual override are replaceable Tool sources', () => {
  assert.equal(isReplaceableManualSource('tech_edit'), true);
  assert.equal(isReplaceableManualSource('expired_manual_override'), true);
  assert.equal(isReplaceableManualSource('manual_override'), false);
});
