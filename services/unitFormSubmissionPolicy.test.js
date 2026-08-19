'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLotUnitFormProfile } = require('./lotUnitFormProfileResolver');
const {
  applyUnitFormSubmissionPolicy,
  assertUnitFormSubmissionPolicyBindings,
  buildManagedValidationFormData,
  isUnitFormFieldManaged
} = require('./unitFormSubmissionPolicy');

const lineage = [
  { lotId: 10, parentLotId: null, name: 'Test Lot', depth: 0 }
];

function buildProfile(rules = []) {
  return resolveLotUnitFormProfile({
    lineage,
    rules: rules.map((rule) => ({ lotId: 10, ...rule }))
  });
}

function buildFormData(overrides = {}) {
  return {
    unitSerialNumber: '',
    biosSerialNumber: '',
    manufacturerId: '',
    unitModelId: '',
    processorModelId: '',
    processorSpeedGhz: '',
    previousMemoryModules: [],
    previousRamGb: '',
    memoryModules: [],
    ramGb: '',
    ramTypeConfigValueId: '',
    previousStorageDevices: [],
    previousStorageGb: '',
    storageDevices: [],
    storageGb: '',
    storageTypeConfigValueId: '',
    operatingSystemConfigValueId: '',
    osBuild: '',
    biosVersion: '',
    absoluteStatusConfigValueId: '',
    physicalCameraStatusConfigValueId: '',
    touchscreenStatusConfigValueId: '',
    keyboardLanguageConfigValueId: '',
    completeDiagnosticsStatusConfigValueId: '',
    virusCheckStatusConfigValueId: '',
    driverCheckStatusConfigValueId: '',
    skinnedStatusConfigValueId: '',
    cosmeticIssues: [],
    hardwareIssues: [],
    overallGradeConfigValueId: '',
    overallGradeNotes: '',
    outcomeCode: '',
    outcomeNotes: '',
    outcomeApprovalRequested: false,
    outcomeApprovalRequestNotes: '',
    generalCommentText: '',
    generalCommentTypeConfigValueId: '',
    ...overrides
  };
}

test('submission policy covers every Lot-configurable registry field', () => {
  assert.equal(assertUnitFormSubmissionPolicyBindings(), true);
});

test('required simple fields return a field-specific server error', () => {
  const profile = buildProfile([
    { fieldKey: 'bios_serial_number', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData(),
    profile
  });

  assert.deepEqual(result.errors, ['BIOS Serial Number is required by the selected Lot.']);
  assert.equal(result.fieldErrors[0].fieldKey, 'bios_serial_number');
  assert.equal(result.fieldErrors[0].code, 'required');
});

test('required repeatable sections require one complete meaningful row', () => {
  const profile = buildProfile([
    { fieldKey: 'memory_modules', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const incomplete = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      memoryModules: [{ slotLabel: 'Slot 1', sizeGb: '', memoryInstallTypeCode: '' }]
    }),
    profile
  });
  const complete = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      memoryModules: [{ slotLabel: 'Slot 1', sizeGb: '16', memoryInstallTypeCode: 'removable_module' }],
      ramGb: '16'
    }),
    profile
  });

  assert.equal(incomplete.fieldErrors[0].fieldKey, 'memory_modules');
  assert.equal(complete.errors.length, 0);
});

test('hidden Create values are ignored and removed before persistence', () => {
  const profile = buildProfile([
    { fieldKey: 'bios_serial_number', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({ biosSerialNumber: 'HIDDEN-BIOS' }),
    profile
  });

  assert.equal(result.formData.biosSerialNumber, '');
  assert.equal(result.errors.length, 0);
  assert.equal(result.fieldErrors.length, 0);
  assert.equal(isUnitFormFieldManaged(result.formData, 'bios_serial_number'), false);
});

test('hidden optional Processor Speed ignores a catalog-derived speed during Create', () => {
  const profile = buildProfile([
    { fieldKey: 'processor_speed_ghz', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      processorModelId: '77',
      processorSpeedGhz: '2.20'
    }),
    profile
  });

  assert.equal(result.formData.processorModelId, '77');
  assert.equal(result.formData.processorSpeedGhz, '');
  assert.equal(result.errors.length, 0);
  assert.equal(result.fieldErrors.length, 0);
  assert.equal(isUnitFormFieldManaged(result.formData, 'processor_speed_ghz'), false);
});

test('default blank rows do not count as hidden Create values', () => {
  const profile = buildProfile([
    { fieldKey: 'memory_modules', visibilityMode: 'hidden', requirementMode: 'optional' },
    { fieldKey: 'storage_devices', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      memoryModules: [{ slotLabel: 'Slot 1', sizeGb: '', memoryInstallTypeCode: '' }],
      storageDevices: [{ slotLabel: 'Drive 1', sizeGb: '' }]
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.formData.memoryModules, []);
  assert.deepEqual(result.formData.storageDevices, []);
});

test('default blank Previous hardware rows do not count as hidden Create values', () => {
  const profile = buildProfile([
    { fieldKey: 'memory_modules', visibilityMode: 'hidden', requirementMode: 'optional' },
    { fieldKey: 'storage_devices', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      previousMemoryModules: [{
        slotLabel: 'Slot 1',
        sizeGb: '',
        ramTypeConfigValueId: '',
        memoryInstallTypeCode: '',
        speedMhz: '',
        manufacturerName: '',
        partNumber: '',
        serialNumber: '',
        changeNotes: ''
      }],
      previousStorageDevices: [{
        slotLabel: 'Drive 1',
        sizeGb: '',
        storageTypeConfigValueId: '',
        manufacturerName: '',
        modelNumber: '',
        serialNumber: '',
        firmwareVersion: '',
        wipeStatusConfigValueId: '',
        changeNotes: ''
      }]
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.formData.previousMemoryModules, []);
  assert.deepEqual(result.formData.previousStorageDevices, []);
});

test('a default General Comment type does not count as a hidden Create value without comment text', () => {
  const profile = buildProfile([
    { fieldKey: 'general_comment', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      generalCommentText: '',
      generalCommentTypeConfigValueId: '123'
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.formData.generalCommentText, '');
  assert.equal(result.formData.generalCommentTypeConfigValueId, '');
  assert.equal(isUnitFormFieldManaged(result.formData, 'general_comment'), false);
});

test('hidden General Comment text is ignored and removed during Create', () => {
  const profile = buildProfile([
    { fieldKey: 'general_comment', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      generalCommentText: 'Hidden comment text',
      generalCommentTypeConfigValueId: '123'
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.fieldErrors.length, 0);
  assert.equal(result.formData.generalCommentText, '');
  assert.equal(result.formData.generalCommentTypeConfigValueId, '');
});

test('hidden Edit fields preserve authoritative existing values', () => {
  const profile = buildProfile([
    { fieldKey: 'bios_serial_number', visibilityMode: 'hidden', requirementMode: 'optional' },
    { fieldKey: 'memory_modules', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const existingFormData = buildFormData({
    biosSerialNumber: 'ORIGINAL-BIOS',
    memoryModules: [{ slotLabel: 'Slot 1', sizeGb: '16', memoryInstallTypeCode: 'removable_module' }],
    ramGb: '16',
    ramTypeConfigValueId: '7'
  });
  const result = applyUnitFormSubmissionPolicy({
    mode: 'edit',
    submittedFormData: buildFormData({
      biosSerialNumber: 'TAMPERED',
      memoryModules: [],
      ramGb: '',
      ramTypeConfigValueId: ''
    }),
    existingFormData,
    profile
  });

  assert.equal(result.formData.biosSerialNumber, 'ORIGINAL-BIOS');
  assert.equal(result.formData.ramGb, '16');
  assert.deepEqual(result.formData.memoryModules, existingFormData.memoryModules);
  assert.equal(isUnitFormFieldManaged(result.formData, 'bios_serial_number'), false);
  assert.equal(isUnitFormFieldManaged(result.formData, 'memory_modules'), false);
});

test('hidden repeatable child fields preserve the matching existing row by row ID', () => {
  const profile = buildProfile([
    { fieldKey: 'battery_cycle_count', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const existingFormData = buildFormData({
    batteries: [
      { rowId: '10', healthPercent: '88', cycleCount: '100' },
      { rowId: '20', healthPercent: '91', cycleCount: '200' }
    ]
  });
  const result = applyUnitFormSubmissionPolicy({
    mode: 'edit',
    submittedFormData: buildFormData({
      batteries: [
        { rowId: '20', healthPercent: '93', cycleCount: '' }
      ]
    }),
    existingFormData,
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.formData.batteries, [
    { rowId: '20', healthPercent: '93', cycleCount: '200' }
  ]);
  assert.equal(isUnitFormFieldManaged(result.formData, 'battery_cycle_count'), false);
});

test('visible optional Edit fields may be intentionally cleared', () => {
  const profile = buildProfile();
  const result = applyUnitFormSubmissionPolicy({
    mode: 'edit',
    submittedFormData: buildFormData({ operatingSystemConfigValueId: '' }),
    existingFormData: buildFormData({ operatingSystemConfigValueId: '99' }),
    profile
  });

  assert.equal(result.formData.operatingSystemConfigValueId, '');
  assert.equal(isUnitFormFieldManaged(result.formData, 'operating_system'), true);
});

test('hidden Unit Outcome preserves its protected approval companion values', () => {
  const profile = buildProfile([
    { fieldKey: 'unit_outcome', visibilityMode: 'hidden', requirementMode: 'optional' },
    { fieldKey: 'outcome_notes', visibilityMode: 'hidden', requirementMode: 'inherit' }
  ]);
  const existingFormData = buildFormData({
    outcomeCode: 'fail',
    outcomeNotes: 'Existing outcome note',
    outcomeApprovalRequested: true,
    outcomeApprovalRequestNotes: 'Existing approval request'
  });
  const result = applyUnitFormSubmissionPolicy({
    mode: 'edit',
    submittedFormData: buildFormData({
      outcomeCode: 'pass',
      outcomeNotes: 'Tampered note',
      outcomeApprovalRequested: false,
      outcomeApprovalRequestNotes: ''
    }),
    existingFormData,
    profile
  });

  assert.equal(result.formData.outcomeCode, 'fail');
  assert.equal(result.formData.outcomeNotes, 'Existing outcome note');
  assert.equal(result.formData.outcomeApprovalRequested, true);
  assert.equal(result.formData.outcomeApprovalRequestNotes, 'Existing approval request');
});

test('managed validation data masks hidden legacy values from ordinary field validation', () => {
  const profile = buildProfile([
    { fieldKey: 'processor_speed_ghz', visibilityMode: 'hidden', requirementMode: 'optional' },
    { fieldKey: 'cosmetic_issues', visibilityMode: 'hidden', requirementMode: 'optional' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'edit',
    submittedFormData: buildFormData(),
    existingFormData: buildFormData({
      processorSpeedGhz: 'not-a-number',
      cosmeticIssues: [{ issueTypeConfigValueId: '', severityConfigValueId: '', locationConfigValueId: '', issueRemark: 'Legacy incomplete row' }]
    }),
    profile
  });
  const validationData = buildManagedValidationFormData(result.formData);

  assert.equal(validationData.processorSpeedGhz, '');
  assert.deepEqual(validationData.cosmeticIssues, []);
  assert.equal(result.formData.processorSpeedGhz, 'not-a-number');
});



test('zero-size memory and storage rows count as explicit empty-slot records', () => {
  const profile = buildProfile([
    { fieldKey: 'memory_modules', visibilityMode: 'visible', requirementMode: 'required' },
    { fieldKey: 'storage_devices', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      memoryModules: [{ slotLabel: 'Slot 1', sizeGb: '0', ramTypeConfigValueId: '', memoryInstallTypeCode: '' }],
      ramGb: '0',
      storageDevices: [{ slotLabel: 'Drive 1', sizeGb: '0', storageTypeConfigValueId: '', wipeStatusConfigValueId: '' }],
      storageGb: '0'
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.formData.memoryModules[0].sizeGb, '0');
  assert.equal(result.formData.storageDevices[0].sizeGb, '0');
});


test('required cosmetic issues accept an explicit None selection without severity or location', () => {
  const profile = buildProfile([
    { fieldKey: 'cosmetic_issues', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      cosmeticIssues: [{
        issueTypeConfigValueId: '41',
        severityConfigValueId: '',
        locationConfigValueId: '',
        issueRemark: '',
        isNoIssue: '1'
      }]
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.formData.cosmeticIssues[0].isNoIssue, '1');
});

test('ordinary cosmetic issues still require severity and location', () => {
  const profile = buildProfile([
    { fieldKey: 'cosmetic_issues', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      cosmeticIssues: [{
        issueTypeConfigValueId: '42',
        severityConfigValueId: '',
        locationConfigValueId: '',
        issueRemark: '',
        isNoIssue: ''
      }]
    }),
    profile
  });

  assert.equal(result.fieldErrors[0].fieldKey, 'cosmetic_issues');
});


test('required hardware issues accept an explicit None selection without custom issue or location', () => {
  const profile = buildProfile([
    { fieldKey: 'hardware_issues', visibilityMode: 'visible', requirementMode: 'required' }
  ]);
  const result = applyUnitFormSubmissionPolicy({
    mode: 'create',
    submittedFormData: buildFormData({
      hardwareIssues: [{
        issueTypeConfigValueId: '51',
        customIssueLabel: '',
        locationConfigValueId: '',
        issueRemark: '',
        isNoIssue: '1'
      }]
    }),
    profile
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.formData.hardwareIssues[0].isNoIssue, '1');
});
