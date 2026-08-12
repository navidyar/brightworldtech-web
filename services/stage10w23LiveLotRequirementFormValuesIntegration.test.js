'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

function batteryRequirement(overrides = {}) {
  return {
    lot_requirement_id: 201,
    requirement_key: 'battery_health',
    requirement_label: 'Battery Health',
    operator_code: 'greater_equal',
    operator_label: 'Minimum',
    requirement_number: 80,
    required_value: '80',
    is_active: 1,
    ...overrides
  };
}

function wipeRequirement(overrides = {}) {
  return {
    lot_requirement_id: 202,
    requirement_key: 'storage_wipe_status',
    requirement_label: 'Storage Wipe Status',
    operator_code: 'equals',
    operator_label: 'Must equal',
    requirement_config_value_id: 91,
    required_value: 'Wiped',
    is_active: 1,
    ...overrides
  };
}

async function withRequirementModel(t, requirements, callback) {
  const lotModelPath = require.resolve('../models/lotModel');
  const overrideModelPath = require.resolve('../models/lotValidationOverrideModel');
  const techRequirementModelPath = require.resolve('../models/techLotRequirementModel');
  const previousLotModelCache = require.cache[lotModelPath];
  const previousOverrideModelCache = require.cache[overrideModelPath];
  const previousTechRequirementCache = require.cache[techRequirementModelPath];

  require.cache[lotModelPath] = {
    id: lotModelPath,
    filename: lotModelPath,
    loaded: true,
    exports: {
      getLotById: async () => ({
        lot_id: 44,
        lot_name: 'Strict Battery/Wipe Lot',
        requirement_policy_code: 'strict',
        requirement_policy_label: 'Strict'
      }),
      listEffectiveLotRequirements: async () => requirements
    }
  };
  require.cache[overrideModelPath] = {
    id: overrideModelPath,
    filename: overrideModelPath,
    loaded: true,
    exports: {}
  };
  delete require.cache[techRequirementModelPath];

  t.after(() => {
    if (previousLotModelCache) require.cache[lotModelPath] = previousLotModelCache;
    else delete require.cache[lotModelPath];
    if (previousOverrideModelCache) require.cache[overrideModelPath] = previousOverrideModelCache;
    else delete require.cache[overrideModelPath];
    if (previousTechRequirementCache) require.cache[techRequirementModelPath] = previousTechRequirementCache;
    else delete require.cache[techRequirementModelPath];
  });

  const techLotRequirementModel = require('../models/techLotRequirementModel');
  return callback(techLotRequirementModel);
}

function formOptions() {
  return {
    processorModels: [],
    ramTypes: [],
    memoryInstallTypes: [],
    storageTypes: [{ id: 81, label: 'M.2 NVMe' }],
    storageWipeStatuses: [{ id: 91, label: 'Wiped' }],
    operatingSystems: [],
    unitCategories: [],
    manufacturers: [],
    unitModels: [],
    absoluteStatusOptions: [],
    physicalCameraStatusOptions: [],
    touchscreenStatusOptions: [],
    keyboardLanguageOptions: [],
    diagnosticsStatusOptions: [],
    virusCheckStatusOptions: [],
    driverCheckStatusOptions: [],
    skinnedStatusOptions: [],
    overallGradeOptions: [],
    outcomeOptions: []
  };
}

test('Add/Edit Lot workflow evaluates submitted Battery Health and current Storage Wipe Status', async (t) => {
  await withRequirementModel(t, [batteryRequirement(), wipeRequirement()], async (techLotRequirementModel) => {
    const workflow = await techLotRequirementModel.buildWorkflowForForm({
      lotId: 44,
      formData: {
        lotId: '44',
        batteryHealthPercent: '90',
        memoryModules: [],
        storageDevices: [{
          slotLabel: '0',
          sizeGb: '512',
          storageTypeConfigValueId: '81',
          wipeStatusConfigValueId: '91'
        }]
      },
      formOptions: formOptions()
    });

    assert.equal(workflow.status, 'accepted');
    assert.equal(workflow.saveAllowed, true);
    assert.equal(workflow.issueCount, 0);
    assert.equal(workflow.checks.find((check) => check.requirementKey === 'battery_health').actualValue, '90%');
    assert.equal(workflow.checks.find((check) => check.requirementKey === 'storage_wipe_status').actualValue, 'Wiped');
  });
});

test('Storage Wipe Status requirement uses current storage rows and never previous storage rows', async (t) => {
  await withRequirementModel(t, [wipeRequirement()], async (techLotRequirementModel) => {
    const workflow = await techLotRequirementModel.buildWorkflowForForm({
      lotId: 44,
      formData: {
        lotId: '44',
        previousStorageDevices: [{
          slotLabel: '0',
          sizeGb: '512',
          storageTypeConfigValueId: '81',
          wipeStatusConfigValueId: '91'
        }],
        storageDevices: [{
          slotLabel: '0',
          sizeGb: '512',
          storageTypeConfigValueId: '81',
          wipeStatusConfigValueId: ''
        }],
        memoryModules: []
      },
      formOptions: formOptions()
    });

    assert.equal(workflow.status, 'rejected');
    assert.equal(workflow.saveAllowed, false);
    assert.equal(workflow.issueCount, 1);
    assert.equal(workflow.checks[0].actualValue, '—');
  });
});
