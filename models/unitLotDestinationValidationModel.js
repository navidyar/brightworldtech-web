'use strict';

const {
  assertDestinationValidation,
  buildDestinationValidationDecision
} = require('../services/unitLotDestinationValidation');

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function createUnitLotDestinationValidator({
  techUnits,
  issueEntries,
  expandedForms,
  formProfiles,
  lotRequirements,
  applySubmissionPolicy
} = {}) {
  if (!techUnits || !issueEntries || !expandedForms || !formProfiles || !lotRequirements || typeof applySubmissionPolicy !== 'function') {
    throw new Error('Complete Unit Lot destination validation dependencies are required.');
  }

  async function getDestinationFormOptions({ unit = null, destinationLotId }) {
    const baseOptions = await techUnits.getTechUnitFormOptions({
      includeCurrentLotId: unit && unit.lot_id,
      includeCurrentUnitModelId: unit && unit.unit_model_id,
      includeCurrentProcessorModelId: unit && unit.processor_model_id
    });
    const [issueOptions, expandedOptions] = await Promise.all([
      issueEntries.getIssueFormOptions(),
      expandedForms.getExpandedFormOptions()
    ]);

    return {
      ...baseOptions,
      ...issueOptions,
      ...expandedOptions,
      currentLotId: unit && unit.lot_id ? Number(unit.lot_id) : null
    };
  }

  function assertDestinationIsAssignable(formOptions, destinationLotId) {
    const safeDestinationLotId = normalizePositiveInteger(destinationLotId);
    const assignable = safeDestinationLotId && (Array.isArray(formOptions && formOptions.lots) ? formOptions.lots : [])
      .some((lot) => {
        if (Number(lot.lot_id) !== safeDestinationLotId) {
          return false;
        }

        if (lot.isCurrentLot === true) {
          return Number(lot.lot_id) === Number(formOptions.currentLotId);
        }

        return Number(lot.isCurrentLotClosed || 0) !== 1;
      });

    if (!assignable) {
      const error = new Error('The selected destination Lot is not open, visible, and assignable.');
      error.code = 'BWT_LOT_DESTINATION_NOT_OPEN';
      throw error;
    }

    return safeDestinationLotId;
  }

  async function buildExistingUnitDestinationFormData({ unitId, destinationLotId, formOptions }) {
    const [baseFormData, issueFormData, generalCommentData, expandedFormData] = await Promise.all([
      techUnits.getUnitFormDataById(unitId, formOptions),
      issueEntries.getIssueFormDataByUnitId(unitId),
      typeof issueEntries.getGeneralCommentValidationDataByUnitId === 'function'
        ? issueEntries.getGeneralCommentValidationDataByUnitId(unitId)
        : Promise.resolve({ generalCommentTypeConfigValueId: '', generalCommentText: '' }),
      expandedForms.getExpandedFormDataByUnitId(unitId)
    ]);

    if (!baseFormData) {
      const error = new Error('The selected Unit could not be found.');
      error.code = 'BWT_UNIT_NOT_FOUND';
      throw error;
    }

    return {
      ...baseFormData,
      ...issueFormData,
      ...expandedFormData,
      lotId: String(destinationLotId),
      generalCommentTypeConfigValueId: generalCommentData.generalCommentTypeConfigValueId
        || issueFormData.generalCommentTypeConfigValueId
        || formOptions.defaultCommentTypeConfigValueId
        || '',
      generalCommentText: generalCommentData.generalCommentText || ''
    };
  }

  async function validateFormDataDestination({
    mode,
    formData,
    destinationLotId,
    unitId = null,
    existingFormData = null,
    formOptions
  }) {
    const safeDestinationLotId = assertDestinationIsAssignable(formOptions, destinationLotId);
    const profile = await formProfiles.getRequirementAwareUnitFormProfileForLot(safeDestinationLotId);
    const destinationFormData = {
      ...formData,
      lotId: String(safeDestinationLotId)
    };
    const submissionPolicy = applySubmissionPolicy({
      mode,
      submittedFormData: destinationFormData,
      existingFormData: mode === 'edit' ? (existingFormData || destinationFormData) : null,
      profile
    });
    const workflow = await lotRequirements.buildWorkflowForForm({
      lotId: safeDestinationLotId,
      unitId,
      formData: submissionPolicy.formData,
      formOptions
    });
    const decision = buildDestinationValidationDecision({
      lotId: safeDestinationLotId,
      lotName: workflow && workflow.lotName,
      submissionPolicy,
      workflow
    });

    return decision;
  }

  async function validateExistingUnitDestination({ unitId, destinationLotId }) {
    const safeUnitId = normalizePositiveInteger(unitId);

    if (!safeUnitId) {
      const error = new Error('The selected Unit could not be verified.');
      error.code = 'BWT_UNIT_NOT_FOUND';
      throw error;
    }

    const unit = await techUnits.getUnitById(safeUnitId);

    if (!unit) {
      const error = new Error('The selected Unit could not be found.');
      error.code = 'BWT_UNIT_NOT_FOUND';
      throw error;
    }

    const formOptions = await getDestinationFormOptions({ unit, destinationLotId });
    const existingFormData = await buildExistingUnitDestinationFormData({
      unitId: safeUnitId,
      destinationLotId,
      formOptions
    });

    return validateFormDataDestination({
      mode: 'edit',
      formData: existingFormData,
      existingFormData,
      destinationLotId,
      unitId: safeUnitId,
      formOptions
    });
  }

  async function assertExistingUnitDestination(input) {
    return assertDestinationValidation(await validateExistingUnitDestination(input));
  }

  async function validateSubmittedUnitDestination({ formData = {}, destinationLotId = null, unitId = null }) {
    const safeDestinationLotId = normalizePositiveInteger(destinationLotId || formData.lotId);
    const unit = unitId ? await techUnits.getUnitById(unitId) : null;
    const formOptions = await getDestinationFormOptions({ unit, destinationLotId: safeDestinationLotId });

    return validateFormDataDestination({
      mode: unitId ? 'edit' : 'create',
      formData: {
        ...formData,
        lotId: String(safeDestinationLotId || '')
      },
      existingFormData: unitId ? formData : null,
      destinationLotId: safeDestinationLotId,
      unitId,
      formOptions
    });
  }

  async function assertSubmittedUnitDestination(input) {
    return assertDestinationValidation(await validateSubmittedUnitDestination(input));
  }

  return {
    assertExistingUnitDestination,
    assertSubmittedUnitDestination,
    buildExistingUnitDestinationFormData,
    getDestinationFormOptions,
    validateExistingUnitDestination,
    validateSubmittedUnitDestination
  };
}

let defaultValidator = null;

function getDefaultValidator() {
  if (!defaultValidator) {
    const techUnitModel = require('./techUnitModel');
    const unitIssueEntryModel = require('./unitIssueEntryModel');
    const unitExpandedFormModel = require('./unitExpandedFormModel');
    const lotUnitFormProfileModel = require('./lotUnitFormProfileModel');
    const techLotRequirementModel = require('./techLotRequirementModel');
    const { applyUnitFormSubmissionPolicy } = require('../services/unitFormSubmissionPolicy');

    defaultValidator = createUnitLotDestinationValidator({
      techUnits: techUnitModel,
      issueEntries: unitIssueEntryModel,
      expandedForms: unitExpandedFormModel,
      formProfiles: lotUnitFormProfileModel,
      lotRequirements: techLotRequirementModel,
      applySubmissionPolicy: applyUnitFormSubmissionPolicy
    });
  }

  return defaultValidator;
}

module.exports = {
  createUnitLotDestinationValidator,
  assertExistingUnitDestination: (...args) => getDefaultValidator().assertExistingUnitDestination(...args),
  assertSubmittedUnitDestination: (...args) => getDefaultValidator().assertSubmittedUnitDestination(...args),
  buildExistingUnitDestinationFormData: (...args) => getDefaultValidator().buildExistingUnitDestinationFormData(...args),
  getDestinationFormOptions: (...args) => getDefaultValidator().getDestinationFormOptions(...args),
  validateExistingUnitDestination: (...args) => getDefaultValidator().validateExistingUnitDestination(...args),
  validateSubmittedUnitDestination: (...args) => getDefaultValidator().validateSubmittedUnitDestination(...args)
};
