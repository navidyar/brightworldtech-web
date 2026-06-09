const techUnitModel = require('../models/techUnitModel');
const overrideRequestModel = require('../models/overrideRequestModel');
const unitExpandedDetailModel = require('../models/unitExpandedDetailModel');

function buildTechUnitsTableUrl(filters) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.lotId) {
    params.set('lotId', filters.lotId);
  }

  const queryString = params.toString();

  return queryString ? `/tech/units/table?${queryString}` : '/tech/units/table';
}

function getFiltersFromRequest(req) {
  return {
    search: String(req.query.search || '').trim(),
    lotId: String(req.query.lotId || '').trim()
  };
}

async function attachLatestOverrideHistory(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const latestOverrideMap = await overrideRequestModel.getLatestOverrideRequestMapForUnits(unitIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      latestOverride: latestOverrideMap.get(Number(unit.unitId)) || null
    }))
  };
}


async function attachExpandedUnitDetails(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const expandedDetailMap = await unitExpandedDetailModel.listExpandedDetailsForUnits(unitIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      expandedDetails: expandedDetailMap.get(Number(unit.unitId)) || null
    }))
  };
}

async function buildTechUnitsResult(filters) {
  const rawResult = await techUnitModel.listTechUnits(filters);
  const resultWithOverrides = await attachLatestOverrideHistory(rawResult);

  return attachExpandedUnitDetails(resultWithOverrides);
}

function getUnitFormDataFromRequest(req) {
  return {
    assetTag: String(req.body.assetTag || '').trim(),
    unitSerialNumber: String(req.body.unitSerialNumber || '').trim(),
    biosSerialNumber: String(req.body.biosSerialNumber || '').trim(),
    lotId: String(req.body.lotId || '').trim(),
    unitCategoryConfigValueId: String(req.body.unitCategoryConfigValueId || '').trim(),
    currentUnitStatusConfigValueId: String(req.body.currentUnitStatusConfigValueId || '').trim(),
    manufacturerId: String(req.body.manufacturerId || '').trim(),
    unitModelId: String(req.body.unitModelId || '').trim(),
    processorModelId: String(req.body.processorModelId || '').trim(),
    processorSpeedGhz: String(req.body.processorSpeedGhz || '').trim(),
    ramGb: String(req.body.ramGb || '').trim(),
    ramTypeConfigValueId: String(req.body.ramTypeConfigValueId || '').trim(),
    storageGb: String(req.body.storageGb || '').trim(),
    storageTypeConfigValueId: String(req.body.storageTypeConfigValueId || '').trim(),
    operatingSystemConfigValueId: String(req.body.operatingSystemConfigValueId || '').trim(),
    hardwareNotes: String(req.body.hardwareNotes || '').trim(),
    cosmeticNotes: String(req.body.cosmeticNotes || '').trim()
  };
}

function isPositiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0;
}

function isPositiveOrZeroNumber(value) {
  if (!value) {
    return true;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0;
}

function isAssignableLotId(lotId, formOptions) {
  return formOptions.lots.some((lot) => String(lot.lot_id) === String(lotId));
}

function validateUnitForm(formData, formOptions, mode) {
  const errors = [];

  if (!formOptions.supported) {
    errors.push(formOptions.message || 'The units table is not ready yet.');
    return errors;
  }

  if (!formData.lotId || !isPositiveInteger(formData.lotId)) {
    errors.push('A valid assignable lot is required.');
  } else if (!isAssignableLotId(formData.lotId, formOptions)) {
    errors.push('Units can only be assigned to lots that do not have child lots. Choose a more specific child lot, or choose a standalone lot with no children.');
  }

  if (!formData.unitCategoryConfigValueId || !isPositiveInteger(formData.unitCategoryConfigValueId)) {
    errors.push('Unit category is required.');
  }

  if (!formData.currentUnitStatusConfigValueId || !isPositiveInteger(formData.currentUnitStatusConfigValueId)) {
    errors.push('Unit status is required.');
  }

  if (mode === 'create' && formData.assetTag && !techUnitModel.normalizeAssetTagInput(formData.assetTag)) {
    errors.push(`Asset tag must be a positive number with or without the ${formOptions.assetTagPrefix} prefix.`);
  }

  if (formData.unitSerialNumber.length > 150) {
    errors.push('Unit serial number must be 150 characters or fewer.');
  }

  if (formData.biosSerialNumber.length > 150) {
    errors.push('BIOS serial number must be 150 characters or fewer.');
  }

  if (formData.ramGb && !isPositiveInteger(formData.ramGb)) {
    errors.push('RAM GB must be a positive whole number.');
  }

  if (formData.storageGb && !isPositiveInteger(formData.storageGb)) {
    errors.push('Storage GB must be a positive whole number.');
  }

  if (!isPositiveOrZeroNumber(formData.processorSpeedGhz)) {
    errors.push('Processor speed must be a valid number.');
  }

  if (formData.hardwareNotes.length > 1000) {
    errors.push('Hardware notes must be 1000 characters or fewer.');
  }

  if (formData.cosmeticNotes.length > 1000) {
    errors.push('Cosmetic notes must be 1000 characters or fewer.');
  }

  return errors;
}

function getFriendlySaveError(error, formOptions) {
  if (error && error.code === 'BWT_DUPLICATE_IDENTIFIER') {
    return techUnitModel.getDuplicateUnitMessage(error.duplicateMatches, formOptions.assetTagPrefix);
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return `That asset tag or identifier already exists. Search for the existing unit before creating a duplicate.`;
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return 'One of the selected dropdown values no longer exists. Refresh the page and try again.';
  }

  return null;
}


function isDuplicateIdentifierError(error) {
  return Boolean(error && error.code === 'BWT_DUPLICATE_IDENTIFIER' && Array.isArray(error.duplicateMatches));
}

function getDuplicateMatches(error) {
  return isDuplicateIdentifierError(error) ? error.duplicateMatches : [];
}

async function renderDuplicateUnitModal(res, { formOptions, formData, duplicateMatches, errorMessages = [] }) {
  return res.render('fragments/tech-unit-duplicate-modal', {
    pageTitle: 'Possible Existing Unit Found',
    formOptions,
    formData,
    duplicateMatches,
    errorMessages
  });
}

async function getBlankFormDataWithDefaults() {
  const formOptions = await techUnitModel.getTechUnitFormOptions();

  return {
    formOptions,
    formData: techUnitModel.getBlankUnitFormData(formOptions)
  };
}

async function renderTechUnitsPage(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('pages/tech-units', {
      pageTitle: 'Tech Units',
      currentNav: 'tech-units',
      result,
      filters,
      tableUrl: buildTechUnitsTableUrl(filters),
      successMessage: req.query.created === '1'
        ? 'Unit created successfully.'
        : req.query.updated === '1'
          ? 'Unit updated successfully.'
          : null
    });
  } catch (error) {
    next(error);
  }
}

async function renderTechUnitsTable(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('fragments/tech-units-table', {
      result,
      filters
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewTechUnitPage(req, res, next) {
  try {
    const { formOptions, formData } = await getBlankFormDataWithDefaults();

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Create Unit',
      currentNav: 'tech-units',
      mode: 'create',
      formAction: '/tech/units',
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewTechUnitModal(req, res, next) {
  try {
    const { formOptions, formData } = await getBlankFormDataWithDefaults();

    return res.render('fragments/tech-unit-modal', {
      pageTitle: 'Create Unit',
      mode: 'create',
      formAction: '/tech/units/modal',
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createTechUnit(req, res, next) {
  try {
    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = getUnitFormDataFromRequest(req);
    const errorMessages = validateUnitForm(formData, formOptions, 'create');

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Create Unit',
        currentNav: 'tech-units',
        mode: 'create',
        formAction: '/tech/units',
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.createTechUnit(formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.status(400).render('pages/tech-unit-form', {
          pageTitle: 'Create Unit',
          currentNav: 'tech-units',
          mode: 'create',
          formAction: '/tech/units',
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    return res.redirect('/tech/units?created=1');
  } catch (error) {
    next(error);
  }
}

async function createTechUnitModal(req, res, next) {
  try {
    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = getUnitFormDataFromRequest(req);
    const errorMessages = validateUnitForm(formData, formOptions, 'create');

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Create Unit',
        mode: 'create',
        formAction: '/tech/units/modal',
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.createTechUnit(formData, req.currentUser.user_id);
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: getDuplicateMatches(saveError),
          errorMessages: []
        });
      }

      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Create Unit',
          mode: 'create',
          formAction: '/tech/units/modal',
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

async function useExistingTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'create',
        formAction: '/tech/units/modal',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          operatingSystems: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = getUnitFormDataFromRequest(req);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return renderDuplicateUnitModal(res, {
        formOptions,
        formData,
        duplicateMatches: [],
        errorMessages
      });
    }

    try {
      await techUnitModel.useExistingTechUnit(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: getDuplicateMatches(saveError),
          errorMessages: ['Another matching unit was found while updating the existing unit. Review the matches before continuing.']
        });
      }

      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: [],
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

async function renderEditTechUnitPage(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = await techUnitModel.getUnitFormDataById(unitId, formOptions);

    if (!formData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Edit Unit',
      currentNav: 'tech-units',
      mode: 'edit',
      formAction: `/tech/units/${unitId}`,
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          operatingSystems: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = await techUnitModel.getUnitFormDataById(unitId, formOptions);

    if (!formData) {
      return res.status(404).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions,
        formData: techUnitModel.getBlankUnitFormData(formOptions),
        errorMessages: ['The selected unit could not be found.']
      });
    }

    return res.render('fragments/tech-unit-modal', {
      pageTitle: 'Edit Unit',
      mode: 'edit',
      formAction: `/tech/units/${unitId}/modal`,
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateTechUnit(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = getUnitFormDataFromRequest(req);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Edit Unit',
        currentNav: 'tech-units',
        mode: 'edit',
        formAction: `/tech/units/${unitId}`,
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.status(400).render('pages/tech-unit-form', {
          pageTitle: 'Edit Unit',
          currentNav: 'tech-units',
          mode: 'edit',
          formAction: `/tech/units/${unitId}`,
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    return res.redirect('/tech/units?updated=1');
  } catch (error) {
    next(error);
  }
}

async function updateTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          operatingSystems: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await techUnitModel.getTechUnitFormOptions();
    const formData = getUnitFormDataFromRequest(req);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Edit Unit',
        mode: 'edit',
        formAction: `/tech/units/${unitId}/modal`,
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Edit Unit',
          mode: 'edit',
          formAction: `/tech/units/${unitId}/modal`,
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderTechUnitsPage,
  renderTechUnitsTable,
  renderNewTechUnitPage,
  renderNewTechUnitModal,
  createTechUnit,
  createTechUnitModal,
  useExistingTechUnitModal,
  renderEditTechUnitPage,
  renderEditTechUnitModal,
  updateTechUnit,
  updateTechUnitModal
};
