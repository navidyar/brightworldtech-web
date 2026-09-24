'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCurrentHardwareFormAuthority, applyCurrentHardwareAuthorityToSubmission } = require('./currentHardwareFormAuthority');

test('required Tool policy keeps Current Memory and Current Storage manually editable', () => {
  const result = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: { requireScanToolsBeforeCompletion: true, requireTechToolsBeforeCompletion: false },
    toolOwnedFieldKeys: []
  });
  assert.equal(result.lotRequiresTools, true);
  assert.equal(result.memory.locked, false);
  assert.equal(result.storage.locked, false);
  assert.equal(result.memory.reason, 'manual_allowed');
});

test('optional Tool policy leaves Current Memory and Storage editable before Tool observations exist', () => {
  const result = buildCurrentHardwareFormAuthority({ effectiveToolPolicy: {}, toolOwnedFieldKeys: [] });
  assert.equal(result.memory.locked, false);
  assert.equal(result.storage.locked, false);
});

test('Tool-populated Current Memory remains editable while ownership is retained for context', () => {
  const result = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: {},
    toolOwnedFieldKeys: ['memory_modules'],
    productionCycleKey: 'production:initial:42'
  });
  assert.equal(result.memory.locked, false);
  assert.equal(result.memory.toolOwned, true);
  assert.equal(result.memory.reason, 'tool_populated_editable');
  assert.equal(result.storage.locked, false);
  assert.equal(result.productionCycleKey, 'production:initial:42');
});

test('manual Current Memory and Storage edits are retained on edit even when Tools are required', () => {
  const authority = buildCurrentHardwareFormAuthority({
    effectiveToolPolicy: { requireTechToolsBeforeCompletion: true },
    toolOwnedFieldKeys: ['memory_modules', 'storage_devices']
  });
  const result = applyCurrentHardwareAuthorityToSubmission({
    mode: 'edit',
    authority,
    formData: {
      ramGb: '32',
      memoryModules: [{ sizeGb: '16' }, { sizeGb: '16' }],
      storageGb: '1000',
      storageDevices: [{ sizeGb: '1000' }],
      previousRamGb: '8'
    },
    existingFormData: {
      ramGb: '16',
      memoryModules: [{ sizeGb: '16' }],
      storageGb: '512',
      storageDevices: [{ sizeGb: '512' }]
    }
  });
  assert.equal(result.ramGb, '32');
  assert.deepEqual(result.memoryModules, [{ sizeGb: '16' }, { sizeGb: '16' }]);
  assert.equal(result.storageGb, '1000');
  assert.deepEqual(result.storageDevices, [{ sizeGb: '1000' }]);
  assert.equal(result.previousRamGb, '8');
});

test('manual Current Memory and Storage values are retained on create when Tools are required', () => {
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
  assert.equal(result.ramGb, '16');
  assert.deepEqual(result.memoryModules, [{ sizeGb: '16' }]);
  assert.equal(result.storageGb, '512');
  assert.deepEqual(result.storageDevices, [{ sizeGb: '512' }]);
});
