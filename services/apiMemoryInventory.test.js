'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMemoryObservation,
  resolveRamTypeCandidate,
  buildMemoryPlan,
  determineMemoryOwnership
} = require('./apiMemoryInventory');

function current(overrides = {}) {
  return {
    unit_memory_module_id: 1,
    slot_label: 'DIMM 1',
    size_gb: 16,
    ram_type_config_value_id: 10,
    memory_install_type_code: 'removable_module',
    speed_mhz: 3200,
    ...overrides
  };
}

function incoming(overrides = {}) {
  return {
    slot_label: 'DIMM 1',
    size_gb: 16,
    ram_type_submitted: 'DDR4',
    ram_type_config_value_id: 10,
    ram_type_resolution: { status: 'resolved', resolvedId: 10 },
    memory_install_type_code: 'removable_module',
    speed_mhz: 3200,
    ...overrides
  };
}

test('normalizes canonical and collector-style memory data including integrated memory', () => {
  const observation = normalizeMemoryObservation({
    state: 'known',
    totalBytes: 32 * (1024 ** 3),
    slotCount: 2,
    modules: [
      { slot: 'Onboard', sizeBytes: 16 * (1024 ** 3), type: 'LPDDR5', speedMHz: 6400, integrated: true },
      { slot: 'DIMM 1', size_gb: 16, ram_type: 'DDR5', configuredSpeedMHz: 5600, integrated: false }
    ]
  });
  assert.equal(observation.value.total_gb, 32);
  assert.equal(observation.value.slot_count, 2);
  assert.equal(observation.value.modules[0].memory_install_type_code, 'integrated_soldered');
  assert.equal(observation.value.modules[1].memory_install_type_code, 'removable_module');
});

test('unknown memory never requires modules', () => {
  assert.deepEqual(normalizeMemoryObservation({ state: 'unknown' }), {
    fieldKey: 'memory_modules', state: 'unknown', value: null
  });
});

test('RAM type resolution is exact after normalization and never fuzzy', () => {
  const candidates = [
    { id: 10, label: 'DDR4', value: 'ddr4' },
    { id: 11, label: 'DDR5', value: 'ddr5' }
  ];
  assert.equal(resolveRamTypeCandidate('DDR-4', candidates).resolvedId, 10);
  assert.equal(resolveRamTypeCandidate('DDR', candidates).status, 'unmapped');
});

test('manual memory configuration blocks conflicting tool configuration', () => {
  const observation = { fieldKey: 'memory_modules', state: 'known', value: { modules: [incoming({ size_gb: 32 })] } };
  const plan = buildMemoryPlan({ observation, currentRows: [current()], sourceCode: 'manual_override' });
  assert.equal(plan.status, 'blocked_manual');
  assert.equal(plan.reason, 'manual_memory_configuration_conflict');
});

test('manual memory configuration accepts speed only when tool configuration is coherent', () => {
  const observation = { fieldKey: 'memory_modules', state: 'known', value: { modules: [incoming({ speed_mhz: 2666 })] } };
  const plan = buildMemoryPlan({ observation, currentRows: [current()], sourceCode: 'manual_override' });
  assert.equal(plan.status, 'applied');
  assert.equal(plan.mode, 'details_only');
});

test('tool-owned configuration can be replaced by a later different tool configuration', () => {
  const latest = { modules: [incoming()] };
  assert.equal(determineMemoryOwnership({ currentRows: [current()], latestAppliedValue: latest }), 'tool');
  const observation = { fieldKey: 'memory_modules', state: 'known', value: { modules: [incoming({ size_gb: 32, speed_mhz: 2666 })] } };
  const plan = buildMemoryPlan({ observation, currentRows: [current()], latestAppliedValue: latest });
  assert.equal(plan.status, 'applied');
  assert.equal(plan.mode, 'replace');
});

test('unknown later tool memory does not erase current memory', () => {
  const plan = buildMemoryPlan({
    observation: { fieldKey: 'memory_modules', state: 'unknown', value: null },
    currentRows: [current()],
    sourceCode: ''
  });
  assert.equal(plan.status, 'ignored_unknown');
  assert.equal(plan.mode, 'none');
});
