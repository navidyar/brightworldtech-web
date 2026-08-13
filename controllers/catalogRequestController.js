const unitRequestModel = require('../models/unitRequestModel');
const unitModelCatalogModel = require('../models/unitModelCatalogModel');
const processorCatalogModel = require('../models/processorCatalogModel');
const catalogRequestAccessPolicy = require('../services/catalogRequestAccessPolicy');

function normalizeId(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = 1000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeProcessorSpeed(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0.01 && parsed <= 99.99
    ? parsed.toFixed(2)
    : '';
}

function isHtmxRequest(req) {
  return req.get('HX-Request') === 'true';
}

function buildCatalogModalView({
  requestKind,
  context = {},
  errorMessages = [],
  successRequestId = null,
  requesterNote = '',
  requestedProcessorType = '',
  requestedProcessorName = '',
  requestedProcessorSpeedGhz = ''
} = {}) {
  return {
    requestKind,
    context,
    errorMessages: Array.isArray(errorMessages) ? errorMessages : [],
    successRequestId,
    requesterNote,
    requestedProcessorType,
    requestedProcessorName,
    requestedProcessorSpeedGhz
  };
}

async function getModelRequestContext(source = {}) {
  const manufacturerId = normalizeId(source.manufacturerId);
  const unitCategoryConfigValueId = normalizeId(source.unitCategoryConfigValueId);
  const requestedModelName = normalizeText(source.requestedModelName, 150);
  const [manufacturers, unitCategories] = await Promise.all([
    unitModelCatalogModel.listManufacturers(),
    unitModelCatalogModel.listUnitCategories()
  ]);

  const manufacturer = manufacturers.find((item) => item.id === manufacturerId) || null;
  const unitCategory = unitCategories.find((item) => item.id === unitCategoryConfigValueId) || null;
  const errors = [];

  if (!manufacturer) errors.push('Select a valid Manufacturer before requesting a missing Unit Model.');
  if (!unitCategory) errors.push('Select a valid Unit Category before requesting a missing Unit Model.');
  if (requestedModelName.length < 2) errors.push('Enter the exact observed Unit Model name in the Unit Model field before submitting this request.');

  let inactiveMatch = null;
  let activeMatch = null;

  if (manufacturer && unitCategory && requestedModelName.length >= 2) {
    const models = await unitModelCatalogModel.listUnitModels({
      manufacturerId,
      unitCategoryConfigValueId,
      includeInactive: true,
      search: requestedModelName
    });
    const exactMatch = models.find((model) => String(model.modelName || '').trim().toLowerCase() === requestedModelName.toLowerCase()) || null;

    if (exactMatch && exactMatch.isActive) {
      activeMatch = exactMatch;
      errors.push('That Unit Model already exists in the active catalog. Select it instead of submitting a request.');
    } else if (exactMatch) {
      inactiveMatch = exactMatch;
    }
  }

  return {
    manufacturerId,
    manufacturerName: manufacturer ? manufacturer.label : '',
    unitCategoryConfigValueId,
    unitCategoryLabel: unitCategory ? unitCategory.label : '',
    requestedModelName,
    inactiveMatch,
    activeMatch,
    errors
  };
}

async function getProcessorRequestContext(source = {}) {
  const unitModelId = normalizeId(source.unitModelId);
  const requestedProcessorType = normalizeText(source.requestedProcessorType, 100);
  const requestedProcessorName = normalizeText(source.requestedProcessorName, 150);
  const requestedProcessorSpeedGhz = normalizeProcessorSpeed(source.requestedProcessorSpeedGhz);
  const unitModel = unitModelId ? await unitModelCatalogModel.getUnitModelById(unitModelId) : null;
  const errors = [];
  let globalProcessorMatches = [];

  if (!unitModel || !unitModel.isActive) {
    errors.push('Select an active managed Unit Model before requesting processor compatibility.');
  }

  if (requestedProcessorType.length >= 2 && requestedProcessorName.length >= 2) {
    globalProcessorMatches = await processorCatalogModel.findLikelyProcessorMatches({
      brandName: requestedProcessorType,
      modelCode: requestedProcessorName,
      includeInactive: true,
      limit: 5
    });
    const alreadyMapped = globalProcessorMatches.find((processor) => processor.identityMatch && processor.isActive && processor.unitModelIds.includes(unitModelId)) || null;
    if (alreadyMapped) {
      errors.push(`${alreadyMapped.displayLabel} is already associated with this Unit Model. Close this request and select the existing processor.`);
    }

  }

  const alreadyMappedProcessor = globalProcessorMatches.find((processor) => processor.identityMatch && processor.isActive && processor.unitModelIds.includes(unitModelId)) || null;
  const existingGlobalMatch = alreadyMappedProcessor
    ? null
    : (globalProcessorMatches.find((processor) => processor.identityMatch) || null);

  return {
    unitModelId,
    unitModelName: unitModel ? unitModel.modelName : '',
    manufacturerName: unitModel ? unitModel.manufacturerName : '',
    unitCategoryLabel: unitModel ? unitModel.unitCategoryLabel : '',
    requestedProcessorType,
    requestedProcessorName,
    requestedProcessorSpeedGhz,
    globalProcessorMatches,
    existingGlobalMatch,
    alreadyMappedProcessor,
    errors
  };
}

function renderErrorModal(res, view) {
  return res.status(400).render('fragments/tech-unit-catalog-request-modal', view);
}

async function renderModelCatalogRequestModal(req, res, next) {
  try {
    if (!catalogRequestAccessPolicy.canSubmitCatalogRequestFromRequest(req)) {
      return res.status(403).render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'model',
        errorMessages: ['Your role cannot submit Catalog Exception requests from Add/Edit Unit.']
      }));
    }

    const context = await getModelRequestContext(req.query);
    return res.render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
      requestKind: 'model',
      context,
      errorMessages: context.errors
    }));
  } catch (error) {
    next(error);
  }
}

async function renderProcessorCatalogRequestModal(req, res, next) {
  try {
    if (!catalogRequestAccessPolicy.canSubmitCatalogRequestFromRequest(req)) {
      return res.status(403).render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'processor',
        errorMessages: ['Your role cannot submit Catalog Exception requests from Add/Edit Unit.']
      }));
    }

    const context = await getProcessorRequestContext(req.query);
    return res.render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
      requestKind: 'processor',
      context,
      errorMessages: context.errors,
      requestedProcessorType: context.requestedProcessorType,
      requestedProcessorName: context.requestedProcessorName,
      requestedProcessorSpeedGhz: context.requestedProcessorSpeedGhz
    }));
  } catch (error) {
    next(error);
  }
}

async function createModelCatalogRequest(req, res, next) {
  try {
    if (!catalogRequestAccessPolicy.canSubmitCatalogRequestFromRequest(req)) {
      return res.status(403).render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'model',
        errorMessages: ['Your role cannot submit Catalog Exception requests from Add/Edit Unit.']
      }));
    }

    const context = await getModelRequestContext(req.body || {});
    const requesterNote = normalizeText(req.body?.requesterNote, 1000);

    if (context.errors.length > 0) {
      return renderErrorModal(res, buildCatalogModalView({
        requestKind: 'model',
        context,
        errorMessages: context.errors,
        requesterNote
      }));
    }

    const result = await unitRequestModel.createModelCatalogRequest({
      requestedByUserId: req.currentUser.user_id,
      manufacturerId: context.manufacturerId,
      unitCategoryConfigValueId: context.unitCategoryConfigValueId,
      requestedModelName: context.requestedModelName,
      requesterNote
    });

    if (isHtmxRequest(req)) {
      return res.render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'model',
        context,
        successRequestId: result.unitRequestId
      }));
    }

    return res.redirect(`/unit-requests/${encodeURIComponent(result.unitRequestId)}`);
  } catch (error) {
    try {
      const context = await getModelRequestContext(req.body || {});
      return renderErrorModal(res, buildCatalogModalView({
        requestKind: 'model',
        context,
        requesterNote: normalizeText(req.body?.requesterNote, 1000),
        errorMessages: [error.message || 'The Model Catalog request could not be submitted.']
      }));
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function createProcessorCatalogRequest(req, res, next) {
  try {
    if (!catalogRequestAccessPolicy.canSubmitCatalogRequestFromRequest(req)) {
      return res.status(403).render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'processor',
        errorMessages: ['Your role cannot submit Catalog Exception requests from Add/Edit Unit.']
      }));
    }

    const context = await getProcessorRequestContext(req.body || {});
    const requesterNote = normalizeText(req.body?.requesterNote, 1000);
    const requestedProcessorType = normalizeText(req.body?.requestedProcessorType, 100);
    const requestedProcessorName = normalizeText(req.body?.requestedProcessorName, 150);
    const requestedProcessorSpeedGhz = normalizeProcessorSpeed(req.body?.requestedProcessorSpeedGhz);
    const errors = [...context.errors];

    if (requestedProcessorType.length < 2) errors.push('Enter the observed Processor Type.');
    if (requestedProcessorName.length < 2) errors.push('Enter the exact Processor value observed in BIOS, ScanTools, or TechTools.');
    if (!requestedProcessorSpeedGhz) errors.push('Enter an observed Processor Speed from 0.01 through 99.99 GHz.');

    if (errors.length > 0) {
      return renderErrorModal(res, buildCatalogModalView({
        requestKind: 'processor',
        context,
        errorMessages: errors,
        requesterNote,
        requestedProcessorType,
        requestedProcessorName,
        requestedProcessorSpeedGhz
      }));
    }

    const result = await unitRequestModel.createProcessorCatalogRequest({
      requestedByUserId: req.currentUser.user_id,
      unitModelId: context.unitModelId,
      requestedProcessorType,
      requestedProcessorName,
      requestedProcessorSpeedGhz,
      requesterNote
    });

    if (isHtmxRequest(req)) {
      return res.render('fragments/tech-unit-catalog-request-modal', buildCatalogModalView({
        requestKind: 'processor',
        context,
        successRequestId: result.unitRequestId
      }));
    }

    return res.redirect(`/unit-requests/${encodeURIComponent(result.unitRequestId)}`);
  } catch (error) {
    try {
      const context = await getProcessorRequestContext(req.body || {});
      return renderErrorModal(res, buildCatalogModalView({
        requestKind: 'processor',
        context,
        requesterNote: normalizeText(req.body?.requesterNote, 1000),
        requestedProcessorType: normalizeText(req.body?.requestedProcessorType, 100),
        requestedProcessorName: normalizeText(req.body?.requestedProcessorName, 150),
        requestedProcessorSpeedGhz: normalizeProcessorSpeed(req.body?.requestedProcessorSpeedGhz),
        errorMessages: [error.message || 'The Processor Catalog request could not be submitted.']
      }));
    } catch (renderError) {
      return next(renderError);
    }
  }
}

module.exports = {
  renderModelCatalogRequestModal,
  renderProcessorCatalogRequestModal,
  createModelCatalogRequest,
  createProcessorCatalogRequest
};
