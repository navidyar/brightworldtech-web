'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRequirementValuePayload,
  getRequirementValueToken
} = require('./lotRequirementPersistence');

test('manufacturer requirements persist through manufacturer_id', () => {
  const payload = buildRequirementValuePayload('manufacturer', 'manufacturer:7');

  assert.equal(payload.manufacturer_id, 7);
  assert.equal(payload.requirement_config_value_id, null);
  assert.equal(payload.requirement_number, null);
});

test('numeric requirements persist through requirement_number', () => {
  const payload = buildRequirementValuePayload('ram_gb', '16');

  assert.equal(payload.requirement_number, 16);
  assert.equal(payload.manufacturer_id, null);
});

test('mismatched typed option tokens are rejected', () => {
  assert.throws(
    () => buildRequirementValuePayload('model', 'manufacturer:2'),
    /Select a valid Model value/
  );
});

test('stored values round-trip to editor tokens', () => {
  assert.equal(getRequirementValueToken({ unit_model_id: 41 }), 'unit_model:41');
  assert.equal(getRequirementValueToken({ requirement_number: '32.00' }), '32');
});
