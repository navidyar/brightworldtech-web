const configModel = require('../models/configModel');
const operationalOptionRankingModel = require('../models/operationalOptionRankingModel');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const {
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  parsePasswordLinkExpiryHours
} = require('../services/passwordLinkExpiryPolicy');
const {
  MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  parseSessionInactivityTimeoutMinutes
} = require('../services/sessionInactivityTimeoutPolicy');
const { setCachedSessionInactivityTimeoutMinutes } = require('../models/sessionTimeoutConfigModel');
const {
  buildOperationalOptionRankingAdministration,
  formatRefreshIntervalLabel,
  parseAllowedRefreshIntervalMinutes
} = require('../services/operationalOptionRankingAdministration');

function isPasswordLinkExpirySetting(configValue) {
  return Number(configValue?.system_config_value_id || 0) === SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_EXPIRY_HOURS;
}

function isSessionInactivityTimeoutSetting(configValue) {
  return Number(configValue?.system_config_value_id || 0) === SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES;
}

function isRequiredSecuritySetting(configValue) {
  return isPasswordLinkExpirySetting(configValue) || isSessionInactivityTimeoutSetting(configValue);
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

function parseOrderedConfigValueIds(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

function getProjectedActiveValueCount(selectedCategory, formData, configValue = null) {
  if (!selectedCategory) {
    return 0;
  }

  const selectedCategoryId = Number(selectedCategory.config_category_id);
  const desiredActive = formData.isActive === '1';
  let activeValueCount = Number(selectedCategory.activeValueCount || 0);

  if (!configValue) {
    return activeValueCount + (desiredActive ? 1 : 0);
  }

  const originalCategoryId = Number(configValue.config_category_id);
  const originalActive = Boolean(configValue.isActive);

  if (originalCategoryId === selectedCategoryId) {
    activeValueCount -= originalActive ? 1 : 0;
  }

  activeValueCount += desiredActive ? 1 : 0;
  return Math.max(0, activeValueCount);
}

function categoryUsesDragOrderingAfterSave(selectedCategory, formData, configValue = null) {
  return Boolean(
    selectedCategory
    && !selectedCategory.usesPopularitySorting
    && getProjectedActiveValueCount(selectedCategory, formData, configValue) >= 3
  );
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

function normalizeProcessorTypeCode(value) {
  return normalizeCode(value).slice(0, 75);
}

function getProcessorTypeFormData(req, processorType = null) {
  const name = String(req?.body?.name ?? processorType?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const typedCode = String(req?.body?.code ?? processorType?.code ?? '').trim();
  return {
    name,
    code: normalizeProcessorTypeCode(typedCode || name),
    isActive: req?.body ? req.body.isActive === '1' : Boolean(processorType?.isActive ?? true),
    includeInactive: parseIncludeInactiveFlag(req?.body?.includeInactive ?? req?.query?.includeInactive) ? '1' : '0'
  };
}

async function validateProcessorTypeForm(formData, processorBrandId = null) {
  const errors = [];
  if (!formData.name) errors.push('Enter a Processor Type name.');
  if (formData.name.length > 100) errors.push('Processor Type name must be 100 characters or less.');
  if (!formData.code || !/^[a-z0-9_-]{1,75}$/.test(formData.code)) {
    errors.push('Processor Type code must be 1 to 75 characters using lowercase letters, numbers, underscores, or hyphens.');
  }
  if (errors.length === 0) {
    const conflict = await configModel.processorTypeIdentityExists({
      code: formData.code,
      name: formData.name,
      exceptProcessorBrandId: processorBrandId
    });
    if (conflict) {
      errors.push(`Processor Type ${conflict.name} already uses that name or code.`);
    }
  }
  return errors;
}

function getConfigValueFormDataFromRequest(req) {
  return {
    configCategoryId: String(req.body.configCategoryId || '').trim(),
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
  const passwordLinkExpirySetting = isPasswordLinkExpirySetting(options.configValue);
  const sessionInactivityTimeoutSetting = isSessionInactivityTimeoutSetting(options.configValue);
  let selectedCategory = null;

  if (!configCategoryId) {
    errorMessages.push('Choose a configuration category.');
  } else {
    const category = await configModel.getConfigCategoryById(configCategoryId);
    selectedCategory = category;

    if (!category) {
      errorMessages.push('The selected configuration category could not be found.');
    }
  }

  if (options.configValue?.isProtected
      && configCategoryId
      && Number(options.configValue.config_category_id) !== Number(configCategoryId)) {
    errorMessages.push('Protected system values cannot be moved to a different configuration category.');
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

  if (passwordLinkExpirySetting) {
    const expiryHours = parsePasswordLinkExpiryHours(formData.value);

    if (expiryHours === null) {
      errorMessages.push(`Password setup/reset link expiration must be a whole number from ${MIN_PASSWORD_LINK_EXPIRY_HOURS} through ${MAX_PASSWORD_LINK_EXPIRY_HOURS} hours.`);
    }
  }

  if (sessionInactivityTimeoutSetting) {
    const timeoutMinutes = parseSessionInactivityTimeoutMinutes(formData.value);

    if (timeoutMinutes === null) {
      errorMessages.push(`Session inactivity timeout must be a whole number from ${MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES} through ${MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES} minutes.`);
    }
  }

  return errorMessages;
}

async function loadOperationalRankingAdministration(categories, options = {}) {
  const [refreshState, scopeSummaryRows, refreshMinutes] = await Promise.all([
    operationalOptionRankingModel.getRefreshState(),
    operationalOptionRankingModel.listRankingScopeSummaries(),
    operationalOptionRankingModel.getConfiguredRefreshMinutes()
  ]);

  return buildOperationalOptionRankingAdministration({
    refreshState,
    scopeSummaryRows,
    categories,
    refreshMinutes,
    message: options.message || null,
    messageType: options.messageType || 'success',
    detailsOpen: options.detailsOpen === true
  });
}

async function renderOperationalRankingAdministration(res, options = {}) {
  const categories = await configModel.listConfigCategoriesWithValues({ includeInactiveValues: false });
  const rankingAdministration = await loadOperationalRankingAdministration(categories, options);

  return res.render('fragments/operational-option-ranking-administration', {
    rankingAdministration
  });
}

async function renderConfigPage(req, res, next) {
  try {
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const categories = await configModel.listConfigCategoriesWithValues({ includeInactiveValues });
    const categorySections = configModel.groupConfigCategories(categories);
    const [summary, rankingAdministration, processorTypes] = await Promise.all([
      configModel.getConfigSummary(),
      loadOperationalRankingAdministration(categories),
      configModel.listProcessorTypes({ includeInactive: includeInactiveValues })
    ]);

    res.render('pages/management-config', {
      pageTitle: 'Configuration',
      currentNav: 'admin-config-values',
      categories,
      categorySections,
      summary,
      rankingAdministration,
      processorTypes,
      includeInactiveValues
    });
  } catch (error) {
    next(error);
  }
}

async function refreshOperationalOptionRankings(req, res, next) {
  try {
    const result = await operationalOptionRankingModel.refreshOperationalOptionUsageRankings();
    let message = 'Operational list rankings were not refreshed.';
    let messageType = 'notice';

    if (!result.supported) {
      message = result.reason || 'Ranking storage is not ready.';
      messageType = 'error';
    } else if (!result.refreshed) {
      message = result.reason || 'Another ranking refresh is already running.';
    } else {
      message = `Rankings refreshed successfully. ${result.rankingRowCount} cached ranking row${result.rankingRowCount === 1 ? '' : 's'} calculated in ${result.durationMs} ms.`;
      messageType = 'success';
    }

    return renderOperationalRankingAdministration(res, {
      message,
      messageType,
      detailsOpen: true
    });
  } catch (error) {
    console.error('Manual operational option ranking refresh failed:', error);

    try {
      return renderOperationalRankingAdministration(res, {
        message: 'Refresh failed. The previous successful rankings remain active.',
        messageType: 'error',
        detailsOpen: true
      });
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function updateOperationalOptionRankingInterval(req, res, next) {
  const refreshMinutes = parseAllowedRefreshIntervalMinutes(req.body.refreshMinutes);

  if (!refreshMinutes) {
    try {
      return renderOperationalRankingAdministration(res, {
        message: 'Choose one of the available refresh intervals.',
        messageType: 'error',
        detailsOpen: true
      });
    } catch (renderError) {
      return next(renderError);
    }
  }

  try {
    await operationalOptionRankingModel.setConfiguredRefreshMinutes(refreshMinutes);

    return renderOperationalRankingAdministration(res, {
      message: `Refresh interval updated to ${formatRefreshIntervalLabel(refreshMinutes)}. The scheduler checks for due work every 15 minutes.`,
      messageType: 'success',
      detailsOpen: true
    });
  } catch (error) {
    if (error && Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      try {
        return renderOperationalRankingAdministration(res, {
          message: error.message || 'The refresh interval could not be updated.',
          messageType: 'error',
          detailsOpen: true
        });
      } catch (renderError) {
        return next(renderError);
      }
    }

    return next(error);
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

    const configCategoryId = parsePositiveInteger(formData.configCategoryId);
    const selectedCategory = categories.find((category) => Number(category.config_category_id) === configCategoryId) || null;
    const becomesDragOrdered = categoryUsesDragOrderingAfterSave(selectedCategory, formData);
    const sortOrder = selectedCategory?.dragOrderingManaged || becomesDragOrdered
      ? await configModel.getNextConfigValueSortOrder(configCategoryId)
      : parseSortOrder(formData.sortOrder);

    await configModel.createConfigValue({
      configCategoryId,
      label: formData.label,
      value: formData.value,
      description: formData.description,
      sortOrder,
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
      isPasswordLinkExpirySetting: isPasswordLinkExpirySetting(configValue),
      isSessionInactivityTimeoutSetting: isSessionInactivityTimeoutSetting(configValue)
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

    const protectedSecuritySetting = isRequiredSecuritySetting(configValue);
    const sessionInactivityTimeoutSetting = isSessionInactivityTimeoutSetting(configValue);

    if (protectedSecuritySetting) {
      formData.configCategoryId = String(configValue.config_category_id);
      formData.label = configValue.label || `Value #${configValue.config_value_id}`;
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
        isPasswordLinkExpirySetting: isPasswordLinkExpirySetting(configValue),
        isSessionInactivityTimeoutSetting: sessionInactivityTimeoutSetting
      });
    }

    const configCategoryId = parsePositiveInteger(formData.configCategoryId);
    const selectedCategory = categories.find((category) => Number(category.config_category_id) === configCategoryId) || null;
    let sortOrder = parseSortOrder(formData.sortOrder);
    const sameCategory = Number(configValue.config_category_id) === configCategoryId;
    const activatingValue = !configValue.isActive && formData.isActive === '1';
    const targetUsesDragOrdering = categoryUsesDragOrderingAfterSave(selectedCategory, formData, configValue);

    if (selectedCategory?.dragOrderingManaged || targetUsesDragOrdering) {
      sortOrder = sameCategory && !activatingValue
        ? Number(configValue.sort_order || 0)
        : await configModel.getNextConfigValueSortOrder(configCategoryId);
    }

    await configModel.updateConfigValue({
      configValueId,
      configCategoryId,
      label: formData.label,
      value: formData.value,
      description: formData.description,
      sortOrder,
      isActive: formData.isActive === '1'
    });

    if (sessionInactivityTimeoutSetting) {
      const timeoutMinutes = parseSessionInactivityTimeoutMinutes(formData.value);
      setCachedSessionInactivityTimeoutMinutes(timeoutMinutes);
      if (req.session?.cookie) {
        req.session.cookie.maxAge = timeoutMinutes * 60 * 1000;
      }
    }

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(getConfigReturnUrl(formData.includeInactive === '1', 'updated=1'))
    );
  } catch (error) {
    next(error);
  }
}

async function reorderConfigValues(req, res, next) {
  try {
    const configCategoryId = parsePositiveInteger(req.params.configCategoryId);
    const orderedConfigValueIds = parseOrderedConfigValueIds(req.body.orderedConfigValueIds);
    const includeInactiveValues = parseIncludeInactiveFlag(req.body.includeInactive);
    const category = configCategoryId ? await configModel.getConfigCategoryById(configCategoryId) : null;

    const result = await configModel.reorderConfigValues({
      configCategoryId,
      orderedConfigValueIds,
      includeInactiveValues
    });

    return res.json({
      ok: true,
      configCategoryId: result.configCategoryId,
      orderedConfigValueIds: result.orderedConfigValueIds,
      updatedCount: result.updatedCount
    });
  } catch (error) {
    if (error && Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        ok: false,
        code: error.code || 'CONFIG_ORDER_INVALID',
        error: error.message || 'The configuration order could not be saved.'
      });
    }

    return next(error);
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

    if (actionType === 'deactivate' && isRequiredSecuritySetting(configValue)) {
      return res.status(400).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue,
        includeInactiveValues,
        errorMessages: [isSessionInactivityTimeoutSetting(configValue)
          ? 'Session inactivity timeout is a required system security setting and cannot be deactivated. Edit its minute value instead.'
          : 'Password setup/reset link expiration is a required system security setting and cannot be deactivated. Edit its hour value instead.']
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

    if (!shouldActivate && isRequiredSecuritySetting(configValue)) {
      return res.status(400).render('fragments/config-value-status-modal', {
        actionType: 'error',
        configValue,
        includeInactiveValues,
        errorMessages: [isSessionInactivityTimeoutSetting(configValue)
          ? 'Session inactivity timeout is a required system security setting and cannot be deactivated. Edit its minute value instead.'
          : 'Password setup/reset link expiration is a required system security setting and cannot be deactivated. Edit its hour value instead.']
      });
    }

    if (!shouldActivate) {
      const requirementUsage = await configModel.listActiveLotRequirementsReferencingConfigValue(configValueId);
      if (requirementUsage.length > 0) {
        const lotNames = requirementUsage.map((usage) => usage.lotName).join(', ');
        return res.status(409).render('fragments/config-value-status-modal', {
          actionType: 'error',
          configValue,
          includeInactiveValues,
          errorMessages: [`This value is required by active Lot Requirement configuration in: ${lotNames}. Change those requirements before deactivating this option.`]
        });
      }
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

async function renderNewProcessorTypeModal(req, res, next) {
  try {
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    return res.render('fragments/processor-type-form-modal', {
      mode: 'create',
      processorType: null,
      formData: { name: '', code: '', isActive: true, includeInactive: includeInactiveValues ? '1' : '0' },
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createProcessorType(req, res, next) {
  try {
    const formData = getProcessorTypeFormData(req);
    const errorMessages = await validateProcessorTypeForm(formData);
    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/processor-type-form-modal', {
        mode: 'create',
        processorType: null,
        formData,
        errorMessages
      });
    }

    await configModel.createProcessorType({
      code: formData.code,
      name: formData.name,
      isActive: formData.isActive
    });
    return sendHtmxRedirect(req, res, addCacheBuster(getConfigReturnUrl(formData.includeInactive === '1', 'processorTypeCreated=1')));
  } catch (error) {
    next(error);
  }
}

async function renderEditProcessorTypeModal(req, res, next) {
  try {
    const processorBrandId = parsePositiveInteger(req.params.processorBrandId);
    const processorType = processorBrandId ? await configModel.getProcessorTypeById(processorBrandId) : null;
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    if (!processorType) {
      return res.status(404).render('fragments/processor-type-status-modal', {
        actionType: 'error', processorType: null, includeInactiveValues, errorMessages: ['The selected Processor Type could not be found.']
      });
    }

    return res.render('fragments/processor-type-form-modal', {
      mode: 'edit',
      processorType,
      formData: { ...processorType, includeInactive: includeInactiveValues ? '1' : '0' },
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateProcessorType(req, res, next) {
  try {
    const processorBrandId = parsePositiveInteger(req.params.processorBrandId);
    const processorType = processorBrandId ? await configModel.getProcessorTypeById(processorBrandId) : null;
    if (!processorType) {
      return sendHtmxRedirect(req, res, getConfigReturnUrl(parseIncludeInactiveFlag(req.body.includeInactive), 'error=processor_type_not_found'));
    }

    const formData = getProcessorTypeFormData(req, processorType);
    const errorMessages = await validateProcessorTypeForm(formData, processorBrandId);
    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/processor-type-form-modal', { mode: 'edit', processorType, formData, errorMessages });
    }

    await configModel.updateProcessorType({ processorBrandId, code: formData.code, name: formData.name, isActive: formData.isActive });
    return sendHtmxRedirect(req, res, addCacheBuster(getConfigReturnUrl(formData.includeInactive === '1', 'processorTypeUpdated=1')));
  } catch (error) {
    next(error);
  }
}

async function renderProcessorTypeStatusModal(req, res, next) {
  try {
    const processorBrandId = parsePositiveInteger(req.params.processorBrandId);
    const actionType = String(req.params.actionType || '').toLowerCase();
    const includeInactiveValues = parseIncludeInactiveFlag(req.query.includeInactive);
    const processorType = processorBrandId ? await configModel.getProcessorTypeById(processorBrandId) : null;
    if (!processorType || !['activate', 'deactivate', 'delete'].includes(actionType)) {
      return res.status(404).render('fragments/processor-type-status-modal', {
        actionType: 'error', processorType: null, includeInactiveValues, errorMessages: ['The selected Processor Type action could not be loaded.']
      });
    }
    return res.render('fragments/processor-type-status-modal', { actionType, processorType, includeInactiveValues, errorMessages: [] });
  } catch (error) {
    next(error);
  }
}

async function updateProcessorTypeStatus(req, res, next) {
  try {
    const processorBrandId = parsePositiveInteger(req.params.processorBrandId);
    const actionType = String(req.params.actionType || '').toLowerCase();
    const includeInactiveValues = parseIncludeInactiveFlag(req.body.includeInactive);
    const processorType = processorBrandId ? await configModel.getProcessorTypeById(processorBrandId) : null;
    if (!processorType || !['activate', 'deactivate', 'delete'].includes(actionType)) {
      return sendHtmxRedirect(req, res, getConfigReturnUrl(includeInactiveValues, 'error=processor_type_not_found'));
    }

    if (actionType === 'delete') {
      const result = await configModel.deleteProcessorTypeIfUnused(processorBrandId);
      if (!result.deleted) {
        const currentType = await configModel.getProcessorTypeById(processorBrandId);
        return res.status(409).render('fragments/processor-type-status-modal', {
          actionType: 'delete',
          processorType: currentType || processorType,
          includeInactiveValues,
          errorMessages: result.inUse
            ? ['This Processor Type is still referenced by Processors or Processor Families. Reassign those records first, or deactivate it to remove it from normal selection without damaging history.']
            : ['The Processor Type could not be deleted.']
        });
      }
      return sendHtmxRedirect(req, res, addCacheBuster(getConfigReturnUrl(includeInactiveValues, 'processorTypeDeleted=1')));
    }

    const shouldActivate = actionType === 'activate';
    await configModel.setProcessorTypeActive(processorBrandId, shouldActivate);
    return sendHtmxRedirect(req, res, addCacheBuster(getConfigReturnUrl(shouldActivate ? includeInactiveValues : true, shouldActivate ? 'processorTypeActivated=1' : 'processorTypeDeactivated=1')));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderConfigPage,
  refreshOperationalOptionRankings,
  updateOperationalOptionRankingInterval,
  renderNewConfigValueModal,
  createConfigValue,
  renderEditConfigValueModal,
  updateConfigValue,
  reorderConfigValues,
  renderConfigValueStatusModal,
  updateConfigValueStatus,
  renderNewProcessorTypeModal,
  createProcessorType,
  renderEditProcessorTypeModal,
  updateProcessorType,
  renderProcessorTypeStatusModal,
  updateProcessorTypeStatus
};
