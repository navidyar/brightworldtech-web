'use strict';

const processorFamilyModel = require('../models/processorFamilyModel');

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getFormDataFromRequest(req) {
  return {
    processorBrandId: String(req.body.processorBrandId || '').trim(),
    name: String(req.body.name || '').trim(),
    code: String(req.body.code || '').trim(),
    shortForm: String(req.body.shortForm || '').trim(),
    description: String(req.body.description || '').trim(),
    isActive: req.body.isActive === '1' ? '1' : '0',
    memberProcessorModelIds: Array.isArray(req.body.memberProcessorModelIds)
      ? req.body.memberProcessorModelIds.map(String)
      : req.body.memberProcessorModelIds
        ? [String(req.body.memberProcessorModelIds)]
        : []
  };
}

function getBlankFormData() {
  return {
    processorBrandId: '',
    name: '',
    code: '',
    shortForm: '',
    description: '',
    isActive: '1',
    memberProcessorModelIds: []
  };
}

function getFormDataFromFamily(family, processors) {
  return {
    processorBrandId: String(family.processor_brand_id || ''),
    name: family.name || '',
    code: family.code || '',
    shortForm: family.export_short_form || '',
    description: family.description || '',
    isActive: Number(family.is_active) === 1 ? '1' : '0',
    memberProcessorModelIds: (Array.isArray(processors) ? processors : [])
      .filter((processor) => processor.isMember)
      .map((processor) => String(processor.id))
  };
}

function validateFormData(formData, brands, processors) {
  const errors = [];
  const brandIds = new Set((Array.isArray(brands) ? brands : []).map((brand) => String(brand.id)));
  const processorIds = new Set((Array.isArray(processors) ? processors : []).map((processor) => String(processor.id)));

  if (!brandIds.has(String(formData.processorBrandId))) {
    errors.push('Select an active processor brand.');
  }

  if (formData.name.length < 2 || formData.name.length > 120) {
    errors.push('Processor family name must be between 2 and 120 characters.');
  }

  if (formData.code && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.code)) {
    errors.push('Family code may contain lowercase letters, numbers, and single hyphens only.');
  }

  if (!formData.shortForm || formData.shortForm.length > 40) {
    errors.push('Short Form is required and must be 40 characters or fewer.');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._+\-/ ]*$/.test(formData.shortForm)) {
    errors.push('Short Form may contain letters, numbers, spaces, periods, underscores, plus signs, slashes, and hyphens.');
  }

  if (formData.description.length > 500) {
    errors.push('Description must be 500 characters or fewer.');
  }

  if (formData.memberProcessorModelIds.some((processorId) => !processorIds.has(String(processorId)))) {
    errors.push('One or more selected processors do not belong to the selected brand.');
  }

  return errors;
}

async function renderFamilyModal(res, {
  mode,
  family = null,
  formData,
  errorMessages = []
}) {
  const brands = await processorFamilyModel.listProcessorBrands();
  const selectedBrandId = normalizePositiveInteger(formData.processorBrandId)
    || Number(family?.processor_brand_id || 0)
    || Number(brands[0]?.id || 0);
  const processors = selectedBrandId
    ? await processorFamilyModel.listProcessorModelsForFamily({
        processorBrandId: selectedBrandId,
        processorFamilyId: family?.processor_family_id || null
      })
    : [];
  const selectedIds = new Set((formData.memberProcessorModelIds || []).map(String));
  const processorsWithSelection = processors.map((processor) => ({
    ...processor,
    isMember: selectedIds.size > 0
      ? selectedIds.has(String(processor.id))
      : processor.isMember
  }));

  return res.render('fragments/processor-family-form-modal', {
    mode,
    family,
    brands,
    processors: processorsWithSelection,
    formData: {
      ...formData,
      processorBrandId: selectedBrandId ? String(selectedBrandId) : ''
    },
    errorMessages
  });
}

async function renderProcessorFamiliesPage(req, res, next) {
  try {
    const [families, summary, unmappedProcessors] = await Promise.all([
      processorFamilyModel.listProcessorFamilies({ includeInactive: true }),
      processorFamilyModel.getProcessorFamilySummary(),
      processorFamilyModel.listUnmappedProcessorModels()
    ]);

    return res.render('pages/processor-families', {
      pageTitle: 'Processor Families',
      currentNav: 'admin-config-processor-families',
      families,
      summary,
      unmappedProcessors,
      successMessage: req.query.created === '1'
        ? 'Processor family created.'
        : req.query.updated === '1'
          ? 'Processor family updated.'
          : ''
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewProcessorFamilyModal(req, res, next) {
  try {
    const brands = await processorFamilyModel.listProcessorBrands();
    const brandId = normalizePositiveInteger(req.query.processorBrandId) || Number(brands[0]?.id || 0);

    return renderFamilyModal(res, {
      mode: 'create',
      formData: {
        ...getBlankFormData(),
        processorBrandId: brandId ? String(brandId) : ''
      }
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditProcessorFamilyModal(req, res, next) {
  try {
    const processorFamilyId = normalizePositiveInteger(req.params.processorFamilyId);
    const family = processorFamilyId
      ? await processorFamilyModel.getProcessorFamilyById(processorFamilyId)
      : null;

    if (!family) {
      return res.status(404).render('fragments/processor-family-form-modal', {
        mode: 'edit',
        family: null,
        brands: [],
        processors: [],
        formData: getBlankFormData(),
        errorMessages: ['The selected processor family could not be found.']
      });
    }

    const processors = await processorFamilyModel.listProcessorModelsForFamily({
      processorBrandId: family.processor_brand_id,
      processorFamilyId
    });

    return renderFamilyModal(res, {
      mode: 'edit',
      family,
      formData: getFormDataFromFamily(family, processors)
    });
  } catch (error) {
    next(error);
  }
}

async function createProcessorFamily(req, res, next) {
  try {
    const formData = getFormDataFromRequest(req);
    const brands = await processorFamilyModel.listProcessorBrands();
    const processors = normalizePositiveInteger(formData.processorBrandId)
      ? await processorFamilyModel.listProcessorModelsForFamily({ processorBrandId: formData.processorBrandId })
      : [];
    const errorMessages = validateFormData(formData, brands, processors);

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/processor-family-form-modal', {
        mode: 'create',
        family: null,
        brands,
        processors: processors.map((processor) => ({
          ...processor,
          isMember: formData.memberProcessorModelIds.includes(String(processor.id))
        })),
        formData,
        errorMessages
      });
    }

    await processorFamilyModel.createProcessorFamily(formData, req.currentUser.user_id);
    res.set('HX-Redirect', '/management/config/processor-families?created=1');
    return res.send('');
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || /processor family|processor brand|selected processors/i.test(error.message))) {
      const formData = getFormDataFromRequest(req);
      const brands = await processorFamilyModel.listProcessorBrands();
      const processors = normalizePositiveInteger(formData.processorBrandId)
        ? await processorFamilyModel.listProcessorModelsForFamily({ processorBrandId: formData.processorBrandId })
        : [];
      return res.status(400).render('fragments/processor-family-form-modal', {
        mode: 'create',
        family: null,
        brands,
        processors: processors.map((processor) => ({
          ...processor,
          isMember: formData.memberProcessorModelIds.includes(String(processor.id))
        })),
        formData,
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function updateProcessorFamily(req, res, next) {
  try {
    const processorFamilyId = normalizePositiveInteger(req.params.processorFamilyId);
    const family = processorFamilyId
      ? await processorFamilyModel.getProcessorFamilyById(processorFamilyId)
      : null;
    const formData = getFormDataFromRequest(req);
    const brands = await processorFamilyModel.listProcessorBrands();
    const processors = normalizePositiveInteger(formData.processorBrandId)
      ? await processorFamilyModel.listProcessorModelsForFamily({
          processorBrandId: formData.processorBrandId,
          processorFamilyId
        })
      : [];
    const errorMessages = validateFormData(formData, brands, processors);

    if (!family) errorMessages.push('The selected processor family could not be found.');

    if (errorMessages.length > 0) {
      return res.status(family ? 400 : 404).render('fragments/processor-family-form-modal', {
        mode: 'edit',
        family,
        brands,
        processors: processors.map((processor) => ({
          ...processor,
          isMember: formData.memberProcessorModelIds.includes(String(processor.id))
        })),
        formData,
        errorMessages
      });
    }

    await processorFamilyModel.updateProcessorFamily(processorFamilyId, formData, req.currentUser.user_id);
    res.set('HX-Redirect', '/management/config/processor-families?updated=1');
    return res.send('');
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || /processor family|processor brand|selected processors/i.test(error.message))) {
      const processorFamilyId = normalizePositiveInteger(req.params.processorFamilyId);
      const family = processorFamilyId
        ? await processorFamilyModel.getProcessorFamilyById(processorFamilyId)
        : null;
      const formData = getFormDataFromRequest(req);
      const brands = await processorFamilyModel.listProcessorBrands();
      const processors = normalizePositiveInteger(formData.processorBrandId)
        ? await processorFamilyModel.listProcessorModelsForFamily({ processorBrandId: formData.processorBrandId, processorFamilyId })
        : [];
      return res.status(400).render('fragments/processor-family-form-modal', {
        mode: 'edit',
        family,
        brands,
        processors: processors.map((processor) => ({
          ...processor,
          isMember: formData.memberProcessorModelIds.includes(String(processor.id))
        })),
        formData,
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function renderProcessorFamilyMembersFragment(req, res, next) {
  try {
    const processorBrandId = normalizePositiveInteger(req.query.processorBrandId);
    const processorFamilyId = normalizePositiveInteger(req.query.processorFamilyId);
    const processors = processorBrandId
      ? await processorFamilyModel.listProcessorModelsForFamily({ processorBrandId, processorFamilyId })
      : [];

    return res.render('fragments/processor-family-member-options', { processors });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createProcessorFamily,
  renderEditProcessorFamilyModal,
  renderNewProcessorFamilyModal,
  renderProcessorFamiliesPage,
  renderProcessorFamilyMembersFragment,
  updateProcessorFamily
};
