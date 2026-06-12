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

function validateLotForm(formData, formOptions) {
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

  if (formData.lotTypeConfigValueId && !Number.isInteger(Number(formData.lotTypeConfigValueId))) {
    errors.push('Lot type must be valid.');
  }

  if (formData.defaultGradeConfigValueId && !Number.isInteger(Number(formData.defaultGradeConfigValueId))) {
    errors.push('Default grade must be valid.');
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

  const lots = await lotModel.listLots();
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

async function renderLotsPage(req, res, next) {
  try {
    const lots = await lotModel.listLots();
    const summary = await lotModel.getLotSummary();

    res.render('pages/management-lots', {
      pageTitle: 'Lots',
      currentNav: 'management-lots',
      lots,
      summary,
      successMessage: req.query.created === '1' ? 'Lot created successfully.' : null
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
      return res.status(400).render('pages/management-lot-new', {
        pageTitle: 'Create Lot',
        currentNav: 'management-lots',
        formOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.createLot(formData, req.currentUser.user_id);

    return res.redirect('/management/lots?created=1');
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
        : null
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

    return res.redirect(`/management/lots/${lotId}?requirementCreated=1`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLotsPage,
  renderNewLotPage,
  createLot,
  renderLotDetailPage,
  createLotRequirement
};