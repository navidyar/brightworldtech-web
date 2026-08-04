'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLotRequirementFormConstraints,
  getRequirementFormFieldKey,
  normalizeRequirementPolicyCode
} = require('./lotRequirementFormPolicy');

function requirement(overrides = {}) {
  return {
    lot_requirement_id: 1,
    requirement_key: 'model',
    requirement_label: 'Model',
    is_active: 1,
    ...overrides
  };
}

test('Lot requirement fields map to their Unit form controls', () => {
  assert.equal(getRequirementFormFieldKey('model'), 'unit_model');
  assert.equal(getRequirementFormFieldKey('ram_size'), 'memory_modules');
  assert.equal(getRequirementFormFieldKey('unknown'), null);
});

test('Strict requirements force their Unit form controls visible and required', () => {
  const constraints = buildLotRequirementFormConstraints([
    requirement(),
    requirement({ lot_requirement_id: 2, requirement_key: 'manufacturer', requirement_label: 'Manufacturer' })
  ], 'strict');

  assert.deepEqual(
    constraints.map((constraint) => [constraint.fieldKey, constraint.forceVisible, constraint.forceRequired]),
    [
      ['unit_model', true, true],
      ['manufacturer', true, true]
    ]
  );
});

test('Warn and Mixed requirements force visibility without creating a browser-level required field', () => {
  for (const policyCode of ['warn_only', 'open_mixed']) {
    const [constraint] = buildLotRequirementFormConstraints([requirement()], policyCode);

    assert.equal(constraint.forceVisible, true);
    assert.equal(constraint.forceRequired, false);
  }
});

test('requirement policy aliases stay consistent across form and enforcement behavior', () => {
  assert.equal(normalizeRequirementPolicyCode('required'), 'strict');
  assert.equal(normalizeRequirementPolicyCode('warning'), 'warn_only');
  assert.equal(normalizeRequirementPolicyCode('mixed'), 'open_mixed');
  assert.equal(normalizeRequirementPolicyCode('unknown'), 'strict');
});
