'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSubmittedUnitSnapshot,
  buildTechLotRequirementWorkflow,
  normalizeRequirementPolicyCode
} = require('./techLotRequirementWorkflow');

const formOptions = {
  unitCategories: [{ id: 1, label: 'Laptop' }],
  manufacturers: [{ id: 2, label: 'Dell' }],
  unitModels: [{ id: 3, label: 'Latitude 5400' }],
  processorModels: [{ id: 4, label: 'Intel Core i5' }],
  ramTypes: [{ id: 5, label: 'DDR4' }],
  storageTypes: [{ id: 6, label: 'NVMe' }]
};

const formData = {
  lotId: '10',
  unitCategoryConfigValueId: '1',
  manufacturerId: '2',
  unitModelId: '3',
  processorModelId: '4',
  ramGb: '16',
  ramTypeConfigValueId: '5',
  storageGb: '256',
  storageTypeConfigValueId: '6',
  memoryModules: [{ sizeGb: '8', ramTypeConfigValueId: '5' }, { sizeGb: '8', ramTypeConfigValueId: '5' }],
  storageDevices: [{ sizeGb: '256', storageTypeConfigValueId: '6' }]
};

function requirement(overrides = {}) {
  return {
    lot_requirement_id: 1,
    requirement_key: 'manufacturer',
    requirement_label: 'Manufacturer',
    operator_code: 'equals',
    operator_label: 'Must equal',
    manufacturer_id: 2,
    required_value: 'Dell',
    is_active: 1,
    ...overrides
  };
}

test('submitted snapshots use current repeatable rows for totals and types', () => {
  const snapshot = buildSubmittedUnitSnapshot({ formData, formOptions, lotId: 10 });

  assert.equal(snapshot.valuesByKey.ram_gb.numberValue, 16);
  assert.deepEqual(snapshot.valuesByKey.ram_type.ids, [5]);
  assert.equal(snapshot.valuesByKey.storage_gb.numberValue, 256);
  assert.deepEqual(snapshot.valuesByKey.storage_type.ids, [6]);
});

test('Strict policy blocks rejected Unit form values', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Strict Lot', requirement_policy_code: 'strict' },
    requirements: [requirement({ manufacturer_id: 99, required_value: 'HP' })],
    formData,
    formOptions
  });

  assert.equal(workflow.status, 'rejected');
  assert.equal(workflow.saveAllowed, false);
  assert.deepEqual(workflow.blockingFieldKeys, ['manufacturer']);
});

test('Warn Only policy reports failure but allows save', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Warning Lot', requirement_policy_code: 'warn_only' },
    requirements: [requirement({ manufacturer_id: 99, required_value: 'HP' })],
    formData,
    formOptions
  });

  assert.equal(workflow.status, 'rejected');
  assert.equal(workflow.saveAllowed, true);
  assert.equal(workflow.tone, 'warning');
  assert.equal(workflow.statusLabel, 'Allowed with Warning');
});

test('Open or Mixed policy permits mismatched Units', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Mixed Lot', requirement_policy_code: 'open_mixed' },
    requirements: [requirement({ manufacturer_id: 99, required_value: 'HP' })],
    formData,
    formOptions
  });

  assert.equal(workflow.saveAllowed, true);
  assert.equal(workflow.headline, 'Mixed Lot — review suggested');
  assert.equal(workflow.statusLabel, 'Allowed in Mixed Lot');
});

test('current Management acceptance permits a Strict failure', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Strict Lot', requirement_policy_code: 'strict' },
    requirements: [requirement({ manufacturer_id: 99, required_value: 'HP' })],
    formData,
    formOptions,
    unitId: 42,
    activeOverride: { overrideId: 7, reason: 'Approved exception' }
  });

  assert.equal(workflow.status, 'accepted_override');
  assert.equal(workflow.saveAllowed, true);
  assert.equal(workflow.managementAccepted, true);
});

test('policy aliases normalize to supported workflow behavior', () => {
  assert.equal(normalizeRequirementPolicyCode('required'), 'strict');
  assert.equal(normalizeRequirementPolicyCode('warning'), 'warn_only');
  assert.equal(normalizeRequirementPolicyCode('mixed'), 'open_mixed');
  assert.equal(normalizeRequirementPolicyCode('unknown-value'), 'strict');
});
