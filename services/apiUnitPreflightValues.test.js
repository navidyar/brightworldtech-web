'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDetectedValues,
  addTopLevelRequirementContext,
  buildCanonicalRequirementObservations,
  applyDetectedValues,
  buildDetectedCatalogIssues
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


test('unmapped detected Model returns a Tool request path instead of silently disappearing', () => {
  const data = blankForm();
  const observations = normalizeDetectedValues({
    detected_values: { manufacturer: 'Dell', model: 'Retired Model 123' }
  });
  const options = formOptions();
  options.unitModels = [];
  const states = applyDetectedValues({ formData: data, observations, formOptions: options });
  const issues = buildDetectedCatalogIssues({ observations, effectiveStates: states, formData: data });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'MODEL_NOT_AVAILABLE');
  assert.equal(issues[0].request_supported, true);
  assert.equal(issues[0].request_endpoint, '/api/v1/units/catalog-requests/model');
  assert.equal(issues[0].request_context.manufacturer_id, 1);
  assert.equal(issues[0].request_context.unit_category_config_value_id, 10);
});

test('unmapped detected Processor identifies the existing Unit Model needed for its catalog request', () => {
  const data = blankForm();
  const observations = normalizeDetectedValues({
    detected_values: { manufacturer: 'Dell', model: 'Latitude 5420', processor: 'Unknown Processor 999' }
  });
  const options = formOptions();
  options.processorModels = [];
  const states = applyDetectedValues({ formData: data, observations, formOptions: options });
  const issues = buildDetectedCatalogIssues({ observations, effectiveStates: states, formData: data });
  const issue = issues.find((entry) => entry.field_key === 'processor');

  assert.ok(issue);
  assert.equal(issue.code, 'PROCESSOR_NOT_AVAILABLE');
  assert.equal(issue.request_supported, true);
  assert.equal(issue.request_endpoint, '/api/v1/units/catalog-requests/processor');
  assert.equal(issue.request_context.unit_model_id, 2);
});


test('canonical Preflight observations come from Commit fields rather than detected_values', () => {
  const observations = buildCanonicalRequirementObservations({
    unit_category_config_value_id: 10,
    fields: {
      manufacturer: 'Dell',
      unit_model: 'Latitude 5420',
      processor_model: 'Intel Core i5-1145G7'
    },
    detected_values: {
      manufacturer: 'Wrong Manufacturer',
      skinned_status: 'Skinned by BWT',
      overall_grade: 'A',
      unit_outcome: 'pass'
    }
  });

  assert.deepEqual(observations.get('manufacturer'), { state: 'known', value: 'Dell' });
  assert.deepEqual(observations.get('model'), { state: 'known', value: 'Latitude 5420' });
  assert.deepEqual(observations.get('processor'), { state: 'known', value: 'Intel Core i5-1145G7' });
  assert.equal(observations.has('skinned_status'), false);
  assert.equal(observations.has('overall_grade'), false);
  assert.equal(observations.has('unit_outcome'), false);
});

test('canonical Preflight derives current Memory and Storage requirements from Tool inventory sections', () => {
  const observations = buildCanonicalRequirementObservations({
    memory: {
      state: 'known',
      modules: [
        { size_gb: 8, ram_type: 'DDR4', install_type: 'removable_module' },
        { size_gb: 8, ram_type: 'DDR4', install_type: 'removable_module' }
      ]
    },
    storage: {
      state: 'known',
      devices: [{ size_gb: 512, type: 'NVMe', internal: true }]
    }
  });

  assert.deepEqual(observations.get('ram_gb'), { state: 'known', value: 16 });
  assert.deepEqual(observations.get('ram_type'), { state: 'known', value: 'DDR4' });
  assert.deepEqual(observations.get('memory_install_type'), { state: 'known', value: 'removable_module' });
  assert.deepEqual(observations.get('storage_gb'), { state: 'known', value: 512 });
  assert.deepEqual(observations.get('storage_type'), { state: 'known', value: 'NVMe' });
});


test('confirmed-absent storage contributes a real zero current-storage observation to Preflight', () => {
  const observations = buildCanonicalRequirementObservations({
    storage: { state: 'confirmed_absent' }
  });
  assert.deepEqual(observations.get('storage_gb'), { state: 'known', value: 0 });
  assert.equal(observations.has('storage_type'), false);
});

test('existing Unit Preflight can exclude submitted Unit Category so stored category remains authoritative', () => {
  const observations = buildCanonicalRequirementObservations({
    unit_category_config_value_id: 999,
    fields: { manufacturer: 'Dell' }
  }, { includeUnitCategory: false });

  assert.equal(observations.has('unit_type'), false);
  assert.deepEqual(observations.get('manufacturer'), { state: 'known', value: 'Dell' });
});
