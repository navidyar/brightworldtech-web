const configModel = require('../models/configModel');

const PASSWORD_LINK_EXPIRY_CATEGORY_CODE = 'security_settings';
const PASSWORD_LINK_EXPIRY_VALUE_CODE = 'password_link_expiry_hours';
const MIN_PASSWORD_LINK_EXPIRY_HOURS = 1;
const MAX_PASSWORD_LINK_EXPIRY_HOURS = 24;

function isPasswordLinkExpirySetting(configValue) {
  return Boolean(
    configValue
    && configValue.category_code === PASSWORD_LINK_EXPIRY_CATEGORY_CODE
    && configValue.code === PASSWORD_LINK_EXPIRY_VALUE_CODE
  );
}

function parsePasswordLinkExpiryHours(value) {
  const rawValue = String(value ?? '').trim();
  const hours = Number.parseInt(rawValue, 10);

  if (!/^\d+$/.test(rawValue) || !Number.isInteger(hours)) {
    return null;
  }

  if (hours < MIN_PASSWORD_LINK_EXPIRY_HOURS || hours > MAX_PASSWORD_LINK_EXPIRY_HOURS) {
    return null;
  }

  return hours;
}

function parseIncludeInactiveFlag(value) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function sendHtmxRedirect(req, res, redirectUrl) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', redirectUrl);
    return res.status(204).send('');
  }

  return res.redirect(redirectUrl);
}

function getConfigReturnUrl(includeInactiveValues, queryString = '') {
  const baseUrl = includeInactiveValues ? '/management/config?includeInactive=1' : '/management/config';

  if (!queryString) {
    return baseUrl;
  }

  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryString}`;
}

function addCacheBuster(redirectUrl) {
  const separator = redirectUrl.includes('?') ? '&' : '?';
  return `${redirectUrl}${separator}refresh=${Date.now()}`;
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseSortOrder(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 0;
  }

  const number = Number.parseInt(String(value).trim(), 10);
  return Number.isInteger(number) ? number : 0;
}

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getConfigValueFormDataFromRequest(req) {
  return {
    configCategoryId: String(req.body.configCategoryId || '').trim(),
    code: normalizeCode(req.body.code),
    label: String(req.body.label || '').trim(),
    value: String(req.body.value || '').trim(),
    description: String(req.body.description || '').trim(),
    sortOrder: String(req.body.sortOrder || '').trim(),
    isActive: req.body.isActive === '1' ? '1' : '0',
    includeInactive: parseIncludeInactiveFlag(req.body.includeInactive) ? '1' : '0'
  };
}

function getInitialConfigValueFormData({ categoryId = '', configValue = null, includeInactiveValues = false } = {}) {
  if (configValue) {
    return {
      configCategoryId: String(configValue.config_category_id || ''),
      code: configValue.code || '',
      label: configValue.label || '',
      value: configValue.value || '',
      description: configValue.description || '',
      sortOrder: String(configValue.sort_order ?? 0),
      isActive: configValue.isActive ? '1' : '0',
      includeInactive: includeInactiveValues ? '1' : '0'
    };
  }

  return {
    configCategoryId: categoryId ? String(categoryId) : '',
    code: '',
    label: '',
    value: '',
    description: '',
    sortOrder: '0',
    isActive: '1',
    includeInactive: includeInactiveValues ? '1' : '0'
  };
}

async function validateConfigValueForm(formData, options = {}) {
  const errorMessages = [];
  const configCategoryId = parsePositiveInteger(formData.configCategoryId);
  const configValueId = options.configValueId ? Number(options.configValueId) : null;
  const protectedSecuritySetting = isPasswordLinkExpirySetting(options.configValue);

  if (!configCategoryId) {
    errorMessages.push('Choose a configuration category.');
  } else {
    const category = await configModel.getConfigCategoryById(configCategoryId);

    if (!category) {
      errorMessages.push('The selected configuration category could not be found.');
    }
  }

  if (!formData.code) {
    errorMessages.push('Enter a stable code for this value.');
  } else if (!/^[a-z0-9][a-z0-9_-]{1,118}[a-z0-9]$/.test(formData.code)) {
    errorMessages.push('Code must be 3 to 120 characters and use lowercase letters, numbers, underscores, or hyphens.');
  } else {
    const codeExists = await configModel.configValueCodeExists(formData.code, configValueId);

    if (codeExists) {
      errorMessages.push('That config value code is already in use. Codes must stay unique.');
    }
  }

  if (!formData.label) {
    errorMessages.push('Enter a label.');
  }

  if (formData.label.length > 120) {
    errorMessages.push('Label must be 120 characters or less.');
  }

  if (formData.value.length > 120) {
    errorMessages.push('Value must be 120 characters or less.');
  }

  if (formData.description.length > 500) {
    errorMessages.push('Description must be 500 characters or less.');
  }

  if (protectedSecuritySetting) {
    const expiryHours = parsePasswordLinkExpiryHours(formData.value);

    if (expiryHours === null) {
      errorMessages.push(`Password setup/reset link expiration must be a whole number from ${MIN_PASSWORD_LINK_EXPIRY_HOURS} through ${MAX_PASSWORD_LINK_EXPIRY_HOURS} hours.`);
    }
  }

  return errorMessages;
}

async function renderConfigPage(req, res, next) {
  try {
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const categories = await configModel.listConfigCategoriesWithValues({ includeInactiveValues });
    const categorySections = configModel.groupConfigCategories(categories);
    const summary = await configModel.getConfigSummary();

    res.render('pages/management-config', {
      pageTitle: 'Config Values',
      currentNav: 'management-config',
      categories,
      categorySections,
      summary,
      includeInactiveValues
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewConfigValueModal(req, res, next) {
  try {
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const categories = await configModel.listConfigCategoriesForForm();

    return res.render('fragments/config-value-form-modal', {
      mode: 'create',
      configValue: null,
      categories,
      errorMessages: [],
      formData: getInitialConfigValueFormData({
        categoryId: req.query.categoryId,
        includeInactiveValues
      }),
      isPasswordLinkExpirySetting: false
    });
  } catch (error) {
    next(error);
  }
}

async function createConfigValue(req, res, next) {
  try {
    const formData = getConfigValueFormDataFromRequest(req);
    const categories = await configModel.listConfigCategoriesForForm();
    const errorMessages = await validateConfigValueForm(formData);

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/config-value-form-modal', {
        mode: 'create',
        configValue: null,
        categories,
        errorMessages,
        formData,
        isPasswordLinkExpirySetting: false
      });
    }

    await configModel.createConfigValue({
      configCategoryId: parsePositiveInteger(formData.configCategoryId),
      code: formData.code,
      label: formData.label,
      value: formData.value,
      description: formData.description,
      sortOrder: parseSortOrder(formData.sortOrder),
      isActive: formData.isActive === '1'
    });

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(getConfigReturnUrl(formData.includeInactive === '1', 'created=1'))
    );
  } catch (error) {
    next(error);
  }
}

async function renderEditConfigValueModal(req, res, next) {
  try {
    const configValueId = parsePositiveInteger(req.params.configValueId);
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const configValue = configValueId ? await configModel.getConfigValueById(configValueId) : null;

    if (!configValue) {
      return res.status(404).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue: null,
        includeInactiveValues,
        errorMessages: ['The selected config value could not be found.']
      });
    }

    const categories = await configModel.listConfigCategoriesForForm();

    return res.render('fragments/config-value-form-modal', {
      mode: 'edit',
      configValue,
      categories,
      errorMessages: [],
      formData: getInitialConfigValueFormData({ configValue, includeInactiveValues }),
      isPasswordLinkExpirySetting: isPasswordLinkExpirySetting(configValue)
    });
  } catch (error) {
    next(error);
  }
}

async function updateConfigValue(req, res, next) {
  try {
    const configValueId = parsePositiveInteger(req.params.configValueId);
    const formData = getConfigValueFormDataFromRequest(req);
    const categories = await configModel.listConfigCategoriesForForm();
    const configValue = configValueId ? await configModel.getConfigValueById(configValueId) : null;

    if (!configValue) {
      return sendHtmxRedirect(req, res, getConfigReturnUrl(formData.includeInactive === '1', 'error=not_found'));
    }

    const protectedSecuritySetting = isPasswordLinkExpirySetting(configValue);

    if (protectedSecuritySetting) {
      formData.configCategoryId = String(configValue.config_category_id);
      formData.code = configValue.code;
      formData.label = configValue.label || configValue.code;
      formData.description = configValue.description || '';
      formData.sortOrder = String(configValue.sort_order ?? 0);
      formData.isActive = '1';
    }

    const errorMessages = await validateConfigValueForm(formData, { configValueId, configValue });

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/config-value-form-modal', {
        mode: 'edit',
        configValue,
        categories,
        errorMessages,
        formData,
        isPasswordLinkExpirySetting: protectedSecuritySetting
      });
    }

    await configModel.updateConfigValue({
      configValueId,
      configCategoryId: parsePositiveInteger(formData.configCategoryId),
      code: formData.code,
      label: formData.label,
      value: formData.value,
      description: formData.description,
      sortOrder: parseSortOrder(formData.sortOrder),
      isActive: formData.isActive === '1'
    });

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(getConfigReturnUrl(formData.includeInactive === '1', 'updated=1'))
    );
  } catch (error) {
    next(error);
  }
}

async function renderConfigValueStatusModal(req, res, next) {
  try {
    const configValueId = parsePositiveInteger(req.params.configValueId);
    const actionType = req.path.includes('/activate') ? 'activate' : 'deactivate';
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const configValue = configValueId ? await configModel.getConfigValueById(configValueId) : null;

    if (!configValue) {
      return res.status(404).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue: null,
        includeInactiveValues,
        errorMessages: ['The selected config value could not be found.']
      });
    }

    if (actionType === 'deactivate' && isPasswordLinkExpirySetting(configValue)) {
      return res.status(400).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue,
        includeInactiveValues,
        errorMessages: ['Password setup/reset link expiration is a required system security setting and cannot be deactivated. Edit its hour value instead.']
      });
    }

    return res.render('fragments/config-value-status-modal', {
      actionType,
      configValue,
      includeInactiveValues,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateConfigValueStatus(req, res, next) {
  try {
    const configValueId = parsePositiveInteger(req.params.configValueId);
    const shouldActivate = req.path.includes('/activate');
    const includeInactiveValues = parseIncludeInactiveFlag(req.body.includeInactive);
    const configValue = configValueId ? await configModel.getConfigValueById(configValueId) : null;

    if (!configValue) {
      return sendHtmxRedirect(req, res, getConfigReturnUrl(includeInactiveValues, 'error=not_found'));
    }

    if (!shouldActivate && isPasswordLinkExpirySetting(configValue)) {
      return res.status(400).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue,
        includeInactiveValues,
        errorMessages: ['Password setup/reset link expiration is a required system security setting and cannot be deactivated. Edit its hour value instead.']
      });
    }

    await configModel.setConfigValueActive(configValueId, shouldActivate);

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(getConfigReturnUrl(!shouldActivate, shouldActivate ? 'activated=1' : 'deactivated=1'))
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderConfigPage,
  renderNewConfigValueModal,
  createConfigValue,
  renderEditConfigValueModal,
  updateConfigValue,
  renderConfigValueStatusModal,
  updateConfigValueStatus
};
