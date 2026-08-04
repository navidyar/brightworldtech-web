'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createUnitLotDestinationValidator
} = require('./unitLotDestinationValidationModel');

function createDependencies({ workflow = null, profileFieldRequired = false } = {}) {
  const baseFormData = {
    assetTag: 'BWT2300001',
    lotId: '2',
    unitCategoryConfigValueId: '10',
    manufacturerId: '20',
    unitModelId: '',
    processorModelId: '',
    memoryModules: [],
    storageDevices: []
  };

  return {
    techUnits: {
      getUnitById: async () => ({ unit_id: 1, lot_id: 2, unit_model_id: null, processor_model_id: null }),
      getTechUnitFormOptions: async () => ({
        lots: [{ lot_id: 7, lot_name: 'Destination Lot' }],
        unitCategories: [{ id: 10, label: 'Laptop' }],
        manufacturers: [{ id: 20, label: 'Dell' }],
        unitModels: [],
        processorModels: [],
        ramTypes: [],
        storageTypes: []
      }),
      getUnitFormDataById: async () => ({ ...baseFormData })
    },
    issueEntries: {
      getIssueFormOptions: async () => ({ defaultCommentTypeConfigValueId: '90' }),
      getIssueFormDataByUnitId: async () => ({ cosmeticIssues: [], hardwareIssues: [] })
    },
    expandedForms: {
      getExpandedFormOptions: async () => ({}),
      getExpandedFormDataByUnitId: async () => ({ biosVersion: '' })
    },
    formProfiles: {
      getRequirementAwareUnitFormProfileForLot: async () => ({ selectedLot: { lotId: 7 } })
    },
    lotRequirements: {
      buildWorkflowForForm: async () => workflow || {
        lotName: 'Destination Lot',
        saveAllowed: true,
        technicalFailure: false,
        issueChecks: []
      }
    },
    applySubmissionPolicy: ({ submittedFormData }) => ({
      formData: submittedFormData,
      errors: profileFieldRequired ? ['BIOS Serial Number is required by the selected Lot.'] : [],
      fieldErrors: profileFieldRequired
        ? [{ code: 'required', fieldKey: 'bios_serial_number', label: 'BIOS Serial Number' }]
        : []
    })
  };
}

test('existing Unit destination validation uses normalized current form data', async () => {
  const validator = createUnitLotDestinationValidator(createDependencies());
  const decision = await validator.validateExistingUnitDestination({ unitId: 1, destinationLotId: 7 });

  assert.equal(decision.allowed, true);
  assert.equal(decision.lotId, 7);
  assert.equal(decision.submissionPolicy.formData.lotId, '7');
});

test('destination form requirements block an existing Unit move', async () => {
  const validator = createUnitLotDestinationValidator(createDependencies({ profileFieldRequired: true }));

  await assert.rejects(
    () => validator.assertExistingUnitDestination({ unitId: 1, destinationLotId: 7 }),
    (error) => error.code === 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED' && /BIOS Serial Number/.test(error.message)
  );
});

test('Strict destination requirement failures block a move', async () => {
  const validator = createUnitLotDestinationValidator(createDependencies({
    workflow: {
      lotName: 'Destination Lot',
      saveAllowed: false,
      technicalFailure: true,
      headline: 'Unit does not meet Lot requirements',
      issueChecks: [{ requirementLabel: 'Manufacturer', requiredValue: 'Microsoft', actualValue: 'Dell' }]
    }
  }));

  await assert.rejects(
    () => validator.assertExistingUnitDestination({ unitId: 1, destinationLotId: 7 }),
    /Manufacturer/
  );
});

test('submitted new Unit snapshots are rechecked against the latest destination profile', async () => {
  const validator = createUnitLotDestinationValidator(createDependencies());
  const decision = await validator.validateSubmittedUnitDestination({
    destinationLotId: 7,
    formData: {
      unitCategoryConfigValueId: '10',
      manufacturerId: '20',
      memoryModules: [],
      storageDevices: []
    }
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.submissionPolicy.formData.lotId, '7');
});

test('existing General Comment history can satisfy a destination required-field rule', async () => {
  let seenComment = '';
  const dependencies = createDependencies();
  dependencies.issueEntries.getGeneralCommentValidationDataByUnitId = async () => ({
    generalCommentTypeConfigValueId: '90',
    generalCommentText: 'QC exception documented.'
  });
  dependencies.applySubmissionPolicy = ({ submittedFormData }) => {
    seenComment = submittedFormData.generalCommentText;
    return { formData: submittedFormData, errors: [], fieldErrors: [] };
  };
  const validator = createUnitLotDestinationValidator(dependencies);

  const decision = await validator.validateExistingUnitDestination({ unitId: 1, destinationLotId: 7 });

  assert.equal(decision.allowed, true);
  assert.equal(seenComment, 'QC exception documented.');
});
