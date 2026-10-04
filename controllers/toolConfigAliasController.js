'use strict';

const toolConfigAliasModel = require('../models/toolConfigAliasModel');

function positiveInt(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function renderModal(res, configCategoryId, { errorMessages = [], successMessage = '' } = {}) {
  const category = await toolConfigAliasModel.getCategory(configCategoryId);
  if (!category || !category.system_config_category_id) {
    return res.status(404).render('fragments/tool-config-aliases-modal', {
      category: null,
      values: [],
      aliases: [],
      errorMessages: ['Tool aliases are available only for system-used Configuration categories.'],
      successMessage: ''
    });
  }
  const [values, aliases] = await Promise.all([
    toolConfigAliasModel.listActiveValues(configCategoryId),
    toolConfigAliasModel.listAliases(configCategoryId)
  ]);
  return res.render('fragments/tool-config-aliases-modal', {
    category,
    values,
    aliases,
    errorMessages,
    successMessage
  });
}

async function renderToolAliasesModal(req, res, next) {
  try {
    const categoryId = positiveInt(req.params.configCategoryId);
    if (!categoryId) return res.status(404).send('Configuration category not found.');
    return renderModal(res, categoryId);
  } catch (error) { return next(error); }
}

async function createToolAlias(req, res, next) {
  const categoryId = positiveInt(req.params.configCategoryId);
  try {
    await toolConfigAliasModel.createAlias({
      configCategoryId: categoryId,
      aliasValue: req.body.aliasValue,
      targetConfigValueId: req.body.targetConfigValueId,
      userId: req.currentUser?.user_id
    });
    return renderModal(res, categoryId, { successMessage: 'Tool alias saved.' });
  } catch (error) {
    if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return renderModal(res, categoryId, { errorMessages: [error.message] });
    }
    return next(error);
  }
}

async function deleteToolAlias(req, res, next) {
  const categoryId = positiveInt(req.params.configCategoryId);
  try {
    await toolConfigAliasModel.deleteAlias({
      aliasId: req.params.aliasId,
      configCategoryId: categoryId
    });
    return renderModal(res, categoryId, { successMessage: 'Tool alias deleted.' });
  } catch (error) {
    if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return renderModal(res, categoryId, { errorMessages: [error.message] });
    }
    return next(error);
  }
}

module.exports = { renderToolAliasesModal, createToolAlias, deleteToolAlias };
