'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRequirementPolicyOptions,
  findSelectedRequirementPolicy,
  getDefaultRequirementPolicyId,
  normalizePolicyCode,
  validateRequirementPolicyRegistry
} = require('./lotRequirementPolicyRegistry');

test('requirement policy registry contains the three explicit enforcement choices', () => {
  assert.deepEqual(validateRequirementPolicyRegistry(), []);
  assert.equal(normalizePolicyCode('strict'), 'strict');
  assert.equal(normalizePolicyCode('warn_only'), 'warn_only');
  assert.equal(normalizePolicyCode('open_mixed'), 'open_mixed');
});

test('legacy policy aliases normalize without coupling policy to Lot size', () => {
  assert.equal(normalizePolicyCode('required'), 'strict');
  assert.equal(normalizePolicyCode('warn'), 'warn_only');
  assert.equal(normalizePolicyCode('mixed'), 'open_mixed');
  assert.equal(normalizePolicyCode('open'), 'open_mixed');
});

test('database options are ordered and labeled by the explicit policy registry', () => {
  const options = buildRequirementPolicyOptions([
    { config_value_id: 48, code: 'open_mixed', label: 'Old label', is_active: 1 },
    { config_value_id: 46, code: 'strict', label: 'Old label', is_active: 1 },
    { config_value_id: 47, code: 'warn_only', label: 'Old label', is_active: 1 }
  ]);

  assert.deepEqual(options.map((option) => option.code), ['strict', 'warn_only', 'open_mixed']);
  assert.equal(options[1].label, 'Warn Only');
  assert.match(options[2].description, /mixed Units/i);
  assert.equal(getDefaultRequirementPolicyId(options), 46);
  assert.equal(findSelectedRequirementPolicy(options, 47).code, 'warn_only');
});

test('inactive, unsupported, and invalid policy rows are excluded', () => {
  const options = buildRequirementPolicyOptions([
    { config_value_id: 46, code: 'strict', is_active: 0 },
    { config_value_id: 47, code: 'warn_only', is_active: 1 },
    { config_value_id: 0, code: 'open_mixed', is_active: 1 },
    { config_value_id: 99, code: 'custom', is_active: 1 }
  ]);

  assert.deepEqual(options.map((option) => option.code), ['warn_only']);
  assert.equal(findSelectedRequirementPolicy(options, 46), null);
});
