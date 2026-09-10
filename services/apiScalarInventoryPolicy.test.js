'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeScalarObservations,
  decideScalarApplication,
  extractAppliedToolValue
} = require('./apiScalarInventoryPolicy');

function observation(fieldKey, value, state = 'known') {
  return normalizeScalarObservations({ [fieldKey]: { state, value } })[0];
}

test('normalizes catalog-backed and established scalar inventory fields while ignoring unsupported groups', () => {
  assert.deepEqual(normalizeScalarObservations({
    manufacturer: '  Dell Inc. ',
    unit_model: ' OptiPlex 7090 ',
    processor_model: ' Intel Core i7-8665U ',
    processor_speed_ghz: 3.3999,
    operating_system: ' Microsoft Windows 11 Pro ',
    bios_version: '  1.27.0  ',
    os_build: { state: 'known', value: '26100.4946' },
    memory: { value: 'not accepted in this stage' }
  }), [
    { fieldKey: 'manufacturer', state: 'known', value: 'Dell Inc.' },
    { fieldKey: 'unit_model', state: 'known', value: 'OptiPlex 7090' },
    { fieldKey: 'processor_model', state: 'known', value: 'Intel Core i7-8665U' },
    { fieldKey: 'processor_speed_ghz', state: 'known', value: 3.4 },
    { fieldKey: 'operating_system', state: 'known', value: 'Microsoft Windows 11 Pro' },
    { fieldKey: 'bios_version', state: 'known', value: '1.27.0' },
    { fieldKey: 'os_build', state: 'known', value: '26100.4946' }
  ]);
});

test('hardware catalog identities cannot use confirmed_absent while Operating System can', () => {
  assert.throws(
    () => observation('manufacturer', null, 'confirmed_absent'),
    /cannot use confirmed_absent/
  );
  assert.deepEqual(observation('operating_system', null, 'confirmed_absent'), {
    fieldKey: 'operating_system', state: 'confirmed_absent', value: null
  });
});

test('resolved catalog observations expose their canonical ID for last-tool ownership checks', () => {
  assert.equal(extractAppliedToolValue('manufacturer', {
    submitted: 'Dell Inc.', resolved_id: 7, resolved_label: 'Dell'
  }), 7);
  assert.equal(extractAppliedToolValue('bios_version', '1.20.0'), '1.20.0');
});

test('unknown tool data never overwrites a current value', () => {
  assert.deepEqual(decideScalarApplication({
    observation: observation('bios_version', null, 'unknown'),
    currentValue: '1.20.0'
  }), {
    status: 'ignored_unknown',
    reason: 'unknown_does_not_overwrite',
    desiredValue: '1.20.0'
  });
});

test('active-cycle manual overrides win even when the current value is null', () => {
  const result = decideScalarApplication({
    observation: observation('os_build', '26100.4946'),
    currentValue: null,
    sourceCode: 'manual_override'
  });
  assert.equal(result.status, 'blocked_manual');
  assert.equal(result.reason, 'active_cycle_manual_override');
});

test('ordinary tech_edit is replaceable by a later valid Tool observation', () => {
  const result = decideScalarApplication({
    observation: observation('os_build', '26100.4946'),
    currentValue: '26100.1',
    sourceCode: 'tech_edit'
  });
  assert.equal(result.status, 'applied');
  assert.equal(result.desiredValue, '26100.4946');
});

test('a tool can populate a previously blank unowned value', () => {
  const result = decideScalarApplication({
    observation: observation('processor_speed_ghz', 3.4),
    currentValue: null
  });
  assert.equal(result.status, 'applied');
  assert.equal(result.desiredValue, 3.4);
});

test('last tool wins when the current value matches a prior applied tool observation', () => {
  const result = decideScalarApplication({
    observation: observation('bios_version', '1.30.0'),
    currentValue: '1.20.0',
    hasLatestAppliedToolObservation: true,
    latestAppliedToolValue: '1.20.0'
  });
  assert.equal(result.status, 'applied');
  assert.equal(result.desiredValue, '1.30.0');
});

test('a populated legacy value with no proven tool ownership is conservatively treated as manual', () => {
  const result = decideScalarApplication({
    observation: observation('bios_version', '1.30.0'),
    currentValue: '1.20.0'
  });
  assert.equal(result.status, 'blocked_manual');
  assert.equal(result.reason, 'existing_value_not_tool_owned');
});

test('confirmed absence can clear a tool-owned value but cannot clear an active-cycle manual override', () => {
  const toolOwned = decideScalarApplication({
    observation: observation('os_build', null, 'confirmed_absent'),
    currentValue: '26100.4946',
    hasLatestAppliedToolObservation: true,
    latestAppliedToolValue: '26100.4946'
  });
  assert.equal(toolOwned.status, 'applied');
  assert.equal(toolOwned.desiredValue, null);

  const manual = decideScalarApplication({
    observation: observation('os_build', null, 'confirmed_absent'),
    currentValue: '26100.4946',
    sourceCode: 'manual_override'
  });
  assert.equal(manual.status, 'blocked_manual');
});


test('Stage 10W79K1 normalizes Windows Release and Keyboard Language fields', () => {
  assert.deepEqual(normalizeScalarObservations({
    windows_display_version: { state: 'known', value: ' 24H2 ' },
    keyboard_language: { state: 'known', value: ' US English ' }
  }), [
    { fieldKey: 'windows_display_version', state: 'known', value: '24H2' },
    { fieldKey: 'keyboard_language', state: 'known', value: 'US English' }
  ]);
});

test('Keyboard Language cannot use confirmed_absent and system-config observations keep canonical ownership IDs', () => {
  assert.throws(
    () => observation('keyboard_language', null, 'confirmed_absent'),
    /cannot use confirmed_absent/
  );
  assert.equal(extractAppliedToolValue('keyboard_language', {
    submitted: 'US English', resolved_id: 55, resolved_label: 'US English'
  }), 55);
});
