const unitModelCatalogModel = require('../models/unitModelCatalogModel');

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function parsePositiveInteger(value) {
  return unitModelCatalogModel.normalizePositiveInteger(value);
}

function parseSortOrder(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

function getFilters(req) {
  return unitModelCatalogModel.getCatalogFilters({
    manufacturerId: req.query.manufacturerId,
    unitCategoryConfigValueId: req.query.unitCategoryConfigValueId,
    includeInactive: req.query.includeInactive,
    search: req.query.search
  });
}

function buildReturnUrl(filters = {}, notice = '') {
  const params = new URLSearchParams();
  if (filters.manufacturerId) params.set('manufacturerId', String(filters.manufacturerId));
  if (filters.unitCategoryConfigValueId) params.set('unitCategoryConfigValueId', String(filters.unitCategoryConfigValueId));
  if (filters.includeInactive) params.set('includeInactive', '1');
  if (filters.search) params.set('search', filters.search);
  if (notice) params.set('notice', notice);
  const query = params.toString();
  return `/management/config/models${query ? `?${query}` : ''}`;
}

function sendRedirect(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.status(204).send('');
  }
  return res.redirect(url);
}

function getFormData(req = null, unitModel = null) {
  const source = req && req.body ? req.body : {};
  if (unitModel && !req) {
    return {
      manufacturerId: String(unitModel.manufacturerId || ''),
      unitCategoryConfigValueId: String(unitModel.unitCategoryConfigValueId || ''),
      modelName: unitModel.modelName || '',
      sortOrder: String(unitModel.sortOrder || 0),
      isActive: unitModel.isActive ? '1' : '0'
    };
  }

  return {
    manufacturerId: String(source.manufacturerId || '').trim(),
    unitCategoryConfigValueId: String(source.unitCategoryConfigValueId || '').trim(),
    modelName: unitModelCatalogModel.normalizeModelName(source.modelName),
    sortOrder: String(source.sortOrder || '').trim(),
    isActive: source.isActive === '1' ? '1' : '0'
  };
}

async function getFormOptions() {
  const [manufacturers, unitCategories] = await Promise.all([
    unitModelCatalogModel.listManufacturers(),
    unitModelCatalogModel.listUnitCategories()
  ]);
  return { manufacturers, unitCategories };
}

async function validateForm(formData, options = {}) {
  const errors = [];
  const manufacturerId = parsePositiveInteger(formData.manufacturerId);
  const unitCategoryConfigValueId = parsePositiveInteger(formData.unitCategoryConfigValueId);
  const unitModelId = parsePositiveInteger(options.unitModelId);

  if (!manufacturerId) errors.push('Choose a manufacturer.');
  if (!unitCategoryConfigValueId) errors.push('Choose a unit category.');
  if (!formData.modelName) errors.push('Enter a model name.');
  if (formData.modelName.length > unitModelCatalogModel.MAX_MODEL_NAME_LENGTH) {
    errors.push(`Model name must be ${unitModelCatalogModel.MAX_MODEL_NAME_LENGTH} characters or less.`);
  }

  if (manufacturerId && unitCategoryConfigValueId && formData.modelName) {
    const duplicate = await unitModelCatalogModel.modelExists({
      manufacturerId,
      unitCategoryConfigValueId,
      modelName: formData.modelName,
      excludeUnitModelId: unitModelId
    });
    if (duplicate) errors.push('That manufacturer/category/model entry already exists.');
  }

  return errors;
}

async function renderUnitModelCatalogPage(req, res, next) {
  try {
    const filters = getFilters(req);
    const [models, formOptions] = await Promise.all([
      unitModelCatalogModel.listUnitModels(filters),
      getFormOptions()
    ]);

    return res.render('pages/management-unit-models', {
      pageTitle: 'Unit Model Catalog',
      currentNav: 'management-unit-models',
      filters,
      models,
      manufacturers: formOptions.manufacturers,
      unitCategories: formOptions.unitCategories,
      notice: String(req.query.notice || '')
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewUnitModelModal(req, res, next) {
  try {
    const filters = getFilters(req);
    const formOptions = await getFormOptions();
    return res.render('fragments/unit-model-form-modal', {
      mode: 'create',
      unitModel: null,
      formOptions,
      formData: {
        manufacturerId: filters.manufacturerId ? String(filters.manufacturerId) : '',
        unitCategoryConfigValueId: filters.unitCategoryConfigValueId ? String(filters.unitCategoryConfigValueId) : '',
        modelName: '',
        sortOrder: '0',
        isActive: '1'
      },
      filters,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createUnitModel(req, res, next) {
  try {
    const filters = getFilters(req);
    const formData = getFormData(req);
    const formOptions = await getFormOptions();
    const errorMessages = await validateForm(formData);

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/unit-model-form-modal', {
        mode: 'create', unitModel: null, formOptions, formData, filters, errorMessages
      });
    }

    await unitModelCatalogModel.createUnitModel({
      manufacturerId: formData.manufacturerId,
      unitCategoryConfigValueId: formData.unitCategoryConfigValueId,
      modelName: formData.modelName,
      sortOrder: parseSortOrder(formData.sortOrder),
      isActive: formData.isActive === '1'
    });
    return sendRedirect(req, res, buildReturnUrl(filters, 'created'));
  } catch (error) {
    next(error);
  }
}

async function renderEditUnitModelModal(req, res, next) {
  try {
    const unitModelId = parsePositiveInteger(req.params.unitModelId);
    const filters = getFilters(req);
    const [unitModel, formOptions] = await Promise.all([
      unitModelCatalogModel.getUnitModelById(unitModelId),
      getFormOptions()
    ]);

    if (!unitModel) {
      return res.status(404).render('fragments/unit-model-status-modal', {
        actionType: 'error', unitModel: null, filters, errorMessages: ['The selected model could not be found.']
      });
    }

    return res.render('fragments/unit-model-form-modal', {
      mode: 'edit', unitModel, formOptions, formData: getFormData(null, unitModel), filters, errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateUnitModel(req, res, next) {
  try {
    const unitModelId = parsePositiveInteger(req.params.unitModelId);
    const filters = getFilters(req);
    const [unitModel, formOptions] = await Promise.all([
      unitModelCatalogModel.getUnitModelById(unitModelId),
      getFormOptions()
    ]);
    if (!unitModel) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found'));

    const formData = getFormData(req);
    const errorMessages = await validateForm(formData, { unitModelId });
    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/unit-model-form-modal', {
        mode: 'edit', unitModel, formOptions, formData, filters, errorMessages
      });
    }

    await unitModelCatalogModel.updateUnitModel(unitModelId, {
      manufacturerId: formData.manufacturerId,
      unitCategoryConfigValueId: formData.unitCategoryConfigValueId,
      modelName: formData.modelName,
      sortOrder: parseSortOrder(formData.sortOrder),
      isActive: formData.isActive === '1'
    });
    return sendRedirect(req, res, buildReturnUrl(filters, 'updated'));
  } catch (error) {
    next(error);
  }
}

async function renderUnitModelStatusModal(req, res, next) {
  try {
    const unitModelId = parsePositiveInteger(req.params.unitModelId);
    const filters = getFilters(req);
    const unitModel = await unitModelCatalogModel.getUnitModelById(unitModelId);
    const actionType = req.params.actionType === 'activate' ? 'activate' : 'deactivate';

    if (!unitModel) {
      return res.status(404).render('fragments/unit-model-status-modal', {
        actionType: 'error', unitModel: null, filters, errorMessages: ['The selected model could not be found.']
      });
    }

    return res.render('fragments/unit-model-status-modal', { actionType, unitModel, filters, errorMessages: [] });
  } catch (error) {
    next(error);
  }
}

async function updateUnitModelStatus(req, res, next) {
  try {
    const unitModelId = parsePositiveInteger(req.params.unitModelId);
    const filters = getFilters(req);
    const unitModel = await unitModelCatalogModel.getUnitModelById(unitModelId);
    const actionType = req.params.actionType === 'activate' ? 'activate' : 'deactivate';

    if (!unitModel) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found'));
    await unitModelCatalogModel.setUnitModelActive(unitModelId, actionType === 'activate');
    return sendRedirect(req, res, buildReturnUrl(filters, actionType === 'activate' ? 'activated' : 'deactivated'));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderUnitModelCatalogPage,
  renderNewUnitModelModal,
  createUnitModel,
  renderEditUnitModelModal,
  updateUnitModel,
  renderUnitModelStatusModal,
  updateUnitModelStatus
};
