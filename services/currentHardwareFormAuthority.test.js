'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCurrentHardwareFormAuthority, applyCurrentHardwareAuthorityToSubmission } = require('./currentHardwareFormAuthority');

test('required Tool policy locks both Current Memory and Current Storage before a Tool runs', () => {
  const result = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: { requireScanToolsBeforeCompletion: true, requireTechToolsBeforeCompletion: false },
    toolOwnedFieldKeys: []
  });
  assert.equal(result.memory.locked, true);
  assert.equal(result.storage.locked, true);
  assert.equal(result.memory.reason, 'lot_requires_tools');
});

test('optional Tool policy leaves Current Memory and Storage editable before Tool ownership exists', () => {
  const result = buildCurrentHardwareFormAuthority({ effectiveToolPolicy: {}, toolOwnedFieldKeys: [] });
  assert.equal(result.memory.locked, false);
  assert.equal(result.storage.locked, false);
});

test('optional Tool policy locks only the Current field actually populated by a Tool', () => {
  const result = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: {},
    toolOwnedFieldKeys: ['memory_modules'],
    productionCycleKey: 'production:initial:42'
  });
  assert.equal(result.memory.locked, true);
  assert.equal(result.memory.toolOwned, true);
  assert.equal(result.storage.locked, false);
  assert.equal(result.productionCycleKey, 'production:initial:42');
});


test('locked Current Memory/Storage preserve authoritative stored values on edit', () => {
  const authority = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: { requireTechToolsBeforeCompletion: true }
  });
  const result = applyCurrentHardwareAuthorityToSubmission({
    mode: 'edit',
    authority,
    formData: {
      ramGb: '999',
      memoryModules: [{ sizeGb: '999' }],
      storageGb: '999',
      storageDevices: [{ sizeGb: '999' }],
      previousRamGb: '8'
    },
    existingFormData: {
      ramGb: '16',
      memoryModules: [{ sizeGb: '16' }],
      storageGb: '512',
      storageDevices: [{ sizeGb: '512' }]
    }
  });
  assert.equal(result.ramGb, '16');
  assert.deepEqual(result.memoryModules, [{ sizeGb: '16' }]);
  assert.equal(result.storageGb, '512');
  assert.deepEqual(result.storageDevices, [{ sizeGb: '512' }]);
  assert.equal(result.previousRamGb, '8');
});

test('locked Current Memory/Storage discard manual Current values on create', () => {
  const authority = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: { requireScanToolsBeforeCompletion: true }
  });
  const result = applyCurrentHardwareAuthorityToSubmission({
    mode: 'create',
    authority,
    formData: {
      ramGb: '16',
      memoryModules: [{ sizeGb: '16' }],
      storageGb: '512',
      storageDevices: [{ sizeGb: '512' }]
    }
  });
  assert.equal(result.ramGb, '');
  assert.deepEqual(result.memoryModules, []);
  assert.equal(result.storageGb, '');
  assert.deepEqual(result.storageDevices, []);
});
