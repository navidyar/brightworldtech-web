'use strict';

const lotModel = require('../models/lotModel');
const techUnitModel = require('../models/techUnitModel');
const unitExpandedFormModel = require('../models/unitExpandedFormModel');
const techLotRequirementModel = require('../models/techLotRequirementModel');
const { normalizeRequirementKey } = require('../config/lotRequirementRegistry');
const {
  normalizePositiveInteger,
  buildCanonicalRequirementObservations,
  applyDetectedValues,
  buildDetectedCatalogIssues
} = require('./apiUnitPreflightValues');
const { resolveLotToolPolicy } = require('./lotToolPolicy');
const {
  buildSourcePolicyDecision,
  buildExistingUnitActionDecision,
  buildRequirementEvaluationState,
  hasFailedToolRequirementChecks,
  hasIncompleteToolRequirementChecks,
  summarizeRequirementStates
} = require('./apiUnitPreflightPolicy');

function hasActualValue(check = {}) {
  return String(check.actualValue || '').trim() !== '' && String(check.actualValue || '').trim() !== '—';
}

function observationStateForCheck(check, effectiveStates) {
  const key = normalizeRequirementKey(check.requirementKey);
  if (effectiveStates.has(key)) return effectiveStates.get(key);
  if (key === 'processor' && effectiveStates.has('processor_family')) return effectiveStates.get('processor_family');
  return 'not_evaluable';
}

function serializeRequirementChecks(workflow, effectiveStates) {
  return (Array.isArray(workflow?.checks) ? workflow.checks : []).map((check) => {
    const observationState = observationStateForCheck(check, effectiveStates);
    return {
      requirement_key: check.requirementKey,
      requirement_label: check.requirementLabel,
      required_value: check.requiredValue,
      actual_value: check.actualValue,
      evaluation_source: observationState === 'known'
        ? 'tool_observation'
        : observationState === 'unknown'
          ? 'tool_unknown'
          : hasActualValue(check)
            ? 'current_unit_record'
            : 'tool_not_evaluable',
      evaluation_state: buildRequirementEvaluationState({
        check,
        observationState,
        hasStoredValue: hasActualValue(check)
      }),
      message: check.message
    };
  });
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
}


function summarizeMemory(formData, formOptions) {
  const rows = normalizeRows(formData.memoryModules).filter((row) => Number(row.sizeGb) > 0);
  const total = rows.length > 0
    ? rows.reduce((sum, row) => sum + Number(row.sizeGb || 0), 0)
    : Number(formData.ramGb || 0) || null;
  const typeIds = rows.length > 0
    ? [...new Set(rows.map((row) => normalizePositiveInteger(row.ramTypeConfigValueId)).filter(Boolean))]
    : [normalizePositiveInteger(formData.ramTypeConfigValueId)].filter(Boolean);
  const typeLabels = typeIds.map((id) => (formOptions.ramTypes || []).find((option) => Number(option.id) === id)?.label || '').filter(Boolean);

  return {
    total_gb: total,
    type: typeLabels.join(', '),
    modules: rows.map((row) => ({
      slot: String(row.slotLabel || '').trim(),
      size_gb: Number(row.sizeGb) || null,
      type: (formOptions.ramTypes || []).find((option) => Number(option.id) === Number(row.ramTypeConfigValueId))?.label || ''
    }))
  };
}

function summarizeStorage(formData, formOptions) {
  const rows = normalizeRows(formData.storageDevices).filter((row) => Number(row.sizeGb) > 0);
  const total = rows.length > 0
    ? rows.reduce((sum, row) => sum + Number(row.sizeGb || 0), 0)
    : Number(formData.storageGb || 0) || null;
  const typeIds = rows.length > 0
    ? [...new Set(rows.map((row) => normalizePositiveInteger(row.storageTypeConfigValueId)).filter(Boolean))]
    : [normalizePositiveInteger(formData.storageTypeConfigValueId)].filter(Boolean);
  const typeLabels = typeIds.map((id) => (formOptions.storageTypes || []).find((option) => Number(option.id) === id)?.label || '').filter(Boolean);

  return {
    total_gb: total,
    type: typeLabels.join(', '),
    devices: rows.map((row) => ({
      slot: String(row.slotLabel || '').trim(),
      size_gb: Number(row.sizeGb) || null,
      type: (formOptions.storageTypes || []).find((option) => Number(option.id) === Number(row.storageTypeConfigValueId))?.label || '',
      model: String(row.modelNumber || '').trim(),
      serial: String(row.serialNumber || '').trim()
    }))
  };
}

async function normalLotMoveAllowedWithoutApproval({ unit, intendedLotId, currentUserId, roleCodes }) {
  if (!unit || !intendedLotId) return false;
  const currentLotId = normalizePositiveInteger(unit.lot_id);
  const assignedUserId = normalizePositiveInteger(unit.assigned_to_user_id);
  const safeCurrentUserId = normalizePositiveInteger(currentUserId);
  if (!currentLotId || currentLotId === intendedLotId || assignedUserId !== safeCurrentUserId) return false;
  if (Number(unit.is_parked || 0) === 1 || Number(unit.is_archived || 0) === 1) return false;

  try {
    await techUnitModel.assertLotMovePermission({
      unit,
      nextLotId: intendedLotId,
      currentUserId: safeCurrentUserId,
      actorRoleCodes: roleCodes
    });
    return true;
  } catch (error) {
    if (['BWT_LOT_MOVE_NOT_ASSIGNED', 'BWT_LOT_MOVE_REQUIRES_APPROVAL'].includes(String(error && error.code || ''))) {
      return false;
    }
    throw error;
  }
}

function serializeEffectiveToolPolicy(policy = null) {
  if (!policy) return null;
  return {
    allow_manual_create_update: policy.allowManualCreateUpdate === true,
    allow_scantools: policy.allowScanTools === true,
    allow_techtools: policy.allowTechTools === true,
    require_scantools_before_completion: policy.requireScanToolsBeforeCompletion === true,
    require_techtools_before_completion: policy.requireTechToolsBeforeCompletion === true
  };
}

function buildRestorationGuidance({ blocked, matchedUnit, baseFormData, formOptions } = {}) {
  if (!blocked) return { required: false, configuration_known: Boolean(matchedUnit) };
  if (!matchedUnit || !baseFormData) {
    return {
      required: true,
      configuration_known: false,
      message: 'This Unit cannot continue. Restore any physical Memory or Storage changes before returning it. BWTDallas cannot safely identify the original configuration.'
    };
  }

  return {
    required: true,
    configuration_known: true,
    unit_id: Number(matchedUnit.unit_id),
    memory: summarizeMemory(baseFormData, formOptions),
    storage: summarizeStorage(baseFormData, formOptions),
    message: 'This Unit cannot continue. Restore the recorded Memory and Storage configuration before returning it.'
  };
}

async function buildPreflight({ body = {}, resolution = {}, userId, roleCodes = [], toolSource, intentionalDuplicate = false } = {}) {
  const intentionalDuplicateRequested = intentionalDuplicate === true;
  const matchedUnitId = !intentionalDuplicateRequested && resolution.status === 'MATCHED'
    ? normalizePositiveInteger(resolution.unit?.unit_id)
    : null;
  const matchedUnit = matchedUnitId ? await techUnitModel.getUnitById(matchedUnitId) : null;
  const intendedLotId = normalizePositiveInteger(body.lot_id ?? body.lotId);
  const allLots = await lotModel.listLots({ includeHidden: true });
  const assignableLots = techUnitModel.getAssignableLots(allLots);
  const intendedLot = intendedLotId ? allLots.find((lot) => Number(lot.lot_id) === intendedLotId) || null : null;
  const intendedLotAssignable = Boolean(intendedLot && assignableLots.some((lot) => Number(lot.lot_id) === intendedLotId));
  const effectiveToolPolicy = intendedLot ? resolveLotToolPolicy(allLots, intendedLotId) : null;
  const sourcePolicy = buildSourcePolicyDecision({ toolSource, effectivePolicy: effectiveToolPolicy || {} });
  const allowDuplicateWithoutApproval = Boolean(intendedLot && Number(intendedLot.allow_duplicate_unit_assumption || 0) === 1);
  const currentLotId = normalizePositiveInteger(matchedUnit?.lot_id);
  const currentLot = currentLotId ? allLots.find((lot) => Number(lot.lot_id) === currentLotId) || null : null;
  const normalMoveAllowed = await normalLotMoveAllowedWithoutApproval({
    unit: matchedUnit,
    intendedLotId,
    currentUserId: userId,
    roleCodes
  });
  const unitAction = intentionalDuplicateRequested
    ? {
      authorized: allowDuplicateWithoutApproval,
      action_required: false,
      action: 'intentional_duplicate',
      approval_required: !allowDuplicateWithoutApproval,
      reason: allowDuplicateWithoutApproval
        ? 'lot_allows_duplicate_units_without_approval'
        : 'individual_intentional_duplicate_approval_required',
      explicit_confirmation_received: true
    }
    : buildExistingUnitActionDecision({
      unit: matchedUnit,
      intendedLot,
      currentUserId: userId,
      roleCodes,
      allowDuplicateWithoutApproval,
      normalLotMoveAllowedWithoutApproval: normalMoveAllowed,
      currentLotClosed: Boolean(currentLot && Number(currentLot.is_closed || 0) === 1)
    });

  const formOptionsBase = await techUnitModel.getTechUnitFormOptions({
    includeCurrentLotId: matchedUnit?.lot_id,
    includeCurrentUnitModelId: matchedUnit?.unit_model_id,
    includeCurrentProcessorModelId: matchedUnit?.processor_model_id
  });
  const expandedFormOptions = await unitExpandedFormModel.getExpandedFormOptions();
  const formOptions = { ...formOptionsBase, ...expandedFormOptions };
  const baseFormData = matchedUnitId
    ? {
      ...(await techUnitModel.getUnitFormDataById(matchedUnitId, formOptionsBase)),
      ...(await unitExpandedFormModel.getExpandedFormDataByUnitId(matchedUnitId))
    }
    : {
      ...techUnitModel.getBlankUnitFormData(formOptionsBase),
      ...unitExpandedFormModel.getBlankExpandedFormData()
    };
  const formData = { ...baseFormData, lotId: intendedLotId ? String(intendedLotId) : '' };
  formData.memoryModules = normalizeRows(baseFormData.memoryModules).map((row) => ({ ...row }));
  formData.storageDevices = normalizeRows(baseFormData.storageDevices).map((row) => ({ ...row }));

  const creatingNewUnit = intentionalDuplicateRequested || !matchedUnit;
  const observations = buildCanonicalRequirementObservations(body, {
    // Existing BWTDallas Unit Category is authoritative. A submitted category is
    // workflow context only for creating a new Unit and must not silently alter
    // requirement/catalog evaluation for an existing Unit.
    includeUnitCategory: creatingNewUnit
  });

  const effectiveStates = applyDetectedValues({ formData, observations, formOptions });
  const catalogIssues = buildDetectedCatalogIssues({ observations, effectiveStates, formData });
  const submittedUnitCategoryRaw = body.unit_category_config_value_id ?? body.unitCategoryConfigValueId;
  const submittedUnitCategoryId = normalizePositiveInteger(submittedUnitCategoryRaw);
  const submittedUnitCategoryValid = Boolean(submittedUnitCategoryId
    && (Array.isArray(formOptions.unitCategories) ? formOptions.unitCategories : [])
      .some((category) => Number(category.id) === submittedUnitCategoryId));
  let requirementWorkflow = null;
  let requirementChecks = [];

  if (intendedLot) {
    requirementWorkflow = await techLotRequirementModel.buildWorkflowForForm({
      lotId: intendedLotId,
      unitId: matchedUnitId,
      formData,
      formOptions
    });
    requirementChecks = serializeRequirementChecks(requirementWorkflow, effectiveStates);
  }

  const blockers = [];
  const warnings = [];

  if (!intentionalDuplicateRequested && ['AMBIGUOUS', 'CONFLICT'].includes(String(resolution.status || ''))) {
    blockers.push({ code: 'UNSAFE_UNIT_IDENTITY', message: 'BWTDallas could not safely identify one physical Unit from the supplied identifiers.' });
  }
  if (intentionalDuplicateRequested) {
    const suppliedAssetTag = String(body.asset_tag ?? body.assetTag ?? '').trim();
    if (Number(resolution.match_count || 0) < 1) {
      blockers.push({ code: 'INTENTIONAL_DUPLICATE_MATCH_REQUIRED', message: 'Intentional Duplicate creation requires at least one existing duplicate-match candidate.' });
    }
    if (suppliedAssetTag || String(resolution.match_mode || '') === 'asset_tag_exact') {
      blockers.push({ code: 'ASSET_TAG_NOT_DUPLICABLE', message: 'An existing BWTDallas Asset Tag identifies one Unit and cannot be intentionally duplicated.' });
    }
    if (intendedLot && !allowDuplicateWithoutApproval) {
      blockers.push({ code: 'INTENTIONAL_DUPLICATE_APPROVAL_REQUIRED', message: 'This Lot requires the existing per-Unit Intentional Duplicate request workflow in BWTDallas.' });
    }
  }
  if (!intendedLotId) {
    blockers.push({ code: 'INTENDED_LOT_REQUIRED', message: 'An intended Lot is required for Resolve + Preflight.' });
  } else if (!intendedLot || !intendedLotAssignable) {
    blockers.push({ code: 'INTENDED_LOT_NOT_ASSIGNABLE', message: 'The intended Lot is not open, visible, and assignable.' });
  }
  if (intendedLot && !sourcePolicy.allowed) {
    blockers.push({ code: 'TOOL_SOURCE_NOT_ALLOWED', message: `${String(toolSource || 'This Tool')} is not allowed for the intended Lot.` });
  }
  if (!intentionalDuplicateRequested && matchedUnit && !normalizePositiveInteger(matchedUnit.lot_id) && Number(matchedUnit.is_parked || 0) !== 1) {
    blockers.push({ code: 'UNIT_OPERATIONAL_STATE_INVALID', message: 'The existing Active Unit has no current Lot and must be corrected in BWTDallas before Tool work can continue.' });
  }
  if (!intentionalDuplicateRequested && matchedUnit && unitAction.action_required) {
    blockers.push({
      code: unitAction.approval_required ? 'MOVE_TAKEOVER_APPROVAL_REQUIRED' : 'EXPLICIT_UNIT_ACTION_REQUIRED',
      message: unitAction.approval_required
        ? `A ${unitAction.action} request must be approved before Tool work can continue.`
        : `The technician must explicitly confirm the ${unitAction.action} action before Tool work can continue.`
    });
  }
  if (creatingNewUnit && !submittedUnitCategoryValid) {
    blockers.push({
      code: submittedUnitCategoryRaw === undefined || submittedUnitCategoryRaw === null || String(submittedUnitCategoryRaw).trim() === ''
        ? 'UNIT_CATEGORY_REQUIRED'
        : 'INVALID_UNIT_CATEGORY',
      message: submittedUnitCategoryRaw === undefined || submittedUnitCategoryRaw === null || String(submittedUnitCategoryRaw).trim() === ''
        ? 'Unit Category is a Tool processing prerequisite for creating a new Unit. Supply unit_category_config_value_id from /api/v1/units/creation-options.'
        : 'The supplied Unit Category is not available in BWTDallas. Choose a valid unit_category_config_value_id from /api/v1/units/creation-options.'
    });
  }
  for (const issue of catalogIssues) {
    if (issue.field_key === 'model' || issue.field_key === 'processor') {
      blockers.push({ code: issue.code, message: issue.message, field_key: issue.field_key });
    }
  }

  const hasRequirementFailure = hasFailedToolRequirementChecks(requirementChecks);
  const hasIncompleteRequirements = hasIncompleteToolRequirementChecks(requirementChecks);
  if (hasRequirementFailure) {
    warnings.push({
      code: 'LOT_REQUIREMENTS_NOT_SATISFIED',
      message: 'One or more current Tool or Unit values do not satisfy the intended Lot requirements. The Tool may continue; BWTDallas will enforce Lot requirements when the technician finishes the Unit.'
    });
  }
  if (hasIncompleteRequirements) {
    warnings.push({
      code: 'LOT_REQUIREMENTS_INCOMPLETE',
      message: 'Some Lot requirements cannot be evaluated from the Tool submission or current Unit record. The Tool may continue; complete remaining Unit fields in BWTDallas.'
    });
  }
  if (requirementWorkflow?.technicalFailure && !hasRequirementFailure && !hasIncompleteRequirements) {
    warnings.push({ code: 'LOT_REQUIREMENT_WARNING', message: requirementWorkflow.message || 'The intended Lot has a requirement warning that BWTDallas will enforce in the technician workflow.' });
  }

  const assetEvidence = resolution.evidence || {};
  if (!intentionalDuplicateRequested && resolution.status === 'MATCHED' && Object.values(assetEvidence).some((state) => state === 'conflict')) {
    warnings.push({ code: 'SECONDARY_IDENTITY_CONFLICT', message: 'A secondary identifier conflicts with the authoritative match and will not be overwritten silently.' });
  }

  const canProceed = blockers.length === 0;

  return {
    read_only: true,
    intentional_duplicate: intentionalDuplicateRequested,
    can_proceed: canProceed,
    blockers,
    warnings,
    current_unit: matchedUnit ? {
      unit_id: Number(matchedUnit.unit_id),
      lot_id: normalizePositiveInteger(matchedUnit.lot_id),
      assigned_to_user_id: normalizePositiveInteger(matchedUnit.assigned_to_user_id),
      is_parked: Number(matchedUnit.is_parked || 0) === 1
    } : null,
    current_lot: currentLot ? {
      lot_id: Number(currentLot.lot_id),
      name: String(currentLot.lot_name || '').trim()
    } : null,
    intended_lot: intendedLot ? {
      lot_id: Number(intendedLot.lot_id),
      name: String(intendedLot.lot_name || '').trim(),
      assignable: intendedLotAssignable,
      allow_duplicate_units_without_approval: allowDuplicateWithoutApproval
    } : intendedLotId ? { lot_id: intendedLotId, name: '', assignable: false } : null,
    unit_action: unitAction,
    source_policy: {
      ...sourcePolicy,
      effective: serializeEffectiveToolPolicy(effectiveToolPolicy)
    },
    catalog_issues: catalogIssues,
    requirements: {
      status: summarizeRequirementStates(requirementChecks),
      policy_code: requirementWorkflow?.policyCode || null,
      save_allowed_by_existing_lot_policy: requirementWorkflow ? requirementWorkflow.saveAllowed === true : null,
      checks: requirementChecks
    },
    restoration: buildRestorationGuidance({
      blocked: !canProceed,
      matchedUnit,
      baseFormData,
      formOptions
    })
  };
}

module.exports = {
  buildRestorationGuidance,
  buildPreflight
};
