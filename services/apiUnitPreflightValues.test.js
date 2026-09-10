'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDetectedValues,
  addTopLevelRequirementContext,
  applyDetectedValues
} = require('./apiUnitPreflightValues');

function formOptions() {
  return {
    unitCategories: [{ id: 10, label: 'Laptop' }],
    manufacturers: [{ id: 1, label: 'Dell' }],
    unitModels: [{ id: 2, shortLabel: 'Latitude 5420', label: 'Latitude 5420', manufacturerId: 1, unitCategoryConfigValueId: 10 }],
    processorBrands: [{ id: 3, label: 'Intel' }],
    processorModels: [{ id: 4, processorBrandId: 3, shortLabel: 'i5-1145G7', label: 'i5-1145G7', compatibleUnitModelIds: [2], processorFamilyIds: [8], processorFamilyLabels: ['Intel Core i5'] }],
    ramTypes: [{ id: 5, label: 'DDR4' }],
    memoryInstallTypes: [{ code: 'removable_module', label: 'Removable' }],
    storageTypes: [{ id: 6, label: 'NVMe' }],
    storageWipeStatuses: [{ id: 7, label: 'Passed' }],
    operatingSystems: [], screenSizes: [], absoluteStatusOptions: [], touchscreenStatusOptions: [],
    keyboardLanguageOptions: [], diagnosticsStatusOptions: [], virusCheckStatusOptions: [], driverCheckStatusOptions: [],
    skinnedStatusOptions: [], overallGradeOptions: [], outcomeOptions: []
  };
}

function blankForm() {
  return {
    unitCategoryConfigValueId: '10', manufacturerId: '', unitModelId: '', processorModelId: '',
    ramGb: '', ramTypeConfigValueId: '', memoryModules: [], storageGb: '', storageTypeConfigValueId: '', storageDevices: []
  };
}

test('detected values accept scalar known values and explicit unknown states', () => {
  const values = normalizeDetectedValues({ detected_values: { manufacturer: 'Dell', ram_gb: { state: 'unknown' } } });
  assert.deepEqual(values.get('manufacturer'), { state: 'known', value: 'Dell' });
  assert.deepEqual(values.get('ram_gb'), { state: 'unknown', value: null });
});

test('catalog normalization applies manufacturer, model, and processor in dependency order', () => {
  const data = blankForm();
  const observations = normalizeDetectedValues({
    detected_values: {
      processor: 'Intel Core i5-1145G7',
      model: 'Latitude 5420',
      manufacturer: 'Dell Inc.'
    }
  });
  const states = applyDetectedValues({ formData: data, observations, formOptions: formOptions() });
  assert.equal(data.manufacturerId, '1');
  assert.equal(data.unitModelId, '2');
  assert.equal(data.processorModelId, '4');
  assert.equal(states.get('processor_family'), 'known');
});

test('memory install type and storage wipe status remain evaluable regardless of detected-value ordering', () => {
  const data = blankForm();
  const observations = normalizeDetectedValues({
    detected_values: {
      memory_install_type: 'Removable',
      ram_gb: 16,
      ram_type: 'DDR4',
      storage_wipe_status: 'Passed',
      storage_gb: 512,
      storage_type: 'NVMe'
    }
  });
  applyDetectedValues({ formData: data, observations, formOptions: formOptions() });
  assert.deepEqual(data.memoryModules, [{ sizeGb: '16', ramTypeConfigValueId: '5', memoryInstallTypeCode: 'removable_module' }]);
  assert.deepEqual(data.storageDevices, [{ sizeGb: '512', storageTypeConfigValueId: '6', wipeStatusConfigValueId: '7' }]);
});


test('top-level Unit Category feeds the unit_type requirement without detected_values duplication', () => {
  const data = blankForm();
  const observations = addTopLevelRequirementContext(
    { unit_category_config_value_id: 10 },
    normalizeDetectedValues({ detected_values: { unit_type: 999 } })
  );
  const states = applyDetectedValues({ formData: data, observations, formOptions: formOptions() });
  assert.equal(data.unitCategoryConfigValueId, '10');
  assert.equal(states.get('unit_type'), 'known');
});
