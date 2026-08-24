'use strict';

const processorCatalogModel = require('../models/processorCatalogModel');
const operationalOptionRankingModel = require('../models/operationalOptionRankingModel');

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function isAdmin(req) {
  return Boolean(req?.currentUser && Array.isArray(req.currentUser.roles) && req.currentUser.roles.includes('admin'));
}

function getFilters(req) {
  return processorCatalogModel.getCatalogFilters({
    processorBrandId: req.query.processorBrandId,
    includeInactive: req.query.includeInactive,
    needsReview: req.query.needsReview,
    search: req.query.search
  });
}

function getReturnTo(req = {}) {
  return String(req?.query?.returnTo || req?.body?.returnTo || '').trim() === 'processor-families'
    ? 'processor-families'
    : 'processor-catalog';
}

function buildReturnUrl(filters = {}, notice = '', returnTo = 'processor-catalog') {
  if (returnTo === 'processor-families') {
    const params = new URLSearchParams();
    if (notice) params.set('notice', notice);
    return `/management/config/processor-families${params.toString() ? `?${params.toString()}` : ''}`;
  }

  const params = new URLSearchParams();
  if (filters.processorBrandId) params.set('processorBrandId', String(filters.processorBrandId));
  if (filters.includeInactive) params.set('includeInactive', '1');
  if (filters.needsReview) params.set('needsReview', '1');
  if (filters.search) params.set('search', filters.search);
  if (notice) params.set('notice', notice);
  return `/management/config/processors${params.toString() ? `?${params.toString()}` : ''}`;
}

function sendRedirect(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.status(204).send('');
  }
  return res.redirect(url);
}

function getFormData(req = null, processor = null) {
  if (processor && !req) {
    return {
      processorBrandId: String(processor.processorBrandId || ''),
      modelCode: processor.modelCode || '',
      legacyFamily: processor.legacyFamily || '',
      generation: processor.generation || '',
      baseSpeedGhz: processor.baseSpeedGhz ?? '',
      isActive: processor.isActive ? '1' : '0'
    };
  }
  const source = req?.body || {};
  return {
    processorBrandId: String(source.processorBrandId || '').trim(),
    modelCode: processorCatalogModel.normalizeText(source.modelCode, processorCatalogModel.MAX_PROCESSOR_MODEL_LENGTH),
    legacyFamily: processorCatalogModel.normalizeText(source.legacyFamily, processorCatalogModel.MAX_PROCESSOR_FAMILY_LENGTH),
    generation: processorCatalogModel.normalizeText(source.generation, processorCatalogModel.MAX_PROCESSOR_GENERATION_LENGTH),
    baseSpeedGhz: String(source.baseSpeedGhz || '').trim(),
    isActive: source.isActive === '1' ? '1' : '0'
  };
}

async function validateForm(formData, processorModelId) {
  const errors = [];
  const processorBrandId = processorCatalogModel.normalizePositiveInteger(formData.processorBrandId);
  if (!processorBrandId) errors.push('Choose a Processor Type.');
  if (formData.modelCode.length < 2) errors.push('Processor name must be at least 2 characters.');
  if (formData.modelCode.length > processorCatalogModel.MAX_PROCESSOR_MODEL_LENGTH) errors.push(`Processor name must be ${processorCatalogModel.MAX_PROCESSOR_MODEL_LENGTH} characters or fewer.`);
  const speed = processorCatalogModel.normalizeOptionalDecimal(formData.baseSpeedGhz);
  if (formData.baseSpeedGhz !== '' && (speed === null || speed < 0.01 || speed > 99.99)) errors.push('Base Speed must be blank or between 0.01 and 99.99 GHz.');
  if (processorBrandId && formData.modelCode) {
    const brands = await processorCatalogModel.listProcessorBrands();
    const selectedBrand = brands.find((brand) => brand.id === processorBrandId) || null;
    if (selectedBrand) {
      errors.push(...processorCatalogModel.getCanonicalProcessorNameErrors({
        brandName: selectedBrand.label,
        modelCode: formData.modelCode
      }));
      const likelyMatches = await processorCatalogModel.findLikelyProcessorMatches({
        processorBrandId,
        brandName: selectedBrand.label,
        modelCode: formData.modelCode,
        includeInactive: true,
        limit: 8
      });
      const duplicate = likelyMatches.find((processor) => processor.identityMatch && processor.id !== processorModelId);
      if (duplicate) errors.push(`Processor #${duplicate.id} (${duplicate.displayLabel}) already represents this canonical processor. Use Resolve Duplicate so the duplicate can be consolidated safely.`);
    }
  }
  if (processorBrandId && formData.modelCode && await processorCatalogModel.processorExists({
    processorBrandId,
    modelCode: formData.modelCode,
    excludeProcessorModelId: processorModelId
  })) {
    errors.push('That canonical Processor already exists for this Processor Type. Use Resolve Duplicate instead of keeping two records.');
  }
  return errors;
}

async function renderProcessorCatalogPage(req, res, next) {
  try {
    const filters = getFilters(req);
    const [processors, brands] = await Promise.all([
      processorCatalogModel.listProcessorModels(filters),
      processorCatalogModel.listProcessorBrands()
    ]);
    return res.render('pages/management-processors', {
      pageTitle: 'Processor Catalog',
      currentNav: 'admin-config-processors',
      filters,
      processors,
      brands,
      isAdmin: isAdmin(req),
      notice: String(req.query.notice || '')
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewProcessorModal(req, res, next) {
  try {
    const filters = getFilters(req);
    const brands = await processorCatalogModel.listProcessorBrands();
    return res.render('fragments/processor-catalog-edit-modal', {
      mode: 'create',
      processor: null,
      brands,
      formData: {
        processorBrandId: filters.processorBrandId ? String(filters.processorBrandId) : '',
        modelCode: '',
        legacyFamily: '',
        generation: '',
        baseSpeedGhz: '',
        isActive: '1'
      },
      filters,
      returnTo: 'processor-catalog',
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createProcessor(req, res, next) {
  const filters = getFilters(req);
  try {
    const brands = await processorCatalogModel.listProcessorBrands();
    const formData = getFormData(req);
    const errorMessages = await validateForm(formData, null);
    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/processor-catalog-edit-modal', {
        mode: 'create', processor: null, brands, formData, filters, returnTo: 'processor-catalog', errorMessages
      });
    }

    await processorCatalogModel.createProcessorModel({
      processorBrandId: formData.processorBrandId,
      modelCode: formData.modelCode,
      legacyFamily: formData.legacyFamily,
      generation: formData.generation,
      baseSpeedGhz: formData.baseSpeedGhz,
      isActive: formData.isActive === '1'
    }, req.currentUser.user_id);
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, 'created'));
  } catch (error) {
    if (error?.code === 'BWT_PROCESSOR_CATALOG_DUPLICATE' || error?.code === 'BWT_PROCESSOR_CATALOG_INPUT_INVALID') {
      const brands = await processorCatalogModel.listProcessorBrands();
      return res.status(400).render('fragments/processor-catalog-edit-modal', {
        mode: 'create', processor: null, brands, formData: getFormData(req), filters, returnTo: 'processor-catalog', errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderEditProcessorModal(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const [processor, brands] = await Promise.all([
      processorCatalogModel.getProcessorById(processorModelId),
      processorCatalogModel.listProcessorBrands()
    ]);
    if (!processor) {
      return res.status(404).render('fragments/processor-catalog-error-modal', {
        title: 'Processor Not Found',
        errorMessages: ['The selected processor could not be found.']
      });
    }
    return res.render('fragments/processor-catalog-edit-modal', {
      mode: 'edit',
      processor,
      brands,
      formData: getFormData(null, processor),
      filters,
      returnTo,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateProcessor(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const [processor, brands] = await Promise.all([
      processorCatalogModel.getProcessorById(processorModelId),
      processorCatalogModel.listProcessorBrands()
    ]);
    if (!processor) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found', returnTo));

    const formData = getFormData(req);
    const errorMessages = await validateForm(formData, processorModelId);
    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/processor-catalog-edit-modal', {
        mode: 'edit', processor, brands, formData, filters, returnTo, errorMessages
      });
    }

    await processorCatalogModel.updateProcessorModel(processorModelId, {
      processorBrandId: formData.processorBrandId,
      modelCode: formData.modelCode,
      legacyFamily: formData.legacyFamily,
      generation: formData.generation,
      baseSpeedGhz: formData.baseSpeedGhz,
      isActive: formData.isActive === '1'
    }, req.currentUser.user_id);
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, 'updated', returnTo));
  } catch (error) {
    if (error?.code === 'BWT_PROCESSOR_CATALOG_DUPLICATE' || error?.code === 'BWT_PROCESSOR_CATALOG_INPUT_INVALID') {
      const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
      const filters = getFilters(req);
      const returnTo = getReturnTo(req);
      const [processor, brands] = await Promise.all([
        processorCatalogModel.getProcessorById(processorModelId),
        processorCatalogModel.listProcessorBrands()
      ]);
      return res.status(400).render('fragments/processor-catalog-edit-modal', {
        mode: 'edit', processor, brands, formData: getFormData(req), filters, returnTo, errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderProcessorFamiliesModal(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const membership = await processorCatalogModel.listProcessorFamilyMembershipOptions(processorModelId);
    if (!membership) {
      return res.status(404).render('fragments/processor-catalog-error-modal', {
        title: 'Processor Not Found', errorMessages: ['The selected processor could not be found.']
      });
    }
    return res.render('fragments/processor-catalog-families-modal', {
      ...membership,
      filters,
      returnTo,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateProcessorFamilies(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const selectedIds = Array.isArray(req.body.processorFamilyIds)
      ? req.body.processorFamilyIds
      : req.body.processorFamilyIds
        ? [req.body.processorFamilyIds]
        : [];

    await processorCatalogModel.replaceProcessorFamilyMemberships({
      processorModelId,
      processorFamilyIds: selectedIds,
      currentUserId: req.currentUser.user_id
    });
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, 'families-updated', returnTo));
  } catch (error) {
    if (String(error?.code || '').startsWith('BWT_PROCESSOR_FAMILY_')) {
      const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
      const filters = getFilters(req);
      const returnTo = getReturnTo(req);
      const membership = await processorCatalogModel.listProcessorFamilyMembershipOptions(processorModelId);
      if (!membership) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found', returnTo));
      const selectedIds = new Set((Array.isArray(req.body.processorFamilyIds)
        ? req.body.processorFamilyIds
        : req.body.processorFamilyIds ? [req.body.processorFamilyIds] : []).map(String));
      return res.status(400).render('fragments/processor-catalog-families-modal', {
        ...membership,
        families: membership.families.map((family) => ({ ...family, isMember: selectedIds.has(String(family.id)) })),
        filters,
        returnTo,
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderProcessorModelsModal(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const associations = await processorCatalogModel.listProcessorUnitModelAssociations(processorModelId);
    if (!associations) {
      return res.status(404).render('fragments/processor-catalog-error-modal', {
        title: 'Processor Not Found', errorMessages: ['The selected processor could not be found.']
      });
    }
    return res.render('fragments/processor-catalog-models-modal', {
      ...associations,
      filters,
      returnTo,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateProcessorModels(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const selectedIds = Array.isArray(req.body.unitModelIds)
      ? req.body.unitModelIds
      : req.body.unitModelIds ? [req.body.unitModelIds] : [];

    await processorCatalogModel.replaceProcessorUnitModelAssociations({
      processorModelId,
      unitModelIds: selectedIds
    });
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, 'models-updated', returnTo));
  } catch (error) {
    if (String(error?.code || '').startsWith('BWT_PROCESSOR_MODEL_ASSOCIATION_')) {
      const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
      const filters = getFilters(req);
      const returnTo = getReturnTo(req);
      const associations = await processorCatalogModel.listProcessorUnitModelAssociations(processorModelId);
      if (!associations) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found', returnTo));
      const selectedIds = new Set((Array.isArray(req.body.unitModelIds)
        ? req.body.unitModelIds
        : req.body.unitModelIds ? [req.body.unitModelIds] : []).map(String));
      return res.status(400).render('fragments/processor-catalog-models-modal', {
        ...associations,
        models: associations.models.map((model) => ({ ...model, isMapped: selectedIds.has(String(model.id)) })),
        filters,
        returnTo,
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderDeleteProcessorModal(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const processor = await processorCatalogModel.getProcessorDeletionDetails(processorModelId);
    if (!processor) {
      return res.status(404).render('fragments/processor-catalog-error-modal', {
        title: 'Processor Not Found', errorMessages: ['The selected processor could not be found.']
      });
    }
    return res.render('fragments/processor-catalog-delete-modal', {
      processor, filters, returnTo, errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deleteProcessor(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const result = await processorCatalogModel.deleteProcessorModel({
      processorModelId,
      currentUserId: req.currentUser.user_id
    });
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, result?.retired ? 'retired' : 'deleted', returnTo));
  } catch (error) {
    if (String(error?.code || '').startsWith('BWT_PROCESSOR_DELETE_')) {
      const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
      const filters = getFilters(req);
      const returnTo = getReturnTo(req);
      const processor = await processorCatalogModel.getProcessorDeletionDetails(processorModelId);
      if (!processor) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found', returnTo));
      return res.status(400).render('fragments/processor-catalog-delete-modal', {
        processor, filters, returnTo, errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderMergeProcessorModal(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const [processor, mergeTargets] = await Promise.all([
      processorCatalogModel.getProcessorById(processorModelId),
      processorCatalogModel.listMergeTargets(processorModelId)
    ]);
    if (!processor) {
      return res.status(404).render('fragments/processor-catalog-error-modal', {
        title: 'Processor Not Found', errorMessages: ['The selected processor could not be found.']
      });
    }
    return res.render('fragments/processor-catalog-merge-modal', {
      processor, mergeTargets, filters, returnTo, selectedTargetId: '', errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function mergeProcessor(req, res, next) {
  try {
    const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
    const targetProcessorModelId = processorCatalogModel.normalizePositiveInteger(req.body.targetProcessorModelId);
    const filters = getFilters(req);
    const returnTo = getReturnTo(req);
    const [processor, mergeTargets] = await Promise.all([
      processorCatalogModel.getProcessorById(processorModelId),
      processorCatalogModel.listMergeTargets(processorModelId)
    ]);
    if (!processor) return sendRedirect(req, res, buildReturnUrl(filters, 'not-found', returnTo));
    if (!targetProcessorModelId || !mergeTargets.some((target) => target.id === targetProcessorModelId)) {
      return res.status(400).render('fragments/processor-catalog-merge-modal', {
        processor, mergeTargets, filters, returnTo,
        selectedTargetId: targetProcessorModelId ? String(targetProcessorModelId) : '',
        errorMessages: ['Choose an active canonical processor from the same Processor Type.']
      });
    }

    await processorCatalogModel.mergeProcessorModels({
      sourceProcessorModelId: processorModelId,
      targetProcessorModelId,
      currentUserId: req.currentUser.user_id
    });
    operationalOptionRankingModel.invalidateRankingSnapshot();
    return sendRedirect(req, res, buildReturnUrl(filters, 'merged', returnTo));
  } catch (error) {
    if (String(error?.code || '').startsWith('BWT_PROCESSOR_MERGE_')) {
      const processorModelId = processorCatalogModel.normalizePositiveInteger(req.params.processorModelId);
      const filters = getFilters(req);
      const returnTo = getReturnTo(req);
      const [processor, mergeTargets] = await Promise.all([
        processorCatalogModel.getProcessorById(processorModelId),
        processorCatalogModel.listMergeTargets(processorModelId)
      ]);
      return res.status(400).render('fragments/processor-catalog-merge-modal', {
        processor, mergeTargets, filters, returnTo,
        selectedTargetId: String(req.body.targetProcessorModelId || ''),
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

module.exports = {
  renderProcessorCatalogPage,
  renderNewProcessorModal,
  createProcessor,
  renderEditProcessorModal,
  updateProcessor,
  renderProcessorFamiliesModal,
  updateProcessorFamilies,
  renderProcessorModelsModal,
  updateProcessorModels,
  renderMergeProcessorModal,
  mergeProcessor,
  renderDeleteProcessorModal,
  deleteProcessor
};
