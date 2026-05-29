const techUnitModel = require('../models/techUnitModel');

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

function getUnitFormDataFromRequest(req) {
  return {
    assetTag: String(req.body.assetTag || '').trim(),
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
  if (error && error.code === 'ER_DUP_ENTRY') {
    return `That asset tag already exists. Enter a different ${formOptions.assetTagPrefix} asset tag or leave the field blank to auto-generate the next available number.`;
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return 'One of the selected dropdown values no longer exists. Refresh the page and try again.';
  }

  return null;
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
    const result = await techUnitModel.listTechUnits(filters);

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
    const result = await techUnitModel.listTechUnits(filters);

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

    await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);

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

    await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);

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
  renderEditTechUnitPage,
  renderEditTechUnitModal,
  updateTechUnit,
  updateTechUnitModal
};