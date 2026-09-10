'use strict';

const labelLibraryModel = require('../models/labelLibraryModel');
const {
  LABEL_TEMPLATE_CATEGORIES,
  LABEL_TEMPLATE_STATUSES
} = require('../config/labelLibrary');
const {
  LabelTemplateInputError,
  normalizeTemplateInput
} = require('../services/labelTemplateInputPolicy');
const {
  deleteContentAddressedAsset,
  resolveAssetAbsolutePath
} = require('../services/labelAssetStorage');

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function sendRedirect(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.send('');
  }
  return res.redirect(url);
}

function getNotice(query = {}) {
  if (query.created === '1') return 'Label template created as Draft.';
  if (query.updated === '1') return 'Label template updated successfully.';
  if (query.cloned === '1') return 'Label template cloned as a new Draft.';
  if (query.activated === '1') return 'Label template activated.';
  if (query.archived === '1') return 'Label template archived.';
  if (query.deleted === '1') return 'Label template deleted. Historical print snapshots remain intact.';
  return null;
}

function applyTemplateFilters(templates, query = {}) {
  const search = String(query.search || '').trim().toLowerCase();
  const category = String(query.category || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();

  return templates.filter((template) => {
    if (category && template.category_code !== category) return false;
    if (status && template.status !== status) return false;
    if (search) {
      const haystack = `${template.name || ''} ${template.description || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

async function renderLabelLibraryPage(req, res, next) {
  try {
    const [allTemplates, assets, storage] = await Promise.all([
      labelLibraryModel.listLabelTemplates({ includeArchived: true }),
      labelLibraryModel.listLabelAssets({ includeArchived: true }),
      labelLibraryModel.getRepositoryStorageSummary()
    ]);
    const templates = applyTemplateFilters(allTemplates, req.query);
    const summary = {
      total: allTemplates.length,
      active: allTemplates.filter((template) => template.status === 'active').length,
      draft: allTemplates.filter((template) => template.status === 'draft').length,
      archived: allTemplates.filter((template) => template.status === 'archived').length,
      newCount: allTemplates.filter((template) => template.new_until && new Date(template.new_until) > new Date()).length
    };

    return res.render('pages/management-label-library', {
      pageTitle: 'Label Template Library',
      currentNav: 'management-label-library',
      templates,
      assets,
      storage,
      summary,
      categories: LABEL_TEMPLATE_CATEGORIES,
      statuses: LABEL_TEMPLATE_STATUSES,
      filters: {
        search: String(req.query.search || '').trim(),
        category: String(req.query.category || '').trim(),
        status: String(req.query.status || '').trim()
      },
      successMessage: getNotice(req.query),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

function renderTemplateForm(res, { template = null, formData = null, errorMessages = [], statusCode = 200 }) {
  return res.status(statusCode).render('fragments/label-template-form-modal', {
    template,
    categories: LABEL_TEMPLATE_CATEGORIES,
    formData: formData || {
      name: template?.name || '',
      description: template?.description || '',
      categoryCode: template?.category_code || 'standard'
    },
    errorMessages
  });
}

async function renderNewTemplateModal(req, res, next) {
  try {
    return renderTemplateForm(res, { template: null });
  } catch (error) {
    next(error);
  }
}

async function createTemplate(req, res, next) {
  try {
    const formData = {
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      categoryCode: String(req.body.categoryCode || '').trim()
    };
    const normalized = normalizeTemplateInput(formData);
    await labelLibraryModel.createLabelTemplate(normalized, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?created=1');
  } catch (error) {
    if (error instanceof LabelTemplateInputError) {
      return renderTemplateForm(res, {
        template: null,
        formData: {
          name: String(req.body.name || '').trim(),
          description: String(req.body.description || '').trim(),
          categoryCode: String(req.body.categoryCode || '').trim()
        },
        errorMessages: error.messages,
        statusCode: 400
      });
    }
    next(error);
  }
}

async function renderEditTemplateModal(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) return renderTemplateForm(res, { template: null, errorMessages: ['The label template could not be found.'], statusCode: 404 });
    return renderTemplateForm(res, { template });
  } catch (error) {
    next(error);
  }
}

async function updateTemplate(req, res, next) {
  const templateId = Number(req.params.labelTemplateId);
  try {
    const existing = await labelLibraryModel.getLabelTemplateById(templateId);
    if (!existing) return renderTemplateForm(res, { template: null, errorMessages: ['The label template could not be found.'], statusCode: 404 });
    const formData = {
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      categoryCode: String(req.body.categoryCode || '').trim()
    };
    const normalized = normalizeTemplateInput(formData);
    await labelLibraryModel.updateLabelTemplate(templateId, normalized, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?updated=1');
  } catch (error) {
    if (error instanceof LabelTemplateInputError) {
      return renderTemplateForm(res, {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        formData: {
          name: String(req.body.name || '').trim(),
          description: String(req.body.description || '').trim(),
          categoryCode: String(req.body.categoryCode || '').trim()
        },
        errorMessages: error.messages,
        statusCode: 400
      });
    }
    next(error);
  }
}

async function cloneTemplate(req, res, next) {
  try {
    await labelLibraryModel.cloneLabelTemplate(req.params.labelTemplateId, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?cloned=1');
  } catch (error) {
    next(error);
  }
}

async function renderTemplateActionModal(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) {
      return res.status(404).render('fragments/label-template-action-modal', {
        template: null,
        action: req.params.action,
        attachments: [],
        errorMessages: ['The label template could not be found.']
      });
    }
    const action = String(req.params.action || '').trim();
    if (!['activate', 'archive', 'delete'].includes(action)) {
      return res.status(404).render('fragments/label-template-action-modal', {
        template,
        action,
        attachments: [],
        errorMessages: ['The requested label action is not available.']
      });
    }
    const attachments = action === 'delete'
      ? await labelLibraryModel.listEffectiveTemplateLotUsage(template.label_template_id)
      : [];
    return res.render('fragments/label-template-action-modal', {
      template,
      action,
      attachments,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function applyTemplateAction(req, res, next) {
  const action = String(req.params.action || '').trim();
  const templateId = Number(req.params.labelTemplateId);
  try {
    if (action === 'delete') {
      const result = await labelLibraryModel.deleteLabelTemplate(templateId, req.currentUser.user_id);
      if (!result) return sendRedirect(req, res, '/management/label-library');
      for (const asset of result.orphanedTransientAssets) {
        try {
          await deleteContentAddressedAsset(asset.relativePath);
        } catch (cleanupError) {
          console.warn('Label Library orphan asset cleanup failed:', cleanupError.message);
        }
      }
      return sendRedirect(req, res, '/management/label-library?deleted=1');
    }

    if (!['activate', 'archive'].includes(action)) {
      return res.status(400).render('fragments/label-template-action-modal', {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        action,
        attachments: [],
        errorMessages: ['The requested label action is not available.']
      });
    }

    await labelLibraryModel.setLabelTemplateStatus(templateId, action === 'activate' ? 'active' : 'archived', req.currentUser.user_id);
    return sendRedirect(req, res, `/management/label-library?${action === 'activate' ? 'activated' : 'archived'}=1`);
  } catch (error) {
    if (error.code === 'LABEL_TEMPLATE_CONFIG_REQUIRED') {
      return res.status(400).render('fragments/label-template-action-modal', {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        action,
        attachments: [],
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}

async function serveAssetFile(req, res, next) {
  try {
    const asset = await labelLibraryModel.getLabelAssetById(req.params.assetId);
    if (!asset) return res.sendStatus(404);
    const safeKinds = new Set(['logo', 'image', 'background', 'preview']);
    if (!safeKinds.has(String(asset.asset_kind))) return res.sendStatus(404);
    const absolutePath = resolveAssetAbsolutePath(asset.storage_relative_path);
    res.set('Cache-Control', 'private, max-age=300');
    res.type(asset.mime_type);
    return res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLabelLibraryPage,
  renderNewTemplateModal,
  createTemplate,
  renderEditTemplateModal,
  updateTemplate,
  cloneTemplate,
  renderTemplateActionModal,
  applyTemplateAction,
  serveAssetFile
};
