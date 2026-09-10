'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeStorageObservation,
  bytesToCommercialGb,
  resolveStorageTypeCandidate,
  pairCompatibleDevices,
  currentMatchesStoredObservation,
  determineStorageOwnership,
  buildStoragePlan,
  physicalIdentityChanged
} = require('./apiStorageInventory');

function current(overrides = {}) {
  return {
    unit_storage_device_id: 1,
    slot_label: 'Disk 0',
    size_gb: 512,
    storage_type_config_value_id: 10,
    wipe_status_config_value_id: 99,
    model_number: 'Samsung PM991',
    serial_number: 'OLD123',
    firmware_version: '1A',
    raw_size_bytes: 512110190592,
    storage_interface: 'NVMe',
    media_type: 'SSD',
    health_status: 'Healthy',
    storage_install_type_code: 'removable_device',
    ...overrides
  };
}

function incoming(overrides = {}) {
  return {
    slot_label: 'Disk 0',
    size_gb: 512,
    raw_size_bytes: 512110190592,
    storage_type_submitted: 'SSD',
    storage_type_config_value_id: 10,
    storage_type_resolution: { status: 'resolved', resolvedId: 10 },
    storage_interface: 'NVMe',
    media_type: 'SSD',
    model_number: 'Samsung PM991',
    serial_number: 'OLD123',
    firmware_version: '1A',
    health_status: 'Healthy',
    storage_install_type_code: 'removable_device',
    ...overrides
  };
}

test('raw storage bytes normalize to the BWTDallas commercial size convention', () => {
  assert.equal(bytesToCommercialGb(512110190592), 512);
  assert.equal(bytesToCommercialGb(1000204886016), 1024);
  assert.equal(bytesToCommercialGb(2000398934016), 2048);
});

test('normalizes selected internal storage details and integrated status', () => {
  const observation = normalizeStorageObservation({
    state: 'known',
    devices: [{
      number: 0,
      sizeBytes: 512110190592,
      mediaType: 'SSD',
      connection: 'NVMe',
      model: 'Samsung PM991',
      serialNumber: 'ABC123',
      firmware: '7L2Q',
      health: 'Healthy',
      integrated: true
    }]
  });
  assert.equal(observation.fieldKey, 'storage_devices');
  assert.equal(observation.value.total_gb, 512);
  assert.equal(observation.value.devices[0].size_gb, 512);
  assert.equal(observation.value.devices[0].serial_number, 'ABC123');
  assert.equal(observation.value.devices[0].storage_install_type_code, 'integrated_soldered');
});

test('unknown storage is retained as a no-overwrite observation', () => {
  assert.deepEqual(normalizeStorageObservation({ state: 'unknown' }), {
    fieldKey: 'storage_devices', state: 'unknown', value: null
  });
});

test('storage type resolution accepts common SSD and HDD aliases without fuzzy substring matching', () => {
  const candidates = [
    { id: 10, label: 'SSD', value: 'SSD' },
    { id: 11, label: 'HDD', value: 'HDD' }
  ];
  assert.equal(resolveStorageTypeCandidate('Solid State Drive', candidates).resolvedId, 10);
  assert.equal(resolveStorageTypeCandidate('NVMe', candidates).resolvedId, 10);
  assert.equal(resolveStorageTypeCandidate('Hard Disk Drive', candidates).resolvedId, 11);
  assert.equal(resolveStorageTypeCandidate('mystery disk', candidates).status, 'unmapped');
});

test('manual compatible storage configuration accepts tool-only detail refreshes', () => {
  const plan = buildStoragePlan({
    observation: { state: 'known', value: { devices: [incoming({ health_status: 'Warning' })] } },
    currentRows: [current()],
    sourceCode: 'manual_override'
  });
  assert.equal(plan.status, 'applied');
  assert.equal(plan.mode, 'details_only');
  assert.equal(plan.reason, 'manual_storage_configuration_preserved');
});

test('manual storage configuration conflict blocks tool replacement', () => {
  const plan = buildStoragePlan({
    observation: { state: 'known', value: { devices: [incoming({ size_gb: 1024 })] } },
    currentRows: [current()],
    sourceCode: 'manual_override'
  });
  assert.equal(plan.status, 'blocked_manual');
  assert.equal(plan.reason, 'manual_storage_configuration_conflict');
});

test('changed serial or model is a physical drive replacement even at the same capacity', () => {
  assert.equal(physicalIdentityChanged(current(), incoming({ serial_number: 'NEW999' })), true);
  assert.equal(physicalIdentityChanged(current(), incoming({ model_number: 'WD SN740' })), true);
  const plan = buildStoragePlan({
    observation: { state: 'known', value: { devices: [incoming({ serial_number: 'NEW999' })] } },
    currentRows: [current()],
    sourceCode: 'tech_edit'
  });
  assert.equal(plan.status, 'applied');
  assert.equal(plan.mode, 'replace_compatible');
});

test('tool-owned storage can be replaced by the latest valid tool configuration', () => {
  const oldObservation = { devices: [incoming()] };
  const plan = buildStoragePlan({
    observation: { state: 'known', value: { devices: [incoming({ size_gb: 1024, raw_size_bytes: 1000204886016 })] } },
    currentRows: [current()],
    latestAppliedValue: oldObservation
  });
  assert.equal(determineStorageOwnership({ currentRows: [current()], latestAppliedValue: oldObservation }), 'tool');
  assert.equal(plan.status, 'applied');
  assert.equal(plan.mode, 'replace');
  assert.equal(plan.reason, 'latest_tool_storage_configuration');
});

test('latest applied observation proves tool ownership only when stored drive identity still matches', () => {
  assert.equal(currentMatchesStoredObservation([current()], { devices: [incoming()] }), true);
  assert.equal(currentMatchesStoredObservation(
    [current({ serial_number: 'DIFFERENT' })],
    { devices: [incoming()] }
  ), false);
});

test('multiple drives pair by serial or slot without mixing configurations', () => {
  const pairs = pairCompatibleDevices(
    [
      current({ unit_storage_device_id: 1, slot_label: 'Disk 0', serial_number: 'A' }),
      current({ unit_storage_device_id: 2, slot_label: 'Disk 1', serial_number: 'B' })
    ],
    [
      incoming({ slot_label: 'Disk 1', serial_number: 'B' }),
      incoming({ slot_label: 'Disk 0', serial_number: 'A' })
    ]
  );
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].current.serial_number, 'B');
  assert.equal(pairs[1].current.serial_number, 'A');
});

test('unknown storage never overwrites current storage', () => {
  const plan = buildStoragePlan({
    observation: { state: 'unknown', value: null },
    currentRows: [current()],
    sourceCode: ''
  });
  assert.equal(plan.status, 'ignored_unknown');
  assert.equal(plan.mode, 'none');
});
