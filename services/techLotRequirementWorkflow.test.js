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
  processorModels: [{ id: 4, label: 'Intel Core i5', processorFamilyIds: [18], processorFamilyLabels: ['Intel i5-8th Gen'] }],
  ramTypes: [{ id: 5, label: 'DDR4' }],
  memoryInstallTypes: [{ code: 'removable_module', label: 'Removable Module' }],
  storageTypes: [{ id: 6, label: 'NVMe' }],
  storageWipeStatuses: [{ id: 7, label: 'Wiped' }],
  operatingSystems: [{ id: 8, label: 'Windows 11' }],
  absoluteStatusOptions: [{ id: 9, label: 'Disabled' }],
  physicalCameraStatusOptions: [{ id: 10, label: 'Pass' }],
  touchscreenStatusOptions: [{ id: 11, label: 'Pass' }],
  keyboardLanguageOptions: [{ id: 12, label: 'English' }],
  diagnosticsStatusOptions: [{ id: 13, label: 'Pass' }],
  virusCheckStatusOptions: [{ id: 14, label: 'Pass' }],
  driverCheckStatusOptions: [{ id: 15, label: 'Pass' }],
  skinnedStatusOptions: [{ id: 16, label: 'Yes' }],
  overallGradeOptions: [{ id: 17, label: 'A' }],
  outcomeOptions: [{ code: 'pass', label: 'Pass' }]
};

const formData = {
  lotId: '10',
  unitCategoryConfigValueId: '1',
  manufacturerId: '2',
  unitModelId: '3',
  processorModelId: '4',
  processorSpeedGhz: '2.40',
  ramGb: '16',
  ramTypeConfigValueId: '5',
  storageGb: '256',
  storageTypeConfigValueId: '6',
  operatingSystemConfigValueId: '8',
  batteryHealthPercent: '90',
  biosVersion: '1.2.3',
  osBuild: '26100',
  absoluteStatusConfigValueId: '9',
  physicalCameraStatusConfigValueId: '10',
  touchscreenStatusConfigValueId: '11',
  keyboardLanguageConfigValueId: '12',
  completeDiagnosticsStatusConfigValueId: '13',
  virusCheckStatusConfigValueId: '14',
  driverCheckStatusConfigValueId: '15',
  skinnedStatusConfigValueId: '16',
  overallGradeConfigValueId: '17',
  outcomeCode: 'pass',
  memoryModules: [
    { sizeGb: '8', ramTypeConfigValueId: '5', memoryInstallTypeCode: 'removable_module' },
    { sizeGb: '8', ramTypeConfigValueId: '5', memoryInstallTypeCode: 'removable_module' }
  ],
  storageDevices: [{ sizeGb: '256', storageTypeConfigValueId: '6', wipeStatusConfigValueId: '7' }]
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

test('submitted snapshots expose current battery health and storage wipe status values', () => {
  const snapshot = buildSubmittedUnitSnapshot({ formData, formOptions, lotId: 10 });

  assert.equal(snapshot.valuesByKey.battery_health.numberValue, 90);
  assert.equal(snapshot.valuesByKey.battery_health.displayValue, '90%');
  assert.deepEqual(snapshot.valuesByKey.storage_wipe_status.ids, [7]);
  assert.equal(snapshot.valuesByKey.storage_wipe_status.displayValue, 'Wiped');
});

test('Strict Lot accepts submitted battery minimum and current storage wipe requirements', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Battery and Wipe Lot', requirement_policy_code: 'strict' },
    requirements: [
      requirement({
        lot_requirement_id: 21,
        requirement_key: 'battery_health',
        requirement_label: 'Battery Health',
        operator_code: 'greater_equal',
        operator_label: 'Minimum',
        manufacturer_id: null,
        requirement_number: 80,
        required_value: '80'
      }),
      requirement({
        lot_requirement_id: 22,
        requirement_key: 'storage_wipe_status',
        requirement_label: 'Storage Wipe Status',
        operator_code: 'equals',
        operator_label: 'Must equal',
        manufacturer_id: null,
        requirement_config_value_id: 7,
        required_value: 'Wiped'
      })
    ],
    formData,
    formOptions
  });

  assert.equal(workflow.status, 'accepted');
  assert.equal(workflow.saveAllowed, true);
  assert.equal(workflow.issueCount, 0);
  assert.equal(workflow.checks.find((check) => check.requirementKey === 'battery_health').actualValue, '90%');
  assert.equal(workflow.checks.find((check) => check.requirementKey === 'storage_wipe_status').actualValue, 'Wiped');
});

test('submitted zero-size rows produce zero totals without component types', () => {
  const snapshot = buildSubmittedUnitSnapshot({
    formData: {
      ...formData,
      ramGb: '0',
      ramTypeConfigValueId: '5',
      storageGb: '0',
      storageTypeConfigValueId: '6',
      memoryModules: [{ sizeGb: '0', ramTypeConfigValueId: '', memoryInstallTypeCode: '' }],
      storageDevices: [{ sizeGb: '0', storageTypeConfigValueId: '', wipeStatusConfigValueId: '' }]
    },
    formOptions,
    lotId: 10
  });

  assert.equal(snapshot.valuesByKey.ram_gb.numberValue, 0);
  assert.deepEqual(snapshot.valuesByKey.ram_type.ids, []);
  assert.equal(snapshot.valuesByKey.storage_gb.numberValue, 0);
  assert.deepEqual(snapshot.valuesByKey.storage_type.ids, []);
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


test('submitted Processor selections expose their family memberships to Lot validation', () => {
  const workflow = buildTechLotRequirementWorkflow({
    lot: { lot_id: 10, lot_name: 'Processor Family Lot', requirement_policy_code: 'strict' },
    requirements: [requirement({
      requirement_key: 'processor_family',
      requirement_label: 'Processor Family',
      manufacturer_id: null,
      processor_family_id: 18,
      required_value: 'Intel i5-8th Gen'
    })],
    formData,
    formOptions
  });

  assert.equal(workflow.status, 'accepted');
  assert.equal(workflow.saveAllowed, true);
});
