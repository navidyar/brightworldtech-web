const lotModel = require('../models/lotModel');

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

module.exports = {
  renderLotsPage,
  renderNewLotPage,
  createLot
};