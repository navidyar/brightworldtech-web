const techUnitModel = require('../models/techUnitModel');

function getUnitFormDataFromRequest(req) {
  return {
    lotId: String(req.body.lotId || '').trim(),
    assetTag: String(req.body.assetTag || '').trim(),
    serialNumber: String(req.body.serialNumber || '').trim(),
    biosSerialNumber: String(req.body.biosSerialNumber || '').trim(),
    unitType: String(req.body.unitType || '').trim(),
    manufacturer: String(req.body.manufacturer || '').trim(),
    model: String(req.body.model || '').trim(),
    ramSize: String(req.body.ramSize || '').trim(),
    ramType: String(req.body.ramType || '').trim(),
    storageSize: String(req.body.storageSize || '').trim(),
    storageType: String(req.body.storageType || '').trim(),
    processorBrand: String(req.body.processorBrand || '').trim(),
    processorModel: String(req.body.processorModel || '').trim(),
    touchscreen: String(req.body.touchscreen || '').trim(),
    notes: String(req.body.notes || '').trim()
  };
}

function validateUnitForm(formData, formOptions) {
  const errors = [];

  if (!formOptions.supported) {
    errors.push(formOptions.message || 'The units table is not ready yet.');
    return errors;
  }

  if (formOptions.hasLotId && !formData.lotId) {
    errors.push('A lot is required.');
  }

  if (formData.lotId && (!Number.isInteger(Number(formData.lotId)) || Number(formData.lotId) <= 0)) {
    errors.push('Selected lot is invalid.');
  }

  const hasIdentifier =
    formData.assetTag ||
    formData.serialNumber ||
    formData.biosSerialNumber ||
    formData.model;

  if (!hasIdentifier) {
    errors.push('Enter at least one identifier or model value.');
  }

  const maxLengthFields = [
    ['Asset Tag', formData.assetTag, 120],
    ['Unit Serial Number', formData.serialNumber, 120],
    ['BIOS Serial Number', formData.biosSerialNumber, 120],
    ['Model', formData.model, 160],
    ['Notes', formData.notes, 1000]
  ];

  maxLengthFields.forEach(([label, value, maxLength]) => {
    if (value && value.length > maxLength) {
      errors.push(`${label} must be ${maxLength} characters or fewer.`);
    }
  });

  return errors;
}

async function renderTechUnitsPage(req, res, next) {
  try {
    const filters = {
      search: String(req.query.search || '').trim(),
      lotId: String(req.query.lotId || '').trim()
    };

    const result = await techUnitModel.listTechUnits(filters);

    return res.render('pages/tech-units', {
      pageTitle: 'Tech Units',
      currentNav: 'tech-units',
      result,
      filters,
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

async function renderNewTechUnitPage(req, res, next) {
  try {
    const formOptions = await techUnitModel.getTechUnitFormOptions();

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Create Unit',
      currentNav: 'tech-units',
      mode: 'create',
      formAction: '/tech/units',
      formOptions,
      formData: techUnitModel.getBlankUnitFormData(),
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
    const errorMessages = validateUnitForm(formData, formOptions);

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

    await techUnitModel.createTechUnit(formData, req.currentUser.user_id);

    return res.redirect('/tech/units?created=1');
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
    const formData = await techUnitModel.getUnitFormDataById(unitId);

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
    const errorMessages = validateUnitForm(formData, formOptions);

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

module.exports = {
  renderTechUnitsPage,
  renderNewTechUnitPage,
  createTechUnit,
  renderEditTechUnitPage,
  updateTechUnit
};