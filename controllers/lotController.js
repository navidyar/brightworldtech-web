const lotModel = require('../models/lotModel');
const lotValidationModel = require('../models/lotValidationModel');
const lotEnforcementModel = require('../models/lotEnforcementModel');
const lotValidationOverrideModel = require('../models/lotValidationOverrideModel');
const requirementOptionModel = require('../models/requirementOptionModel');
const lotUnitFormProfileModel = require('../models/lotUnitFormProfileModel');
const {
  REQUIREMENT,
  UNIT_FORM_SECTIONS,
  VISIBILITY,
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');
const {
  LotUnitFormRuleEditorError,
  normalizeSubmittedLotFormRules,
  rulesToSelectionMaps
} = require('../services/lotUnitFormRuleEditor');
const { buildNewLotCreatedRedirect } = require('../services/lotCreationPolicy');
const {
  findSelectedRequirementPolicy,
  getDefaultRequirementPolicyId
} = require('../config/lotRequirementPolicyRegistry');

const {
  getLotRequirementField,
  getLotRequirementOperator,
  isOperatorAllowedForField,
  listLotRequirementFields,
  listLotRequirementOperators,
  normalizeOperatorCode,
  normalizeRequirementKey
} = require('../config/lotRequirementRegistry');
const { analyzeRequirementNumber } = require('../services/lotRequirementNumberPolicy');
const unitExportService = require('../services/unitExportService');
const { buildSelectedLotExportScope } = require('../services/lotExportScope');
const unitExportFileService = require('../services/unitExportFileService');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { MIN_LOT_PRODUCTION_WEIGHT, parseRequiredLotProductionWeight } = require('../services/lotProductionWeightPolicy');

const requirementFieldOptions = listLotRequirementFields().map((field) => ({
  value: field.key,
  label: field.label,
  helpText: field.helpText
}));

const operatorOptions = listLotRequirementOperators().map((operator) => ({
  value: operator.key,
  label: operator.label
}));

function getRequirementKeys() {
  return requirementFieldOptions.map((option) => option.value);
}

async function getRequirementValueOptionsByKey() {
  return requirementOptionModel.getRequirementValueOptionsByKey(getRequirementKeys());
}

function getBlankLotFormData(formOptions = {}) {
  return {
    lotName: '',
    parentLotId: '',
    lotTypeConfigValueId: '',
    requirementPolicyConfigValueId: String(getDefaultRequirementPolicyId(formOptions.requirementPolicies) || ''),
    defaultGradeConfigValueId: '',
    defaultProductionWeightConfigValueId: '',
    defaultProductionWeight: '',
    hasUnlimitedGoal: '0',
    unitAmountGoal: '',
    deadline: '',
    labelFormat: '',
    objectives: '',
    notes: '',
    allowDuplicateUnitAssumption: '0',
    startNewProductionCycleOnMove: '0',
    isAssignable: '1'
  };
}

function getLotFormDataFromRequest(req) {
  return {
    lotName: String(req.body.lotName || '').trim(),
    parentLotId: String(req.body.parentLotId || '').trim(),
    lotTypeConfigValueId: String(req.body.lotTypeConfigValueId || '').trim(),
    requirementPolicyConfigValueId: String(req.body.requirementPolicyConfigValueId || '').trim(),
    defaultGradeConfigValueId: String(req.body.defaultGradeConfigValueId || '').trim(),
    defaultProductionWeightConfigValueId: String(req.body.defaultProductionWeightConfigValueId || '').trim(),
    defaultProductionWeight: String(req.body.defaultProductionWeight || '').trim(),
    hasUnlimitedGoal: req.body.hasUnlimitedGoal === '1' ? '1' : '0',
    allowDuplicateUnitAssumption: req.body.allowDuplicateUnitAssumption === '1' ? '1' : '0',
    startNewProductionCycleOnMove: req.body.startNewProductionCycleOnMove === '1' ? '1' : '0',
    isAssignable: req.body.isAssignable === '1' ? '1' : '0',
    unitAmountGoal: String(req.body.unitAmountGoal || '').trim(),
    deadline: String(req.body.deadline || '').trim(),
    labelFormat: String(req.body.labelFormat || '').trim(),
    objectives: String(req.body.objectives || '').trim(),
    notes: String(req.body.notes || '').trim()
  };
}

function pickFirstBodyValue(value) {
  if (Array.isArray(value)) {
    const firstNonEmptyValue = value.find((item) => String(item || '').trim());

    return String(firstNonEmptyValue || '').trim();
  }

  return String(value || '').trim();
}

function getBlankRequirementFormData() {
  return {
    requirementKey: '',
    operatorCode: 'equals',
    requiredValue: '',
    notes: ''
  };
}

function getRequirementFormDataFromRequest(req) {
  return {
    requirementKey: normalizeRequirementKey(req.body.requirementKey),
    operatorCode: normalizeOperatorCode(req.body.operatorCode),
    requiredValue: pickFirstBodyValue(req.body.requiredValue),
    notes: String(req.body.notes || '').trim()
  };
}

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function sendHtmxRedirect(req, res, redirectUrl) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', redirectUrl);
    return res.send('');
  }

  return res.redirect(redirectUrl);
}

function setNoStoreHeaders(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

function addCacheBuster(redirectUrl) {
  const separator = redirectUrl.includes('?') ? '&' : '?';
  return `${redirectUrl}${separator}refresh=${Date.now()}`;
}

function formatDateForInput(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function getLotFormDataFromLot(lot) {
  return {
    lotName: lot.lot_name || '',
    parentLotId: lot.parent_lot_id || '',
    lotTypeConfigValueId: lot.lot_type_config_value_id || '',
    requirementPolicyConfigValueId: lot.requirement_policy_config_value_id || '',
    defaultGradeConfigValueId: lot.default_grade_config_value_id || '',
    defaultProductionWeightConfigValueId: lot.default_production_weight_config_value_id || '',
    defaultProductionWeight: lot.default_production_weight !== null && lot.default_production_weight !== undefined ? String(lot.default_production_weight) : '',
    hasUnlimitedGoal: lot.isUnlimited ? '1' : '0',
    allowDuplicateUnitAssumption: Number(lot.allow_duplicate_unit_assumption || 0) === 1 ? '1' : '0',
    startNewProductionCycleOnMove: Number(lot.start_new_production_cycle_on_move || 0) === 1 ? '1' : '0',
    isAssignable: Number(lot.is_assignable || 0) === 1 ? '1' : '0',
    unitAmountGoal: lot.isUnlimited ? '' : String(lot.unitGoal || lot.unit_amount_goal || ''),
    deadline: formatDateForInput(lot.deadline),
    labelFormat: lot.label_format || '',
    objectives: lot.objectives || '',
    notes: lot.notes || ''
  };
}

function getRequirementFormDataFromRequirement(requirement) {
  return {
    requirementKey: normalizeRequirementKey(requirement.requirement_key),
    operatorCode: normalizeOperatorCode(requirement.operator_code),
    requiredValue: requirement.required_value_token || requirement.required_value || '',
    notes: requirement.notes || ''
  };
}

function renderLotModal(res, { mode, formOptions, formData, lot = null, errorMessages = [] }) {
  return res.render('fragments/lot-form-modal', {
    mode,
    lot,
    formOptions,
    formData,
    errorMessages
  });
}

function renderRequirementModal(res, {
  mode,
  lot,
  requirement = null,
  requirementValueOptionsByKey,
  formData,
  errorMessages = []
}) {
  return res.render('fragments/lot-requirement-form-modal', {
    mode,
    lot,
    requirement,
    requirementValueOptionsByKey,
    requirementFieldOptions,
    operatorOptions,
    formData,
    errorMessages
  });
}

function validateLotForm(formData, formOptions, currentLotId = null) {
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

  if (currentLotId && formData.parentLotId && Number(formData.parentLotId) === Number(currentLotId)) {
    errors.push('A lot cannot be its own parent lot.');
  }

  if (formData.parentLotId && Number.isInteger(Number(formData.parentLotId))) {
    const selectedParentIsAllowed = (formOptions.parentLots || []).some(
      (parentLot) => Number(parentLot.lot_id) === Number(formData.parentLotId)
    );

    if (!selectedParentIsAllowed) {
      errors.push('That Parent Lot cannot be selected because it is this Lot, one of its descendants, or is otherwise unavailable.');
    }
  }

  if (formData.lotTypeConfigValueId && !Number.isInteger(Number(formData.lotTypeConfigValueId))) {
    errors.push('Lot type must be valid.');
  }

  if (formOptions.capabilities.hasRequirementPolicy) {
    if (!formData.requirementPolicyConfigValueId) {
      errors.push('Requirement enforcement policy is required.');
    } else if (!findSelectedRequirementPolicy(
      formOptions.requirementPolicies,
      formData.requirementPolicyConfigValueId
    )) {
      errors.push('Requirement enforcement policy must be Strict, Warn Only, or Open / Mixed.');
    }
  }

  if (formData.defaultGradeConfigValueId && !Number.isInteger(Number(formData.defaultGradeConfigValueId))) {
    errors.push('Default grade must be valid.');
  }

  if (formData.defaultProductionWeightConfigValueId && !Number.isInteger(Number(formData.defaultProductionWeightConfigValueId))) {
    errors.push('Default production weight must be valid.');
  }

  if (formOptions.capabilities.hasDefaultProductionWeight) {
    const defaultProductionWeight = parseRequiredLotProductionWeight(formData.defaultProductionWeight);

    if (defaultProductionWeight === null) {
      errors.push(`Lot production weight is required and must be at least ${MIN_LOT_PRODUCTION_WEIGHT.toFixed(2)}.`);
    }
  } else if (formOptions.capabilities.hasDefaultProductionWeightConfigValueId && !formData.defaultProductionWeightConfigValueId) {
    errors.push('Default production weight is required.');
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

function validateRequirementForm(formData, requirementValueOptionsByKey = {}) {
  const errors = [];
  const fieldDefinition = getLotRequirementField(formData.requirementKey);
  const operatorDefinition = getLotRequirementOperator(formData.operatorCode);

  if (!fieldDefinition) {
    errors.push('Requirement field is required.');
  }

  if (!operatorDefinition || !isOperatorAllowedForField(formData.requirementKey, formData.operatorCode)) {
    errors.push('The selected rule is not valid for this requirement field.');
  }

  if (!formData.requiredValue) {
    errors.push('Required value is required.');
  } else if (fieldDefinition?.storageKind === 'number') {
    const analysis = analyzeRequirementNumber(fieldDefinition, formData.requiredValue);

    if (!analysis.valid) {
      errors.push(analysis.message);
    }
  } else if (fieldDefinition?.storageKind === 'text') {
    const maximumLength = Number(fieldDefinition.maximumLength || 120);

    if (formData.requiredValue.length > maximumLength) {
      errors.push(`${fieldDefinition.label} must be ${maximumLength} characters or fewer.`);
    }
  } else {
    const optionSet = requirementValueOptionsByKey[fieldDefinition?.key];
    const validOptionValues = new Set(
      Array.isArray(optionSet?.options)
        ? optionSet.options.map((option) => String(option.value))
        : []
    );

    if (!validOptionValues.has(String(formData.requiredValue))) {
      errors.push(`Select a valid ${fieldDefinition?.label || 'requirement'} value.`);
    }
  }

  if (formData.requiredValue.length > 120) {
    errors.push('Required value must be 120 characters or fewer.');
  }

  if (formData.notes.length > 500) {
    errors.push('Requirement notes must be 500 characters or fewer.');
  }

  return errors;
}

function sortLotsByName(a, b) {
  return String(a.lot_name || '').localeCompare(String(b.lot_name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function buildLotRelationshipData(lot, lots) {
  const lotsById = new Map();

  lots.forEach((listedLot) => {
    lotsById.set(String(listedLot.lot_id), listedLot);
  });

  lotsById.set(String(lot.lot_id), lot);

  const parentLot = lot.parent_lot_id
    ? lotsById.get(String(lot.parent_lot_id)) || null
    : null;

  const directChildLots = lots
    .filter((listedLot) => String(listedLot.parent_lot_id || '') === String(lot.lot_id))
    .sort(sortLotsByName);

  const breadcrumbs = [];
  const visitedLotIds = new Set();
  let currentLot = lot;
  let guardCount = 0;

  while (currentLot && guardCount < 25) {
    const currentLotId = String(currentLot.lot_id);

    if (visitedLotIds.has(currentLotId)) {
      break;
    }

    visitedLotIds.add(currentLotId);
    breadcrumbs.unshift(currentLot);

    currentLot = currentLot.parent_lot_id
      ? lotsById.get(String(currentLot.parent_lot_id)) || null
      : null;

    guardCount += 1;
  }

  const siblingLots = parentLot
    ? lots
        .filter((listedLot) => (
          String(listedLot.parent_lot_id || '') === String(parentLot.lot_id) &&
          String(listedLot.lot_id) !== String(lot.lot_id)
        ))
        .sort(sortLotsByName)
    : [];

  return {
    parentLot,
    directChildLots,
    siblingLots,
    breadcrumbs
  };
}

function getRequirementDisplayLabel(requirementKey) {
  const option = requirementFieldOptions.find((fieldOption) => fieldOption.value === requirementKey);

  return option ? option.label : requirementKey;
}

function getOperatorDisplayLabel(operatorCode) {
  const option = operatorOptions.find((operatorOption) => operatorOption.value === operatorCode);

  return option ? option.label : operatorCode;
}

function buildRequirementValidationSummary(requirements, validationReport) {
  const activeRequirements = requirements.filter((requirement) => Number(requirement.is_active) === 1);

  return activeRequirements.map((requirement) => {
    const requirementId = Number(requirement.lot_requirement_id || 0);
    const requirementKey = String(requirement.requirement_key || '').trim();
    const operatorCode = String(requirement.operator_code || 'equals').trim();
    const requiredValue = String(requirement.required_value || '').trim();

    const matchingChecks = validationReport.units.flatMap((unit) => {
      return unit.checks
        .filter((check) => (
          requirementId > 0
            ? (
                Number(check.requirementId || 0) === requirementId ||
                (Array.isArray(check.requirementIds) && check.requirementIds.includes(requirementId))
              )
            : (
                String(check.requirementKey || '') === requirementKey &&
                String(check.operatorCode || 'equals') === operatorCode &&
                String(check.requiredValue || '') === requiredValue
              )
        ))
        .map((check) => ({
          ...check,
          unitLabel: unit.label,
          unitStatus: unit.status
        }));
    });

    return {
      requirementId,
      requirementKey,
      requirementLabel: requirement.requirement_label || getRequirementDisplayLabel(requirementKey),
      operatorCode,
      operatorLabel: requirement.operator_label || getOperatorDisplayLabel(operatorCode),
      requiredValue,
      notes: requirement.notes || '',
      totalCount: matchingChecks.length,
      acceptedCount: matchingChecks.filter((check) => check.status === 'accepted').length,
      rejectedCount: matchingChecks.filter((check) => check.status === 'rejected').length,
      needsReviewCount: matchingChecks.filter((check) => check.status === 'needs_review').length
    };
  });
}

async function getLotDetailViewData(lotId) {
  const lot = await lotModel.getLotById(lotId);

  if (!lot) {
    return null;
  }

  const lots = await lotModel.listLots({ includeHidden: true });
  const [requirements, requirementInheritanceSuppressions] = await Promise.all([
    lotModel.listEffectiveLotRequirements(lotId),
    lotModel.listLotRequirementInheritanceSuppressions(lotId)
  ]);
  const validationReport = await lotValidationModel.buildLotValidationReport(lotId);
  const enforcementSummary = lotEnforcementModel.buildLotEnforcementSummary(validationReport);
  const requirementValueOptionsByKey = await getRequirementValueOptionsByKey();
  const lotRelationships = buildLotRelationshipData(lot, lots);
  const requirementValidationSummary = buildRequirementValidationSummary(requirements, validationReport);
  const directRequirementKeys = new Set(
    requirements
      .filter((requirement) => Number(requirement.is_inherited) !== 1)
      .map((requirement) => normalizeRequirementKey(requirement.requirement_key))
  );
  const visibleRequirementInheritanceSuppressions = requirementInheritanceSuppressions.filter((suppression) => (
    !directRequirementKeys.has(normalizeRequirementKey(suppression.requirement_key))
  ));

  return {
    lot,
    requirements,
    requirementInheritanceSuppressions: visibleRequirementInheritanceSuppressions,
    validationReport,
    enforcementSummary,
    requirementValueOptionsByKey,
    lotRelationships,
    requirementValidationSummary
  };
}


function getUnitFormRuleSourceLabel(source, selectedLotId) {
  if (!source || source.type === 'application_default') {
    return 'Application default';
  }

  if (source.type === 'lot_override' && Number(source.lotId) === Number(selectedLotId)) {
    return 'This lot';
  }

  if (source.type === 'lot_override') {
    return `Inherited from ${source.lotName || `Lot ${source.lotId}`}`;
  }

  return 'Resolved profile';
}

function buildLotUnitFormRuleSections(profile, selectionMaps) {
  const configurableFields = listLotConfigurableUnitFormFields();
  const labelsByKey = new Map(
    configurableFields.map((field) => [field.key, field.label])
  );

  return UNIT_FORM_SECTIONS.map((section) => {
    const fields = configurableFields
      .filter((field) => field.section === section.key)
      .map((field) => {
        const resolvedField = profile.fieldsByKey.get(field.key);
        const visibilityMode = String(
          selectionMaps.visibilityModes[field.key] ?? VISIBILITY.INHERIT
        );
        const requirementMode = String(
          selectionMaps.requirementModes[field.key] ?? REQUIREMENT.INHERIT
        );
        const dependencyKeys = [
          ...new Set([
            ...(resolvedField?.forcedVisibleBy || []),
            ...(resolvedField?.forcedRequiredBy || [])
          ])
        ];

        return {
          ...field,
          visibilityMode,
          requirementMode,
          hasDirectOverride: (
            visibilityMode !== VISIBILITY.INHERIT
            || requirementMode !== REQUIREMENT.INHERIT
          ),
          effectiveVisible: Boolean(resolvedField?.visible),
          effectiveRequired: Boolean(resolvedField?.required),
          requiredSuppressedByHidden: Boolean(resolvedField?.requiredSuppressedByHidden),
          visibilitySourceLabel: getUnitFormRuleSourceLabel(
            resolvedField?.visibilitySource,
            profile.selectedLot.lotId
          ),
          requirementSourceLabel: getUnitFormRuleSourceLabel(
            resolvedField?.requirementSource,
            profile.selectedLot.lotId
          ),
          dependencyLabels: dependencyKeys.map((fieldKey) => (
            labelsByKey.get(fieldKey)
            || getUnitFormFieldDefinition(fieldKey)?.label
            || fieldKey
          )),
          lotRequirementVisibilityLabels: (resolvedField?.lotRequirementVisibilitySources || [])
            .map((source) => source.label),
          lotRequirementRequirementLabels: (resolvedField?.lotRequirementRequirementSources || [])
            .map((source) => source.label)
        };
      });

    return fields.length > 0
      ? { ...section, fields }
      : null;
  }).filter(Boolean);
}

async function getLotUnitFormRuleViewData(lotId, submittedSelectionMaps = null) {
  const lot = await lotModel.getLotById(lotId);

  if (!lot) {
    return null;
  }

  const [profile, directRules] = await Promise.all([
    lotUnitFormProfileModel.getRequirementAwareUnitFormProfileForLot(lotId),
    lotUnitFormProfileModel.listRulesForLot(lotId)
  ]);
  const selectionMaps = submittedSelectionMaps || rulesToSelectionMaps(directRules);

  const sections = buildLotUnitFormRuleSections(profile, selectionMaps);
  const configurableResolvedFields = profile.fields.filter((field) => field.enabledForLotRules);

  return {
    lot,
    profile,
    directRules,
    selectionMaps,
    sections,
    directRuleCount: sections.reduce((count, section) => (
      count + section.fields.filter((field) => field.hasDirectOverride).length
    ), 0),
    configurableSummary: {
      totalFields: configurableResolvedFields.length,
      visibleFields: configurableResolvedFields.filter((field) => field.visible).length,
      requiredFields: configurableResolvedFields.filter((field) => field.required).length,
      hiddenFields: configurableResolvedFields.filter((field) => !field.visible).length
    },
    visibilityModes: Object.values(VISIBILITY),
    requirementModes: Object.values(REQUIREMENT)
  };
}

function renderLotUnitFormRulesModal(res, viewData, errorMessages = [], statusCode = 200) {
  return res.status(statusCode).render('fragments/lot-unit-form-rules-modal', {
    ...viewData,
    errorMessages
  });
}

async function renderLotUnitFormRulesModalPage(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return renderLotUnitFormRulesModal(res, {
        lot: null,
        profile: null,
        directRules: [],
        selectionMaps: { visibilityModes: {}, requirementModes: {} },
        sections: [],
        directRuleCount: 0,
        configurableSummary: { totalFields: 0, visibleFields: 0, requiredFields: 0, hiddenFields: 0 },
        visibilityModes: Object.values(VISIBILITY),
        requirementModes: Object.values(REQUIREMENT)
      }, ['The selected lot could not be found.'], 404);
    }

    const viewData = await getLotUnitFormRuleViewData(lotId);

    if (!viewData) {
      return renderLotUnitFormRulesModal(res, {
        lot: null,
        profile: null,
        directRules: [],
        selectionMaps: { visibilityModes: {}, requirementModes: {} },
        sections: [],
        directRuleCount: 0,
        configurableSummary: { totalFields: 0, visibleFields: 0, requiredFields: 0, hiddenFields: 0 },
        visibilityModes: Object.values(VISIBILITY),
        requirementModes: Object.values(REQUIREMENT)
      }, ['The selected lot could not be found.'], 404);
    }

    return renderLotUnitFormRulesModal(res, viewData);
  } catch (error) {
    next(error);
  }
}

async function updateLotUnitFormRules(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return renderLotUnitFormRulesModal(res, {
        lot: null,
        profile: null,
        directRules: [],
        selectionMaps: { visibilityModes: {}, requirementModes: {} },
        sections: [],
        directRuleCount: 0,
        configurableSummary: { totalFields: 0, visibleFields: 0, requiredFields: 0, hiddenFields: 0 },
        visibilityModes: Object.values(VISIBILITY),
        requirementModes: Object.values(REQUIREMENT)
      }, ['The selected lot could not be found.'], 404);
    }

    const submittedSelectionMaps = {
      visibilityModes: req.body.visibilityModes || {},
      requirementModes: req.body.requirementModes || {}
    };
    let rules;

    try {
      rules = normalizeSubmittedLotFormRules(submittedSelectionMaps);
    } catch (error) {
      if (!(error instanceof LotUnitFormRuleEditorError)) {
        throw error;
      }

      const viewData = await getLotUnitFormRuleViewData(lotId, submittedSelectionMaps);

      if (!viewData) {
        return renderLotUnitFormRulesModal(res, {
          lot: null,
          profile: null,
          directRules: [],
          selectionMaps: submittedSelectionMaps,
          sections: [],
          directRuleCount: 0,
          configurableSummary: { totalFields: 0, visibleFields: 0, requiredFields: 0, hiddenFields: 0 },
          visibilityModes: Object.values(VISIBILITY),
          requirementModes: Object.values(REQUIREMENT)
        }, ['The selected lot could not be found.'], 404);
      }

      return renderLotUnitFormRulesModal(res, viewData, error.messages);
    }

    await lotUnitFormProfileModel.replaceRulesForLot(
      lotId,
      rules,
      req.currentUser.user_id
    );

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(`/management/lots/${lotId}?unitFormRulesUpdated=1`)
    );
  } catch (error) {
    next(error);
  }
}

function getLotDetailSuccessMessage(query) {
  if (query.duplicated === '1') return 'Lot duplicated successfully. The new Lot remains hidden until you manually unhide it.';
  if (query.requirementCreated === '1') return 'Requirement added successfully.';
  if (query.updated === '1') return 'Lot updated successfully.';
  if (query.requirementUpdated === '1') return 'Requirement updated successfully.';
  if (query.requirementDeleted === '1') return 'Requirement deleted successfully.';
  if (query.closed === '1') return 'Lot closed successfully.';
  if (query.reopened === '1') return 'Lot reopened successfully.';
  if (query.unitFormRulesUpdated === '1') return 'Unit form configuration updated successfully.';
  if (query.validationOverrideAccepted === '1') return 'Unit accepted by Management for this Lot.';
  if (query.validationOverrideRevoked === '1') return 'Management acceptance revoked.';
  return null;
}

function getLotSuccessMessage(query) {
  if (query.created === '1') {
    return 'Lot created successfully. It remains hidden until you manually unhide it.';
  }

  if (query.updated === '1') {
    return 'Lot updated successfully.';
  }

  if (query.deleted === '1') {
    return 'Lot deleted successfully.';
  }

  if (query.hidden === '1') {
    return 'Lot hidden successfully.';
  }

  if (query.unhidden === '1') {
    return 'Lot unhidden successfully.';
  }

  if (query.closed === '1') {
    return 'Lot closed successfully.';
  }

  if (query.reopened === '1') {
    return 'Lot reopened successfully.';
  }

  return null;
}

function shouldShowHiddenLots(req) {
  return req.query.showHidden === '1' || req.query.showHidden === 'true';
}

async function renderLotsPage(req, res, next) {
  try {
    const showHidden = shouldShowHiddenLots(req);
    const lots = await lotModel.listLots({ includeHidden: showHidden });
    const summary = await lotModel.getLotSummary();

    setNoStoreHeaders(res);

    res.render('pages/management-lots', {
      pageTitle: 'Lots',
      currentNav: 'management-lots',
      lots,
      summary,
      showHidden,
      successMessage: getLotSuccessMessage(req.query)
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
      formData: getBlankLotFormData(formOptions),
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
      if (isHtmxRequest(req)) {
        return res.status(400).render('fragments/lot-form-modal', {
          mode: 'create',
          lot: null,
          formOptions,
          formData,
          errorMessages
        });
      }

      return res.status(400).render('pages/management-lot-new', {
        pageTitle: 'Create Lot',
        currentNav: 'management-lots',
        formOptions,
        formData,
        errorMessages
      });
    }

    const createdLot = await lotModel.createLot(formData, req.currentUser.user_id);

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(buildNewLotCreatedRedirect(createdLot.lotId))
    );
  } catch (error) {
    next(error);
  }
}



function getLotDuplicationFormDataFromRequest(req) {
  const placementMode = String(req?.body?.placementMode || '').trim() === 'child' ? 'child' : 'top_level';
  const requestedInheritanceMode = String(req?.body?.inheritanceMode || '').trim();

  return {
    newLotName: String(req?.body?.newLotName || '').trim(),
    placementMode,
    parentLotId: placementMode === 'child' ? String(req?.body?.parentLotId || '').trim() : '',
    inheritanceMode: placementMode === 'child' && requestedInheritanceMode === 'new_parent'
      ? 'new_parent'
      : 'preserve_source'
  };
}

function getBlankLotDuplicationFormData(sourceLot) {
  return {
    newLotName: `${String(sourceLot?.lot_name || '').trim()} Copy`.trim(),
    placementMode: 'top_level',
    parentLotId: '',
    inheritanceMode: 'preserve_source'
  };
}

function validateLotDuplicationForm(formData, formOptions) {
  const errors = [];

  if (!formData.newLotName || formData.newLotName.length < 2) {
    errors.push('New Lot name is required.');
  } else if (formData.newLotName.length > 120) {
    errors.push('New Lot name must be 120 characters or fewer.');
  }

  if (formData.placementMode === 'child') {
    const parentLotId = Number(formData.parentLotId);
    const parentAllowed = Number.isSafeInteger(parentLotId) && parentLotId > 0
      && (formOptions.parentLots || []).some((lot) => Number(lot.lot_id) === parentLotId);

    if (!parentAllowed) {
      errors.push('Choose an open, visible Parent Lot for the duplicate.');
    }
  }

  return errors;
}

function renderLotDuplicateModal(res, { preview, formOptions, formData, errorMessages = [], statusCode = 200 }) {
  return res.status(statusCode).render('fragments/lot-duplicate-modal', {
    preview,
    formOptions,
    formData,
    errorMessages
  });
}

async function renderLotDuplicateModalPage(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const [preview, formOptions] = await Promise.all([
      lotModel.getLotDuplicationPreview(lotId),
      lotModel.getLotFormOptions()
    ]);

    if (!preview) {
      return renderLotDuplicateModal(res, {
        preview: null,
        formOptions,
        formData: getBlankLotDuplicationFormData(null),
        errorMessages: ['The source Lot could not be found.'],
        statusCode: 404
      });
    }

    if (!formOptions.capabilities.hasAssignableState) {
      return renderLotDuplicateModal(res, {
        preview,
        formOptions,
        formData: getBlankLotDuplicationFormData(preview.sourceLot),
        errorMessages: ['Lot duplication requires the Lot assignability migration before it can be used.'],
        statusCode: 409
      });
    }

    return renderLotDuplicateModal(res, {
      preview,
      formOptions,
      formData: getBlankLotDuplicationFormData(preview.sourceLot)
    });
  } catch (error) {
    next(error);
  }
}

async function duplicateLot(req, res, next) {
  const lotId = Number(req.params.lotId);

  try {
    const [preview, formOptions] = await Promise.all([
      lotModel.getLotDuplicationPreview(lotId),
      lotModel.getLotFormOptions()
    ]);
    const formData = getLotDuplicationFormDataFromRequest(req);

    if (!preview) {
      return renderLotDuplicateModal(res, {
        preview: null,
        formOptions,
        formData,
        errorMessages: ['The source Lot could not be found.'],
        statusCode: 404
      });
    }

    const errorMessages = validateLotDuplicationForm(formData, formOptions);

    if (errorMessages.length > 0) {
      return renderLotDuplicateModal(res, {
        preview,
        formOptions,
        formData,
        errorMessages,
        statusCode: 400
      });
    }

    const result = await lotModel.duplicateLot(lotId, {
      newLotName: formData.newLotName,
      parentLotId: formData.placementMode === 'child' ? formData.parentLotId : null,
      inheritanceMode: formData.inheritanceMode
    }, req.currentUser.user_id);

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(`/management/lots/${result.lotId}?duplicated=1`)
    );
  } catch (error) {
    try {
      const [preview, formOptions] = await Promise.all([
        lotModel.getLotDuplicationPreview(lotId),
        lotModel.getLotFormOptions()
      ]);

      return renderLotDuplicateModal(res, {
        preview,
        formOptions,
        formData: getLotDuplicationFormDataFromRequest(req),
        errorMessages: [error.message || 'The Lot could not be duplicated.'],
        statusCode: 400
      });
    } catch (renderError) {
      return next(renderError);
    }
  }
}


function getLotExportColumnSelection(req) {
  const query = req && req.query ? req.query : {};

  return {
    value: query.columns,
    selectionProvided: Object.prototype.hasOwnProperty.call(query, 'columns')
  };
}

function normalizeLotExportSelectionIds(value) {
  const values = Array.isArray(value) ? value : [value];
  const selectedLotIds = [];
  const seen = new Set();

  values.forEach((entry) => {
    String(entry ?? '')
      .split(',')
      .map((lotId) => Number(lotId))
      .filter((lotId) => Number.isSafeInteger(lotId) && lotId > 0)
      .forEach((lotId) => {
        if (!seen.has(lotId)) {
          seen.add(lotId);
          selectedLotIds.push(lotId);
        }
      });
  });

  return selectedLotIds;
}

function getLotExportSelection(req, rootScope) {
  const query = req && req.query ? req.query : {};
  const rootLotId = Number(rootScope?.selectedLot?.lot_id);
  const directChildLots = (rootScope?.descendantLots || [])
    .filter((lot) => Number(lot.parent_lot_id) === rootLotId)
    .sort(sortLotsByName);
  const hasSelectedLotIds = Object.prototype.hasOwnProperty.call(query, 'lotIds');

  if (hasSelectedLotIds) {
    return {
      selectedLotIds: normalizeLotExportSelectionIds(query.lotIds)
    };
  }

  // Keep older direct/descendant/branch URLs working while the UI moves to
  // composable Lot checkboxes.
  const requestedScope = String(query.scope || '').trim();

  if (requestedScope === 'descendants') {
    return {
      selectedLotIds: [rootLotId, ...directChildLots.map((lot) => Number(lot.lot_id))]
    };
  }

  if (requestedScope === 'branch') {
    const branchLotId = Number(query.branchLotId);
    return {
      selectedLotIds: Number.isSafeInteger(branchLotId) && branchLotId > 0 ? [branchLotId] : [rootLotId]
    };
  }

  return { selectedLotIds: [rootLotId] };
}

function buildLotExportUrl(lotId, endpoint, selection = {}) {
  const params = new URLSearchParams();
  const selectedLotIds = normalizeLotExportSelectionIds(selection.selectedLotIds);

  selectedLotIds.forEach((selectedLotId) => params.append('lotIds', String(selectedLotId)));

  const query = params.toString();
  return `/management/lots/${Number(lotId)}/export/${endpoint}${query ? `?${query}` : ''}`;
}

async function resolveLotExportContext(lotId, req) {
  const rootScope = await lotModel.getLotExportScope(lotId, 'descendants');

  if (!rootScope) {
    return null;
  }

  const selection = getLotExportSelection(req, rootScope);
  const dataScope = buildSelectedLotExportScope(rootScope, selection.selectedLotIds);

  return {
    rootScope,
    dataScope,
    directChildLots: dataScope.directChildLots || [],
    selection: {
      selectedLotIds: dataScope.selectedScopeLotIds || []
    }
  };
}

function buildLotExportScopeOptions(exportContext) {
  const { rootScope, directChildLots, selection } = exportContext;
  const selectedLotIds = new Set(normalizeLotExportSelectionIds(selection.selectedLotIds));
  const rootLotId = Number(rootScope.selectedLot.lot_id);
  const options = [
    {
      lotId: rootLotId,
      label: 'This Lot',
      description: `Only Units assigned directly to ${rootScope.selectedLot.lot_name}.`,
      checked: selectedLotIds.has(rootLotId)
    }
  ];

  directChildLots.forEach((childLot) => {
    options.push({
      lotId: Number(childLot.lot_id),
      label: childLot.lot_name,
      description: `Includes ${childLot.lot_name} and anything below that child Lot.`,
      checked: selectedLotIds.has(Number(childLot.lot_id))
    });
  });

  return options;
}

function buildLotExportPresentation(exportContext) {
  const { rootScope, dataScope, selection } = exportContext;
  const selectedLotName = String(rootScope?.selectedLot?.lot_name || 'Selected Lot').trim();
  const includedCount = Array.isArray(dataScope?.includedLots) ? dataScope.includedLots.length : 0;
  const selectedScopeCount = normalizeLotExportSelectionIds(selection.selectedLotIds).length;
  const selectedNames = Array.isArray(dataScope?.selectedScopeLots)
    ? dataScope.selectedScopeLots.map((lot) => String(lot.lot_name || '').trim()).filter(Boolean)
    : [];
  const description = `Select one or more Lot areas and the columns to include in the export for ${selectedLotName}.`;
  const summaryText = selectedScopeCount === 1 && selectedNames[0] === selectedLotName
    ? `Only Units currently assigned directly to ${selectedLotName} are included.`
    : `${includedCount} Lot${includedCount === 1 ? '' : 's'} included from ${selectedScopeCount} selected area${selectedScopeCount === 1 ? '' : 's'}.`;

  return {
    eyebrow: 'Lot Unit Export',
    title: `Export ${selectedLotName}`,
    description,
    summaryText,
    scopePreviewUrl: `/management/lots/${Number(rootScope.selectedLot.lot_id)}/export/preview`,
    scopeOptions: buildLotExportScopeOptions(exportContext)
  };
}

async function renderLotUnitExportPreview(req, res) {
  const lotId = Number(req.params.lotId);

  try {
    const exportContext = await resolveLotExportContext(lotId, req);

    if (!exportContext) {
      return res.status(404).render('fragments/tech-unit-export-preview-modal', {
        dataset: null,
        availableColumns: UNIT_EXPORT_COLUMNS,
        previewRows: [],
        csvDownloadUrl: '',
        xlsxDownloadUrl: '',
        exportPresentation: {
          eyebrow: 'Lot Unit Export',
          title: 'Export unavailable',
          description: 'The selected Lot could not be found.',
          summaryText: '',
          scopeOptions: []
        },
        errorMessages: ['The selected Lot could not be found.']
      });
    }

    const fullDataset = await unitExportService.buildLotScopedUnitExportDataset(exportContext.dataScope);
    const columnSelection = getLotExportColumnSelection(req);
    const dataset = unitExportService.applyUnitExportColumnSelection(
      fullDataset,
      columnSelection.value,
      columnSelection
    );
    const exportPresentation = buildLotExportPresentation(exportContext);

    return res.render('fragments/tech-unit-export-preview-modal', {
      dataset,
      availableColumns: UNIT_EXPORT_COLUMNS,
      previewRows: dataset.rows,
      csvDownloadUrl: buildLotExportUrl(lotId, 'csv', exportContext.selection),
      xlsxDownloadUrl: buildLotExportUrl(lotId, 'xlsx', exportContext.selection),
      exportPresentation,
      errorMessages: []
    });
  } catch (error) {
    console.error('Lot Unit export preview could not be prepared:', error);
    return res.status(error?.code === 'BWT_LOT_EXPORT_SELECTION_INVALID' ? 400 : 200).render('fragments/tech-unit-export-preview-modal', {
      dataset: null,
      availableColumns: UNIT_EXPORT_COLUMNS,
      previewRows: [],
      csvDownloadUrl: '',
      xlsxDownloadUrl: '',
      exportPresentation: {
        eyebrow: 'Lot Unit Export',
        title: 'Export unavailable',
        description: 'The Lot Unit export could not be prepared.',
        summaryText: '',
        scopeOptions: []
      },
      errorMessages: [error && error.message
        ? error.message
        : 'The Lot Unit export could not be prepared.']
    });
  }
}

async function downloadLotUnitExport(req, res, next, format) {
  const lotId = Number(req.params.lotId);

  try {
    const exportContext = await resolveLotExportContext(lotId, req);

    if (!exportContext) {
      return res.status(404).type('text/plain').send('The selected Lot could not be found.');
    }

    const fullDataset = await unitExportService.buildLotScopedUnitExportDataset(exportContext.dataScope);
    const columnSelection = getLotExportColumnSelection(req);
    const dataset = unitExportService.applyUnitExportColumnSelection(
      fullDataset,
      columnSelection.value,
      columnSelection
    );
    const normalizedFormat = String(format || '').trim().toLowerCase();
    const fileBuffer = normalizedFormat === 'csv'
      ? unitExportFileService.buildCsvBuffer(dataset)
      : unitExportFileService.buildXlsxWorkbookBuffer(dataset);
    const contentType = normalizedFormat === 'csv'
      ? unitExportFileService.CSV_CONTENT_TYPE
      : unitExportFileService.XLSX_CONTENT_TYPE;
    const filename = unitExportFileService.buildUnitExportFilename(normalizedFormat, dataset.filters);

    res.status(200);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.length),
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });

    return res.send(fileBuffer);
  } catch (error) {
    if (error && ['BWT_UNIT_EXPORT_COLUMNS_REQUIRED', 'BWT_LOT_EXPORT_SELECTION_INVALID'].includes(error.code)) {
      return res.status(400).type('text/plain').send(error.message);
    }

    return next(error);
  }
}

async function downloadLotUnitsCsv(req, res, next) {
  return downloadLotUnitExport(req, res, next, 'csv');
}

async function downloadLotUnitsXlsx(req, res, next) {
  return downloadLotUnitExport(req, res, next, 'xlsx');
}

async function renderLotDetailPage(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/management-lot-detail', {
      pageTitle: lotDetailViewData.lot.lot_name,
      currentNav: 'management-lots',
      ...lotDetailViewData,
      requirementFieldOptions,
      operatorOptions,
      requirementFormData: getBlankRequirementFormData(),
      errorMessages: [],
      successMessage: getLotDetailSuccessMessage(req.query)
    });
  } catch (error) {
    next(error);
  }
}

async function createLotRequirement(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Lot Not Found',
        requestedPath: req.originalUrl
      });
    }

    const requirementFormData = getRequirementFormDataFromRequest(req);
    const errorMessages = validateRequirementForm(
      requirementFormData,
      lotDetailViewData.requirementValueOptionsByKey
    );

    if (errorMessages.length > 0) {
      if (isHtmxRequest(req)) {
        return res.status(400).render('fragments/lot-requirement-form-modal', {
          mode: 'create',
          lot: lotDetailViewData.lot,
          requirement: null,
          requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
          requirementFieldOptions,
          operatorOptions,
          formData: requirementFormData,
          errorMessages
        });
      }

      return res.status(400).render('pages/management-lot-detail', {
        pageTitle: lotDetailViewData.lot.lot_name,
        currentNav: 'management-lots',
        ...lotDetailViewData,
        requirementFieldOptions,
        operatorOptions,
        requirementFormData,
        errorMessages,
        successMessage: null
      });
    }

    await lotModel.createLotRequirement(lotId, requirementFormData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, `/management/lots/${lotId}?requirementCreated=1`);
  } catch (error) {
    next(error);
  }
}


async function renderNewLotModal(req, res, next) {
  try {
    const formOptions = await lotModel.getLotFormOptions();

    return renderLotModal(res, {
      mode: 'create',
      formOptions,
      formData: getBlankLotFormData(formOptions),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      const formOptions = await lotModel.getLotFormOptions();

      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions,
        formData: getBlankLotFormData(formOptions),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const lot = await lotModel.getLotById(lotId);
    const formOptions = await lotModel.getLotFormOptions({
      currentLotId: lotId,
      includeParentLotIds: lot?.parent_lot_id ? [lot.parent_lot_id] : []
    });

    if (!lot) {
      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions,
        formData: getBlankLotFormData(formOptions),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return renderLotModal(res, {
      mode: 'edit',
      lot,
      formOptions,
      formData: getLotFormDataFromLot(lot),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const lot = await lotModel.getLotById(lotId);
    const formOptions = await lotModel.getLotFormOptions({
      currentLotId: lotId,
      includeParentLotIds: lot?.parent_lot_id ? [lot.parent_lot_id] : []
    });

    if (!Number.isInteger(lotId) || lotId <= 0 || !lot) {
      return res.status(404).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot: null,
        formOptions,
        formData: getLotFormDataFromRequest(req),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const formData = getLotFormDataFromRequest(req);
    const errorMessages = validateLotForm(formData, formOptions, lotId);

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot,
        formOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.updateLot(lotId, formData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, addCacheBuster('/management/lots?updated=1'));
  } catch (error) {
    if (error && String(error.code || '').startsWith('LOT_PARENT_')) {
      const lotId = Number(req.params.lotId);
      const lot = await lotModel.getLotById(lotId);
      const formOptions = await lotModel.getLotFormOptions({
        currentLotId: lotId,
        includeParentLotIds: lot?.parent_lot_id ? [lot.parent_lot_id] : []
      });

      return res.status(400).render('fragments/lot-form-modal', {
        mode: 'edit',
        lot,
        formOptions,
        formData: getLotFormDataFromRequest(req),
        errorMessages: [error.message]
      });
    }

    next(error);
  }
}

async function renderLotVisibilityModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const mode = req.path.includes('/unhide') ? 'unhide' : 'hide';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const visibilitySummary = await lotModel.getLotVisibilitySummary(lotId);

    if (!visibilitySummary) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return res.render('fragments/lot-visibility-modal', {
      mode,
      visibilitySummary,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotVisibility(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const shouldUnhide = req.path.includes('/unhide');
    const mode = shouldUnhide ? 'unhide' : 'hide';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const visibilitySummary = await lotModel.getLotVisibilitySummary(lotId);

    if (!visibilitySummary) {
      return res.status(404).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!visibilitySummary.canChangeVisibility) {
      return res.status(400).render('fragments/lot-visibility-modal', {
        mode,
        visibilitySummary,
        errorMessages: ['Lot visibility cannot be changed because the lots table does not support hidden lots yet.']
      });
    }

    await lotModel.setLotVisibility(lotId, shouldUnhide, req.currentUser.user_id);

    const redirectUrl = shouldUnhide
      ? '/management/lots?showHidden=1&unhidden=1'
      : '/management/lots?hidden=1';

    return sendHtmxRedirect(req, res, addCacheBuster(redirectUrl));
  } catch (error) {
    next(error);
  }
}

async function renderLotClosureModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const mode = req.path.includes('/reopen') ? 'reopen' : 'close';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-closure-modal', {
        mode,
        closureSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const closureSummary = await lotModel.getLotClosureSummary(lotId);

    if (!closureSummary) {
      return res.status(404).render('fragments/lot-closure-modal', {
        mode,
        closureSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!closureSummary.canChangeClosure) {
      return res.status(400).render('fragments/lot-closure-modal', {
        mode,
        closureSummary,
        errorMessages: ['Lot closure is not ready yet. Run the Step 6f.1 closed-lot migration first.']
      });
    }

    return res.render('fragments/lot-closure-modal', {
      mode,
      closureSummary,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotClosure(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const shouldReopen = req.path.includes('/reopen');
    const mode = shouldReopen ? 'reopen' : 'close';

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-closure-modal', {
        mode,
        closureSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const closureSummary = await lotModel.getLotClosureSummary(lotId);

    if (!closureSummary) {
      return res.status(404).render('fragments/lot-closure-modal', {
        mode,
        closureSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!closureSummary.canChangeClosure) {
      return res.status(400).render('fragments/lot-closure-modal', {
        mode,
        closureSummary,
        errorMessages: ['Lot closure is not ready yet. Run the Step 6f.1 closed-lot migration first.']
      });
    }

    await lotModel.setLotClosed(lotId, !shouldReopen, req.currentUser.user_id);

    const redirectUrl = shouldReopen
      ? '/management/lots?reopened=1'
      : '/management/lots?closed=1';

    return sendHtmxRedirect(req, res, addCacheBuster(redirectUrl));
  } catch (error) {
    next(error);
  }
}

async function renderDeleteLotModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const deleteSummary = await lotModel.getLotDeleteSummary(lotId);

    if (!deleteSummary) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return res.render('fragments/lot-delete-modal', {
      lot: deleteSummary.lot,
      deleteSummary,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deleteLot(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const deleteSummary = await lotModel.getLotDeleteSummary(lotId);

    if (!deleteSummary) {
      return res.status(404).render('fragments/lot-delete-modal', {
        lot: null,
        deleteSummary: null,
        errorMessages: ['The selected lot could not be found.']
      });
    }

    if (!deleteSummary.canDelete) {
      return res.status(400).render('fragments/lot-delete-modal', {
        lot: deleteSummary.lot,
        deleteSummary,
        errorMessages: ['This lot cannot be deleted until all attached units and child lots are removed.']
      });
    }

    const deleted = await lotModel.deleteLotIfEmpty(lotId);

    if (!deleted) {
      const refreshedSummary = await lotModel.getLotDeleteSummary(lotId);

      return res.status(409).render('fragments/lot-delete-modal', {
        lot: refreshedSummary ? refreshedSummary.lot : deleteSummary.lot,
        deleteSummary: refreshedSummary || deleteSummary,
        errorMessages: ['The lot changed before it could be deleted. Review its current Units and child Lots, then try again.']
      });
    }

    return sendHtmxRedirect(req, res, addCacheBuster('/management/lots?deleted=1'));
  } catch (error) {
    next(error);
  }
}

async function renderLotRequirementsModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return res.render('fragments/lot-requirements-modal', {
      lot: lotDetailViewData.lot,
      requirements: lotDetailViewData.requirements,
      requirementInheritanceSuppressions: lotDetailViewData.requirementInheritanceSuppressions,
      successMessage: '',
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


async function customizeInheritedLotRequirementField(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);

    if (!Number.isSafeInteger(lotId) || lotId <= 0
      || !Number.isSafeInteger(requirementId) || requirementId <= 0) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        successMessage: '',
        errorMessages: ['The selected inherited requirement could not be found.']
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        successMessage: '',
        errorMessages: ['The selected Lot could not be found.']
      });
    }

    const inheritedRequirement = lotDetailViewData.requirements.find((requirement) => (
      Number(requirement.lot_requirement_id) === requirementId
      && Number(requirement.is_inherited) === 1
      && Number(requirement.source_lot_id) === Number(lotDetailViewData.lot.parent_lot_id)
    ));

    if (!inheritedRequirement) {
      return res.status(409).render('fragments/lot-requirements-modal', {
        lot: lotDetailViewData.lot,
        requirements: lotDetailViewData.requirements,
        requirementInheritanceSuppressions: lotDetailViewData.requirementInheritanceSuppressions,
        successMessage: '',
        errorMessages: [
          'That requirement is no longer inherited from this Lot\'s direct parent. Refresh the Requirements list and try again.'
        ]
      });
    }

    const result = await lotModel.customizeInheritedRequirementField(
      lotId,
      requirementId,
      req.currentUser.user_id
    );
    const refreshedViewData = await getLotDetailViewData(lotId);
    const fieldLabel = inheritedRequirement.requirement_label || inheritedRequirement.requirement_key || 'Requirement';
    const successMessage = result.alreadyCustomized
      ? `${fieldLabel} already has child-specific requirements.`
      : `${fieldLabel} is now customized for this Lot. The direct parent rules for this field were copied here and can now be edited or deleted.`;

    return res.render('fragments/lot-requirements-modal', {
      lot: refreshedViewData.lot,
      requirements: refreshedViewData.requirements,
      requirementInheritanceSuppressions: refreshedViewData.requirementInheritanceSuppressions,
      successMessage,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


async function suppressInheritedLotRequirementField(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);

    if (!Number.isSafeInteger(lotId) || lotId <= 0
      || !Number.isSafeInteger(requirementId) || requirementId <= 0) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        requirementInheritanceSuppressions: [],
        successMessage: '',
        errorMessages: ['The selected inherited requirement could not be found.']
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        requirementInheritanceSuppressions: [],
        successMessage: '',
        errorMessages: ['The selected Lot could not be found.']
      });
    }

    const inheritedRequirement = lotDetailViewData.requirements.find((requirement) => (
      Number(requirement.lot_requirement_id) === requirementId
      && Number(requirement.is_inherited) === 1
      && Number(requirement.source_lot_id) === Number(lotDetailViewData.lot.parent_lot_id)
    ));

    if (!inheritedRequirement) {
      return res.status(409).render('fragments/lot-requirements-modal', {
        lot: lotDetailViewData.lot,
        requirements: lotDetailViewData.requirements,
        requirementInheritanceSuppressions: lotDetailViewData.requirementInheritanceSuppressions,
        successMessage: '',
        errorMessages: [
          'That requirement is no longer inherited from this Lot\'s direct parent. Refresh the Requirements list and try again.'
        ]
      });
    }

    await lotModel.suppressInheritedRequirementField(
      lotId,
      requirementId,
      req.currentUser.user_id
    );

    const refreshedViewData = await getLotDetailViewData(lotId);
    const fieldLabel = inheritedRequirement.requirement_label || inheritedRequirement.requirement_key || 'Requirement';

    return res.render('fragments/lot-requirements-modal', {
      lot: refreshedViewData.lot,
      requirements: refreshedViewData.requirements,
      requirementInheritanceSuppressions: refreshedViewData.requirementInheritanceSuppressions,
      successMessage: `${fieldLabel} is no longer inherited by this Lot. You can restore the parent requirement at any time.`,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function restoreInheritedLotRequirementField(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementTypeConfigValueId = Number(req.params.requirementTypeConfigValueId);

    if (!Number.isSafeInteger(lotId) || lotId <= 0
      || !Number.isSafeInteger(requirementTypeConfigValueId) || requirementTypeConfigValueId <= 0) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        requirementInheritanceSuppressions: [],
        successMessage: '',
        errorMessages: ['The selected requirement inheritance setting could not be found.']
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirements-modal', {
        lot: null,
        requirements: [],
        requirementInheritanceSuppressions: [],
        successMessage: '',
        errorMessages: ['The selected Lot could not be found.']
      });
    }

    const suppression = lotDetailViewData.requirementInheritanceSuppressions.find((entry) => (
      Number(entry.requirement_type_config_value_id) === requirementTypeConfigValueId
    ));

    if (!suppression) {
      return res.status(409).render('fragments/lot-requirements-modal', {
        lot: lotDetailViewData.lot,
        requirements: lotDetailViewData.requirements,
        requirementInheritanceSuppressions: lotDetailViewData.requirementInheritanceSuppressions,
        successMessage: '',
        errorMessages: ['That parent requirement is already being inherited.']
      });
    }

    await lotModel.restoreInheritedRequirementField(lotId, requirementTypeConfigValueId);
    const refreshedViewData = await getLotDetailViewData(lotId);
    const fieldLabel = suppression.requirement_label || suppression.requirement_key || 'Requirement';

    return res.render('fragments/lot-requirements-modal', {
      lot: refreshedViewData.lot,
      requirements: refreshedViewData.requirements,
      requirementInheritanceSuppressions: refreshedViewData.requirementInheritanceSuppressions,
      successMessage: `${fieldLabel} now inherits the direct parent requirement again.`,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


async function renderLotUnitValidationModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(lotId) || lotId <= 0 || !Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('fragments/lot-unit-validation-modal', {
        lot: null,
        unit: null,
        requirementCount: 0,
        errorMessages: ['The selected Lot or Unit could not be found.']
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-unit-validation-modal', {
        lot: null,
        unit: null,
        requirementCount: 0,
        errorMessages: ['The selected Lot could not be found.']
      });
    }

    const unit = lotDetailViewData.validationReport.units.find(
      (candidate) => Number(candidate.unitId) === unitId
    );

    if (!unit) {
      return res.status(404).render('fragments/lot-unit-validation-modal', {
        lot: lotDetailViewData.lot,
        unit: null,
        requirementCount: lotDetailViewData.validationReport.requirementCount,
        errorMessages: ['The selected Unit is not currently assigned to this Lot.']
      });
    }

    return res.render('fragments/lot-unit-validation-modal', {
      lot: lotDetailViewData.lot,
      unit,
      requirementCount: lotDetailViewData.validationReport.requirementCount,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


function renderLotUnitValidationModalResponse(res, {
  lot,
  unit,
  requirementCount,
  errorMessages = [],
  statusCode = 200
}) {
  return res.status(statusCode).render('fragments/lot-unit-validation-modal', {
    lot,
    unit,
    requirementCount,
    errorMessages
  });
}

async function acceptLotUnitValidationOverride(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const unitId = Number(req.params.unitId);
    const reason = String(req.body.reason || '').trim();

    if (!Number.isSafeInteger(lotId) || lotId <= 0 || !Number.isSafeInteger(unitId) || unitId <= 0) {
      return renderLotUnitValidationModalResponse(res, {
        lot: null,
        unit: null,
        requirementCount: 0,
        errorMessages: ['The selected Lot or Unit could not be found.'],
        statusCode: 404
      });
    }

    const lotDetailViewData = await getLotDetailViewData(lotId);
    const unit = lotDetailViewData?.validationReport?.units.find(
      (candidate) => Number(candidate.unitId) === unitId
    );

    if (!lotDetailViewData || !unit) {
      return renderLotUnitValidationModalResponse(res, {
        lot: lotDetailViewData?.lot || null,
        unit: null,
        requirementCount: lotDetailViewData?.validationReport?.requirementCount || 0,
        errorMessages: ['The selected Unit is not currently assigned to this Lot.'],
        statusCode: 404
      });
    }

    if (!['rejected', 'needs_review'].includes(unit.technicalStatus || unit.status)) {
      return renderLotUnitValidationModalResponse(res, {
        lot: lotDetailViewData.lot,
        unit,
        requirementCount: lotDetailViewData.validationReport.requirementCount,
        errorMessages: ['This Unit does not currently require a Management acceptance.'],
        statusCode: 400
      });
    }

    if (!reason) {
      return renderLotUnitValidationModalResponse(res, {
        lot: lotDetailViewData.lot,
        unit,
        requirementCount: lotDetailViewData.validationReport.requirementCount,
        errorMessages: ['A reason is required to accept this Unit.'],
        statusCode: 400
      });
    }

    await lotValidationOverrideModel.createApprovedOverride({
      unitId,
      lotId,
      approvedByUserId: req.currentUser.user_id,
      reason
    });

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(`/management/lots/${lotId}?validationOverrideAccepted=1`)
    );
  } catch (error) {
    if (isHtmxRequest(req)) {
      const lotId = Number(req.params.lotId);
      const unitId = Number(req.params.unitId);
      const lotDetailViewData = Number.isSafeInteger(lotId) && lotId > 0
        ? await getLotDetailViewData(lotId)
        : null;
      const unit = lotDetailViewData?.validationReport?.units.find(
        (candidate) => Number(candidate.unitId) === unitId
      ) || null;

      return renderLotUnitValidationModalResponse(res, {
        lot: lotDetailViewData?.lot || null,
        unit,
        requirementCount: lotDetailViewData?.validationReport?.requirementCount || 0,
        errorMessages: [error.message || 'The Unit could not be accepted.'],
        statusCode: 400
      });
    }

    return next(error);
  }
}

async function revokeLotUnitValidationOverride(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const unitId = Number(req.params.unitId);
    const overrideId = Number(req.params.overrideId);

    if (
      !Number.isSafeInteger(lotId) || lotId <= 0
      || !Number.isSafeInteger(unitId) || unitId <= 0
      || !Number.isSafeInteger(overrideId) || overrideId <= 0
    ) {
      return renderLotUnitValidationModalResponse(res, {
        lot: null,
        unit: null,
        requirementCount: 0,
        errorMessages: ['The selected Management acceptance could not be found.'],
        statusCode: 404
      });
    }

    await lotValidationOverrideModel.revokeApprovedOverride({
      overrideId,
      unitId,
      lotId,
      revokedByUserId: req.currentUser.user_id
    });

    return sendHtmxRedirect(
      req,
      res,
      addCacheBuster(`/management/lots/${lotId}?validationOverrideRevoked=1`)
    );
  } catch (error) {
    if (isHtmxRequest(req)) {
      const lotId = Number(req.params.lotId);
      const unitId = Number(req.params.unitId);
      const lotDetailViewData = Number.isSafeInteger(lotId) && lotId > 0
        ? await getLotDetailViewData(lotId)
        : null;
      const unit = lotDetailViewData?.validationReport?.units.find(
        (candidate) => Number(candidate.unitId) === unitId
      ) || null;

      return renderLotUnitValidationModalResponse(res, {
        lot: lotDetailViewData?.lot || null,
        unit,
        requirementCount: lotDetailViewData?.validationReport?.requirementCount || 0,
        errorMessages: [error.message || 'The Management acceptance could not be revoked.'],
        statusCode: 400
      });
    }

    return next(error);
  }
}

async function renderNewLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'create',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    return renderRequirementModal(res, {
      mode: 'create',
      lot: lotDetailViewData.lot,
      requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
      formData: getBlankRequirementFormData(),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const requirement = await lotModel.getLotRequirementById(lotId, requirementId);

    if (!requirement) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: lotDetailViewData.lot,
        requirement: null,
        requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
        requirementFieldOptions,
        operatorOptions,
        formData: getBlankRequirementFormData(),
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    return renderRequirementModal(res, {
      mode: 'edit',
      lot: lotDetailViewData.lot,
      requirement,
      requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
      formData: getRequirementFormDataFromRequirement(requirement),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);
    const lotDetailViewData = await getLotDetailViewData(lotId);

    if (!lotDetailViewData) {
      return res.status(404).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: null,
        requirement: null,
        requirementValueOptionsByKey: {},
        requirementFieldOptions,
        operatorOptions,
        formData: getRequirementFormDataFromRequest(req),
        errorMessages: ['The selected lot could not be found.']
      });
    }

    const requirement = await lotModel.getLotRequirementById(lotId, requirementId);
    const formData = getRequirementFormDataFromRequest(req);
    const errorMessages = validateRequirementForm(
      formData,
      lotDetailViewData.requirementValueOptionsByKey
    );

    if (!requirement) {
      errorMessages.push('The selected requirement could not be found.');
    }

    if (errorMessages.length > 0) {
      return res.status(400).render('fragments/lot-requirement-form-modal', {
        mode: 'edit',
        lot: lotDetailViewData.lot,
        requirement,
        requirementValueOptionsByKey: lotDetailViewData.requirementValueOptionsByKey,
        requirementFieldOptions,
        operatorOptions,
        formData,
        errorMessages
      });
    }

    await lotModel.updateLotRequirement(lotId, requirementId, formData, req.currentUser.user_id);

    return sendHtmxRedirect(req, res, `/management/lots/${lotId}?requirementUpdated=1`);
  } catch (error) {
    next(error);
  }
}

async function renderDeleteLotRequirementModal(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);

    if (!Number.isInteger(lotId) || lotId <= 0 || !Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(404).render('fragments/lot-requirement-delete-modal', {
        lot: null,
        requirement: null,
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    const [lot, requirement] = await Promise.all([
      lotModel.getLotById(lotId),
      lotModel.getLotRequirementById(lotId, requirementId)
    ]);

    if (!lot || !requirement) {
      return res.status(404).render('fragments/lot-requirement-delete-modal', {
        lot: lot || null,
        requirement: requirement || null,
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    return res.render('fragments/lot-requirement-delete-modal', {
      lot,
      requirement,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deleteLotRequirement(req, res, next) {
  try {
    const lotId = Number(req.params.lotId);
    const requirementId = Number(req.params.requirementId);

    if (!Number.isInteger(lotId) || lotId <= 0 || !Number.isInteger(requirementId) || requirementId <= 0) {
      return res.status(404).render('fragments/lot-requirement-delete-modal', {
        lot: null,
        requirement: null,
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    const [lot, requirement] = await Promise.all([
      lotModel.getLotById(lotId),
      lotModel.getLotRequirementById(lotId, requirementId)
    ]);

    if (!lot || !requirement) {
      return res.status(404).render('fragments/lot-requirement-delete-modal', {
        lot: lot || null,
        requirement: requirement || null,
        errorMessages: ['The selected requirement could not be found.']
      });
    }

    const deleted = await lotModel.deleteLotRequirement(lotId, requirementId);

    if (!deleted) {
      return res.status(409).render('fragments/lot-requirement-delete-modal', {
        lot,
        requirement,
        errorMessages: ['The requirement was not deleted. It may have already been removed.']
      });
    }

    return sendHtmxRedirect(req, res, addCacheBuster(`/management/lots/${lotId}?requirementDeleted=1`));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLotsPage,
  renderNewLotPage,
  renderNewLotModal,
  createLot,
  renderLotDuplicateModalPage,
  duplicateLot,
  renderEditLotModal,
  updateLotModal,
  renderLotVisibilityModal,
  updateLotVisibility,
  renderLotClosureModal,
  updateLotClosure,
  renderDeleteLotModal,
  deleteLot,
  renderLotDetailPage,
  renderLotRequirementsModal,
  customizeInheritedLotRequirementField,
  suppressInheritedLotRequirementField,
  restoreInheritedLotRequirementField,
  renderLotUnitFormRulesModalPage,
  renderLotUnitValidationModal,
  acceptLotUnitValidationOverride,
  revokeLotUnitValidationOverride,
  renderNewLotRequirementModal,
  createLotRequirement,
  renderEditLotRequirementModal,
  updateLotRequirementModal,
  renderDeleteLotRequirementModal,
  deleteLotRequirement,
  renderLotUnitExportPreview,
  downloadLotUnitsCsv,
  downloadLotUnitsXlsx,
  updateLotUnitFormRules
};
