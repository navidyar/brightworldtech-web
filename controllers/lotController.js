const lotModel = require('../models/lotModel');
const lotValidationModel = require('../models/lotValidationModel');
const lotEnforcementModel = require('../models/lotEnforcementModel');
const requirementOptionModel = require('../models/requirementOptionModel');

const requirementFieldOptions = [
  {
    value: 'unit_type',
    label: 'Unit Type',
    helpText: 'Example: Laptop, Desktop, MacBook'
  },
  {
    value: 'manufacturer',
    label: 'Manufacturer',
    helpText: 'Example: Dell, HP, Lenovo, Apple'
  },
  {
    value: 'model',
    label: 'Model',
    helpText: 'Example: Latitude 5400, EliteBook 830 G7'
  },
  {
    value: 'ram_size',
    label: 'Memory Size',
    helpText: 'Example: 8GB, 16GB, 32GB'
  },
  {
    value: 'ram_type',
    label: 'Memory Type',
    helpText: 'Example: DDR4, DDR5, LPDDR4X'
  },
  {
    value: 'storage_size',
    label: 'SSD / Storage Size',
    helpText: 'Example: 256GB, 512GB, 1TB'
  },
  {
    value: 'storage_type',
    label: 'SSD / Storage Type',
    helpText: 'Example: 2.5 SATA, M.2 SATA, M.2 NVMe'
  },
  {
    value: 'processor_brand',
    label: 'CPU Brand',
    helpText: 'Example: Intel, AMD, Apple'
  },
  {
    value: 'processor_model',
    label: 'CPU Model',
    helpText: 'Example: i5-8365U, Ryzen 5 5600U, M1'
  },
  {
    value: 'touchscreen',
    label: 'Touchscreen',
    helpText: 'Use yes, no, or any.'
  }
];

const operatorOptions = [
  {
    value: 'equals',
    label: 'Must equal'
  },
  {
    value: 'not_equals',
    label: 'Must not equal'
  },
  {
    value: 'minimum',
    label: 'Minimum'
  },
  {
    value: 'maximum',
    label: 'Maximum'
  },
  {
    value: 'contains',
    label: 'Contains'
  }
];

function getRequirementKeys() {
  return requirementFieldOptions.map((option) => option.value);
}

async function getRequirementValueOptionsByKey() {
  return requirementOptionModel.getRequirementValueOptionsByKey(getRequirementKeys());
}

function getBlankLotFormData() {
  return {
    lotName: '',
    parentLotId: '',
    lotTypeConfigValueId: '',
    defaultGradeConfigValueId: '',
    defaultProductionWeightConfigValueId: '',
    hasUnlimitedGoal: '0',
    unitAmountGoal: '',
    deadline: '',
    labelFormat: '',
    objectives: '',
    notes: ''
  };
}

function getLotFormDataFromRequest(req) {
  return {
    lotName: String(req.body.lotName || '').trim(),
    parentLotId: String(req.body.parentLotId || '').trim(),
    lotTypeConfigValueId: String(req.body.lotTypeConfigValueId || '').trim(),
    defaultGradeConfigValueId: String(req.body.defaultGradeConfigValueId || '').trim(),
    defaultProductionWeightConfigValueId: String(req.body.defaultProductionWeightConfigValueId || '').trim(),
    hasUnlimitedGoal: req.body.hasUnlimitedGoal === '1' ? '1' : '0',
    unitAmountGoal: String(req.body.unitAmountGoal || '').trim(),
    deadline: String(req.body.deadline || '').trim(),
    labelFormat: String(req.body.labelFormat || '').trim(),
    objectives: String(req.body.objectives || '').trim(),
    notes: String(req.body.notes || '').trim()
  };
}

function pickFirstBodyValue(value) {
  if (Array.isArray(value)) {
    const firstNonEmptyValue = value.find((item) => String(item || '').trim());

    return String(firstNonEmptyValue || '').trim();
  }

  return String(value || '').trim();
}

function getBlankRequirementFormData() {
  return {
    requirementKey: '',
    operatorCode: 'equals',
    requiredValue: '',
    notes: ''
  };
}

function getRequirementFormDataFromRequest(req) {
  return {
    requirementKey: String(req.body.requirementKey || '').trim(),
    operatorCode: String(req.body.operatorCode || 'equals').trim(),
    requiredValue: pickFirstBodyValue(req.body.requiredValue),
    notes: String(req.body.notes || '').trim()
  };
}

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function sendHtmxRedirect(req, res, redirectUrl) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', redirectUrl);
    return res.send('');
  }

  return res.redirect(redirectUrl);
}

function setNoStoreHeaders(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

function addCacheBuster(redirectUrl) {
  const separator = redirectUrl.includes('?') ? '&' : '?';
  return `${redirectUrl}${separator}refresh=${Date.now()}`;
}

function formatDateForInput(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function getLotFormDataFromLot(lot) {
  return {
    lotName: lot.lot_name || '',
    parentLotId: lot.parent_lot_id || '',
    lotTypeConfigValueId: lot.lot_type_config_value_id || '',
    defaultGradeConfigValueId: lot.default_grade_config_value_id || '',
    defaultProductionWeightConfigValueId: lot.default_production_weight_config_value_id || '',
    hasUnlimitedGoal: lot.isUnlimited ? '1' : '0',
    unitAmountGoal: lot.isUnlimited ? '' : String(lot.unitGoal || lot.unit_amount_goal || ''),
    deadline: formatDateForInput(lot.deadline),
    labelFormat: lot.label_format || '',
    objectives: lot.objectives || '',
    notes: lot.notes || ''
  };
}

function getRequirementFormDataFromRequirement(requirement) {
  return {
    requirementKey: requirement.requirement_key || '',
    operatorCode: requirement.operator_code || 'equals',
    requiredValue: requirement.required_value || '',
    notes: requirement.notes || ''
  };
}

function renderLotModal(res, { mode, formOptions, formData, lot = null, errorMessages = [] }) {
  return res.render('fragments/lot-form-modal', {
    mode,
    lot,
    formOptions,
    formData,
    errorMessages
  });
}

function renderRequirementModal(res, {
  mode,
  lot,
  requirement = null,
  requirementValueOptionsByKey,
  formData,
  errorMessages = []
}) {
  return res.render('fragments/lot-requirement-form-modal', {
    mode,
    lot,
    requirement,
    requirementValueOptionsByKey,
    requirementFieldOptions,
    operatorOptions,
    formData,
    errorMessages
  });
}

function validateLotForm(formData, formOptions, currentLotId = null) {
  const errors = [];

  if (!formData.lotName || formData.lotName.length < 2) {
    errors.push('Lot name is required.');
  }

  if (formOptions.capabilities.hasLotType && !formData.lotTypeConfigValueId) {
    errors.push('Lot type is required.');
  }

  if (formData.parentLotId && !Number.isInteger(Number(formData.parentLotId))) {
    errors.push('Parent lot must be a valid lot.');
  }

  if (currentLotId && formData.parentLotId && Number(formData.parentLotId) === Number(currentLotId)) {
    errors.push('A lot cannot be its own parent lot.');
  }

  if (formData.lotTypeConfigValueId && !Number.isInteger(Number(formData.lotTypeConfigValueId))) {
    errors.push('Lot type must be valid.');
  }

  if (formData.defaultGradeConfigValueId && !Number.isInteger(Number(formData.defaultGradeConfigValueId))) {
    errors.push('Default grade must be valid.');
  }

  if (formData.defaultProductionWeightConfigValueId && !Number.isInteger(Number(formData.defaultProductionWeightConfigValueId))) {
    errors.push('Default production weight must be valid.');
  }

  if (formData.hasUnlimitedGoal !== '1') {
    const goal = Number(formData.unitAmountGoal);

    if (!Number.isInteger(goal) || goal <= 0) {
      errors.push('Unit amount goal must be a positive whole number, or choose unlimited.');
    }
  }

  if (formData.deadline && Number.isNaN(new Date(formData.deadline).getTime())) {
    errors.push('Deadline must be a valid date.');
  }

  if (formData.lotName.length > 120) {
    errors.push('Lot name must be 120 characters or fewer.');
  }

  if (formData.labelFormat.length > 120) {
    errors.push('Label format must be 120 characters or fewer.');
  }

  return errors;
}

function validateRequirementForm(formData) {
  const errors = [];
  const allowedRequirementKeys = requirementFieldOptions.map((option) => option.value);
  const allowedOperatorCodes = operatorOptions.map((option) => option.value);

  if (!allowedRequirementKeys.includes(formData.requirementKey)) {
    errors.push('Requirement field is required.');
  }

  if (!allowedOperatorCodes.includes(formData.operatorCode)) {
    errors.push('Requirement rule is invalid.');
  }

  if (!formData.requiredValue) {
    errors.push('Required value is required.');
  }

  if (formData.requiredValue.length > 120) {
    errors.push('Required value must be 120 characters or fewer.');
  }

  if (formData.notes.length > 500) {
    errors.push('Requirement notes must be 500 characters or fewer.');
  }

  return errors;
}

function sortLotsByName(a, b) {
  return String(a.lot_name || '').localeCompare(String(b.lot_name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function buildLotRelationshipData(lot, lots) {
  const lotsById = new Map();

  lots.forEach((listedLot) => {
    lotsById.set(String(listedLot.lot_id), listedLot);
  });

  lotsById.set(String(lot.lot_id), lot);

  const parentLot = lot.parent_lot_id
    ? lotsById.get(String(lot.parent_lot_id)) || null
    : null;

  const directChildLots = lots
    .filter((listedLot) => String(listedLot.parent_lot_id || '') === String(lot.lot_id))
    .sort(sortLotsByName);

  const breadcrumbs = [];
  const visitedLotIds = new Set();
  let currentLot = lot;
  let guardCount = 0;

  while (currentLot && guardCount < 25) {
    const currentLotId = String(currentLot.lot_id);

    if (visitedLotIds.has(currentLotId)) {
      break;
    }

    visitedLotIds.add(currentLotId);
    breadcrumbs.unshift(currentLot);

    currentLot = currentLot.parent_lot_id
      ? lotsById.get(String(currentLot.parent_lot_id)) || null
      : null;

    guardCount += 1;
  }

  const siblingLots = parentLot
    ? lots
        .filter((listedLot) => (
          String(listedLot.parent_lot_id || '') === String(parentLot.lot_id) &&
          String(listedLot.lot_id) !== String(lot.lot_id)
        ))
        .sort(sortLotsByName)
    : [];

  return {
    parentLot,
    directChildLots,
    siblingLots,
    breadcrumbs
  };
}

function getRequirementDisplayLabel(requirementKey) {
  const option = requirementFieldOptions.find((fieldOption) => fieldOption.value === requirementKey);

  return option ? option.label : requirementKey;
}

function getOperatorDisplayLabel(operatorCode) {
  const option = operatorOptions.find((operatorOption) => operatorOption.value === operatorCode);

  return option ? option.label : operatorCode;
}

function buildRequirementValidationSummary(requirements, validationReport) {
  const activeRequirements = requirements.filter((requirement) => Number(requirement.is_active) === 1);

  return activeRequirements.map((requirement) => {
    const requirementKey = String(requirement.requirement_key || '').trim();
    const operatorCode = String(requirement.operator_code || 'equals').trim();
    const requiredValue = String(requirement.required_value || '').trim();

    const matchingChecks = validationReport.units.flatMap((unit) => {
      return unit.checks
        .filter((check) => (
          String(check.requirementKey || '') === requirementKey &&
          String(check.operatorCode || 'equals') === operatorCode &&
          String(check.requiredValue || '') === requiredValue
        ))
        .map((check) => ({
          ...check,
          unitLabel: unit.label,
          unitStatus: unit.status
        }));
    });

    return {
      requirementKey,
      requirementLabel: getRequirementDisplayLabel(requirementKey),
      operatorCode,
      operatorLabel: getOperatorDisplayLabel(operatorCode),
      requiredValue,
      notes: requirement.notes || '',
      totalCount: matchingChecks.length,
      acceptedCount: matchingChecks.filter((check) => check.status === 'accepted').length,
      rejectedCount: matchingChecks.filter((check) => check.status === 'rejected').length,
      needsReviewCount: matchingChecks.filter((check) => check.status === 'needs_review').length
    };
  });
}

async function getLotDetailViewData(lotId) {
  const lot = await lotModel.getLotById(lotId);

  if (!lot) {
    return null;
  }

  const lots = await lotModel.listLots({ includeHidden: true });
  const requirements = await lotModel.listLotRequirements(lotId);
  const validationReport = await lotValidationModel.buildLotValidationReport(lotId);
  const enforcementSummary = lotEnforcementModel.buildLotEnforcementSummary(validationReport);
  const requirementValueOptionsByKey = await getRequirementValueOptionsByKey();
  const lotRelationships = buildLotRelationshipData(lot, lots);
  const requirementValidationSummary = buildRequirementValidationSummary(requirements, validationReport);

  return {
    lot,
    requirements,
    validationReport,
    enforcementSummary,
    requirementValueOptionsByKey,
    lotRelationships,
    requirementValidationSummary
  };
}

function getLotSuccessMessage(query) {
  if (query.created === '1') {
    return 'Lot created successfully.';
  }

  if (query.updated === '1') {
    return 'Lot updated successfully.';
  }

  if (query.deleted === '1') {
    return 'Lot deleted successfully.';
  }

  if (query.hidden === '1') {
    return 'Lot hidden successfully.';
  }

  if (query.unhidden === '1') {
    return 'Lot unhidden successfully.';
  }

  return null;
}

function shouldShowHiddenLots(req) {
  return req.query.showHidden === '1' || req.query.showHidden === 'true';
}

async function renderLotsPage(req, res, next) {
  try {
    const showHidden = shouldShowHiddenLots(req);
    const lots = await lotModel.listLots({ includeHidden: showHidden });
    const summary = await lotModel.getLotSummary();

    setNoStoreHeaders(res);

    res.render('pages/management-lots', {
      pageTitle: 'Lots',
      currentNav: 'management-lots',
      lots,
      summary,
      showHidden,
      successMessage: getLotSuccessMessage(req.query)
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewLotPage(req, res, next) {
  try {
    const formOptions = await lotModel.getLotFormOptions();

    res.render('pages/management-lot-new', {
      pageTitle: 'Create Lot',
      currentNav: 'management-lots',
      formOptions,
      formData: getBlankLotFormData(),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createLot(req, res, next) {
  try {
    const formOptions = await lotModel.getLotFormOptions();
    const formData = getLotFormDataFromRequest(req);
    const errorMessages = validateLotForm(formData, formOptions);

    if (errorMessages.length > 0) {
      if (isHtmxRequest(req)) {
        return res.status(400).render('fragments/lot-form-modal', {
          mode: 'create',
          lot: null,
          formOptions,
          formData,
          errorMessages
        });
      }

      return res.status(400).render('pages/management-lot-new', {
        pageTitle: 'Create Lot',
        currentNav: 'management-lots',
        formOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.createLot(formData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, addCacheBuster('/management/lots?created=1'));
  } catch (error) {
    next(error);
  }
}

async function renderLotDetailPage(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/management-lot-detail', {
      pageTitle: lotDetailViewData.lot.lot_name,
      currentNav: 'management-lots',
      ...lotDetailViewData,
      requirementFieldOptions,
      operatorOptions,
      requirementFormData: getBlankRequirementFormData(),
      errorMessages: [],
      successMessage: req.query.requirementCreated === '1'
        ? 'Requirement added successfully.'
        : (req.query.updated === '1'
          ? 'Lot updated successfully.'
          : (req.query.requirementUpdated === '1' ? 'Requirement updated successfully.' : null))
    });
  } catch (error) {
    next(error);
  }
}

async function createLotRequirement(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const requirementFormData = getRequirementFormDataFromRequest(req);
    const errorMessages = validateRequirementForm(requirementFormData);

    if (errorMessages.length > 0) {
      if (isHtmxRequest(req)) {
        return res.status(400).render('fragments/lot-requirement-form-modal', {
          mode: 'create',
          lot: lotDetailViewData.lot,
          requirement: null,
          requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
          requirementFieldOptions,
          operatorOptions,
          formData: requirementFormData,
          errorMessages
        });
      }

      return res.status(400).render('pages/management-lot-detail', {
        pageTitle: lotDetailViewData.lot.lot_name,
        currentNav: 'management-lots',
        ...lotDetailViewData,
        requirementFieldOptions,
        operatorOptions,
        requirementFormData,
        errorMessages,
        successMessage: null
      });
    }

    await lotModel.createLotRequirement(lotId, requirementFormData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, `/management/lots/${lotId}?requirementCreated=1`);
  } catch (error) {
    next(error);
  }
}


async function renderNewLotModal(req, res, next) {
  try {
    const formOptions = await lotModel.getLotFormOptions();

    return renderLotModal(res, {
      mode: 'create',
      formOptions,
      formData: getBlankLotFormData(),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions: await lotModel.getLotFormOptions(),
        formData: getBlankLotFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const lot = await lotModel.getLotById(lotId);
    const formOptions = await lotModel.getLotFormOptions({
      includeParentLotIds: lot?.parent_lot_id ? [lot.parent_lot_id] : []
    });

    if (!lot) {
      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions,
        formData: getBlankLotFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return renderLotModal(res, {
      mode: 'edit',
      lot,
      formOptions,
      formData: getLotFormDataFromLot(lot),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const lot = await lotModel.getLotById(lotId);
    const formOptions = await lotModel.getLotFormOptions({
      includeParentLotIds: lot?.parent_lot_id ? [lot.parent_lot_id] : []
    });

    if (!Number.isInteger(lotId) || lotId <= 0 || !lot) {
      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions,
        formData: getLotFormDataFromRequest(req),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const formData = getLotFormDataFromRequest(req);
    const errorMessages = validateLotForm(formData, formOptions, lotId);

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot,
        formOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.updateLot(lotId, formData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, addCacheBuster('/management/lots?updated=1'));
  } catch (error) {
    next(error);
  }
}

async function renderLotVisibilityModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const mode = req.path.includes('/unhide') ? 'unhide' : 'hide';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const visibilitySummary = await lotModel.getLotVisibilitySummary(lotId);

    if (!visibilitySummary) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return res.render('fragments/lot-visibility-modal', {
      mode,
      visibilitySummary,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotVisibility(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const shouldUnhide = req.path.includes('/unhide');
    const mode = shouldUnhide ? 'unhide' : 'hide';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const visibilitySummary = await lotModel.getLotVisibilitySummary(lotId);

    if (!visibilitySummary) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!visibilitySummary.canChangeVisibility) {
      return res.status(400).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary,
        errorMessages: ['Lot visibility cannot be changed because the lots table does not support hidden lots yet.']
      });
    }

    await lotModel.setLotVisibility(lotId, shouldUnhide, req.currentUser.user_id);

    const redirectUrl = shouldUnhide
      ? '/management/lots?showHidden=1&unhidden=1'
      : '/management/lots?hidden=1';

    return sendHtmxRedirect(req, res, addCacheBuster(redirectUrl));
  } catch (error) {
    next(error);
  }
}

async function renderDeleteLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const deleteSummary = await lotModel.getLotDeleteSummary(lotId);

    if (!deleteSummary) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return res.render('fragments/lot-delete-modal', {
      lot: deleteSummary.lot,
      deleteSummary,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deleteLot(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const deleteSummary = await lotModel.getLotDeleteSummary(lotId);

    if (!deleteSummary) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!deleteSummary.canDelete) {
      return res.status(400).render('fragments/lot-delete-modal', {
        lot: deleteSummary.lot,
        deleteSummary,
        errorMessages: ['This lot cannot be deleted until all attached units and child lots are removed.']
      });
    }

    await lotModel.deleteLotIfEmpty(lotId);

    return sendHtmxRedirect(req, res, addCacheBuster('/management/lots?deleted=1'));
  } catch (error) {
    next(error);
  }
}

async function renderNewLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'create',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return renderRequirementModal(res, {
      mode: 'create',
      lot: lotDetailViewData.lot,
      requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
      formData: getBlankRequirementFormData(),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const requirement = await lotModel.getLotRequirementById(lotId, requirementId);

    if (!requirement) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: lotDetailViewData.lot,
        requirement: null,
        requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    return renderRequirementModal(res, {
      mode: 'edit',
      lot: lotDetailViewData.lot,
      requirement,
      requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
      formData: getRequirementFormDataFromRequirement(requirement),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getRequirementFormDataFromRequest(req),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const requirement = await lotModel.getLotRequirementById(lotId, requirementId);
    const formData = getRequirementFormDataFromRequest(req);
    const errorMessages = validateRequirementForm(formData);

    if (!requirement) {
      errorMessages.push('The selected requirement could not be found.');
    }

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: lotDetailViewData.lot,
        requirement,
        requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
        requirementFieldOptions,
        operatorOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.updateLotRequirement(lotId, requirementId, formData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, `/management/lots/${lotId}?requirementUpdated=1`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLotsPage,
  renderNewLotPage,
  renderNewLotModal,
  createLot,
  renderEditLotModal,
  updateLotModal,
  renderLotVisibilityModal,
  updateLotVisibility,
  renderDeleteLotModal,
  deleteLot,
  renderLotDetailPage,
  renderNewLotRequirementModal,
  createLotRequirement,
  renderEditLotRequirementModal,
  updateLotRequirementModal
};