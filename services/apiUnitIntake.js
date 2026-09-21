'use strict';

const techUnitModel = require('../models/techUnitModel');
const unitExpandedFormModel = require('../models/unitExpandedFormModel');
const unitAuditEventModel = require('../models/unitAuditEventModel');
const { buildUnitFormAuditEvent } = require('./unitAuditSnapshot');
const { resolveUnitIdentity } = require('./apiUnitIdentity');
const apiUnitPreflight = require('./apiUnitPreflight');

class ApiUnitIntakeError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiUnitIntakeError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  return String(value || '').trim().toLowerCase() === 'true';
}


function normalizeOptionalNonNegativeInteger(value, fieldLabel) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `${fieldLabel} must be a non-negative whole number.`);
  }
  return parsed;
}

function optionIdSet(options = []) {
  return new Set((Array.isArray(options) ? options : [])
    .map((option) => normalizePositiveInteger(option?.id))
    .filter(Boolean));
}

function normalizePreviousMemory(body, formOptions) {
  const raw = body.previous_memory ?? body.previousMemory;
  if (raw === undefined || raw === null) return { totalGb: null, modules: [], supplied: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', 'previous_memory must be an object when supplied.');
  }

  const totalGb = normalizeOptionalNonNegativeInteger(raw.total_gb ?? raw.totalGb, 'Previous Memory total_gb');
  const modules = Array.isArray(raw.modules) ? raw.modules : [];
  const ramTypeIds = optionIdSet(formOptions.ramTypes);
  const installCodes = new Set((Array.isArray(formOptions.memoryInstallTypes) ? formOptions.memoryInstallTypes : [])
    .map((option) => String(option?.code || '').trim()).filter(Boolean));

  const normalizedModules = modules.map((module, index) => {
    if (!module || typeof module !== 'object' || Array.isArray(module)) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `previous_memory.modules[${index}] must be an object.`);
    }
    const sizeGb = normalizeOptionalNonNegativeInteger(module.size_gb ?? module.sizeGb, `Previous Memory module ${index + 1} size_gb`);
    if (sizeGb === null) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `Previous Memory module ${index + 1} requires size_gb.`);
    }
    const ramTypeConfigValueId = normalizePositiveInteger(module.ram_type_config_value_id ?? module.ramTypeConfigValueId);
    if (ramTypeConfigValueId && !ramTypeIds.has(ramTypeConfigValueId)) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `Previous Memory module ${index + 1} uses an unavailable Memory Type.`);
    }
    const memoryInstallTypeCode = normalizeText(module.memory_install_type_code ?? module.memoryInstallTypeCode, 80);
    if (memoryInstallTypeCode && !installCodes.has(memoryInstallTypeCode)) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `Previous Memory module ${index + 1} uses an unavailable install type.`);
    }
    return {
      slotLabel: normalizeText(module.slot_label ?? module.slotLabel, 80) || `Memory Slot ${index + 1}`,
      sizeGb: String(sizeGb),
      ramTypeConfigValueId: ramTypeConfigValueId ? String(ramTypeConfigValueId) : '',
      memoryInstallTypeCode
    };
  });

  const moduleTotal = normalizedModules.reduce((sum, module) => sum + Number(module.sizeGb || 0), 0);
  if (totalGb !== null && normalizedModules.length > 0 && totalGb !== moduleTotal) {
    throw new ApiUnitIntakeError(422, 'PREVIOUS_MEMORY_TOTAL_MISMATCH', 'Previous Memory total_gb must equal the sum of the supplied previous Memory modules.');
  }
  if (totalGb === 0 && normalizedModules.some((module) => Number(module.sizeGb) > 0)) {
    throw new ApiUnitIntakeError(422, 'PREVIOUS_MEMORY_TOTAL_MISMATCH', 'Previous Memory cannot be 0 GB when previous Memory modules are supplied.');
  }

  return { totalGb: totalGb ?? (normalizedModules.length ? moduleTotal : null), modules: normalizedModules, supplied: true };
}

function normalizePreviousStorage(body, formOptions) {
  const raw = body.previous_storage ?? body.previousStorage;
  if (raw === undefined || raw === null) return { totalGb: null, devices: [], supplied: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', 'previous_storage must be an object when supplied.');
  }

  const totalGb = normalizeOptionalNonNegativeInteger(raw.total_gb ?? raw.totalGb, 'Previous Storage total_gb');
  const devices = Array.isArray(raw.devices) ? raw.devices : [];
  const storageTypeIds = optionIdSet(formOptions.storageTypes);

  const normalizedDevices = devices.map((device, index) => {
    if (!device || typeof device !== 'object' || Array.isArray(device)) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `previous_storage.devices[${index}] must be an object.`);
    }
    const sizeGb = normalizeOptionalNonNegativeInteger(device.size_gb ?? device.sizeGb, `Previous Storage device ${index + 1} size_gb`);
    if (sizeGb === null) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `Previous Storage device ${index + 1} requires size_gb.`);
    }
    const storageTypeConfigValueId = normalizePositiveInteger(device.storage_type_config_value_id ?? device.storageTypeConfigValueId);
    if (storageTypeConfigValueId && !storageTypeIds.has(storageTypeConfigValueId)) {
      throw new ApiUnitIntakeError(422, 'INVALID_PREVIOUS_COMPONENT_DATA', `Previous Storage device ${index + 1} uses an unavailable Storage Type.`);
    }
    return {
      slotLabel: normalizeText(device.slot_label ?? device.slotLabel, 80) || `Drive ${index + 1}`,
      sizeGb: String(sizeGb),
      storageTypeConfigValueId: storageTypeConfigValueId ? String(storageTypeConfigValueId) : '',
      // Previous Storage mirrors the normal BWTDallas technician form: manual
      // capture is limited to capacity/type. Serial and other drive evidence remain
      // Tool-managed and are not manually authored through the API.
      serialNumber: ''
    };
  });

  const deviceTotal = normalizedDevices.reduce((sum, device) => sum + Number(device.sizeGb || 0), 0);
  if (totalGb !== null && normalizedDevices.length > 0 && totalGb !== deviceTotal) {
    throw new ApiUnitIntakeError(422, 'PREVIOUS_STORAGE_TOTAL_MISMATCH', 'Previous Storage total_gb must equal the sum of the supplied previous Storage devices.');
  }
  if (totalGb === 0 && normalizedDevices.some((device) => Number(device.sizeGb) > 0)) {
    throw new ApiUnitIntakeError(422, 'PREVIOUS_STORAGE_TOTAL_MISMATCH', 'Previous Storage cannot be 0 GB when previous Storage devices are supplied.');
  }

  return { totalGb: totalGb ?? (normalizedDevices.length ? deviceTotal : null), devices: normalizedDevices, supplied: true };
}

function normalizeIdentity(body = {}) {
  const assetTag = normalizeText(body.asset_tag ?? body.assetTag, 80);
  const unitSerialNumber = normalizeText(body.unit_serial_number ?? body.unitSerialNumber ?? body.unit_serial, 120);
  const biosSerialNumber = normalizeText(body.bios_serial_number ?? body.biosSerialNumber ?? body.bios_serial, 120);
  const systemUuid = normalizeText(body.system_uuid ?? body.systemUuid ?? body.uuid, 64).toUpperCase();
  const assetNumber = assetTag ? techUnitModel.normalizeAssetTagInput(assetTag) : null;

  if (assetTag && !assetNumber) {
    throw new ApiUnitIntakeError(422, 'INVALID_ASSET_TAG', 'The supplied BWTDallas Asset Tag format is invalid.');
  }

  if (!assetTag && !unitSerialNumber && !biosSerialNumber && !systemUuid) {
    throw new ApiUnitIntakeError(
      400,
      'UNIT_IDENTITY_REQUIRED',
      'Provide an Asset Tag, Unit Serial Number, BIOS Serial Number, or System UUID.'
    );
  }

  return {
    assetTag,
    assetNumber,
    unitSerialNumber,
    biosSerialNumber,
    systemUuid
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCapacity(value, typeLabel = '') {
  const amount = numberOrNull(value);
  if (amount === null || amount <= 0) return '';
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} GB${typeLabel ? ` ${typeLabel}` : ''}`;
}

function serializeCandidate(candidate = {}) {
  const memorySummary = formatCapacity(candidate.ramGb, candidate.ramTypeLabel);
  const storageSummary = formatCapacity(candidate.storageGb, candidate.storageTypeLabel);
  return {
    unit_id: Number(candidate.unitId) || null,
    asset_tag: candidate.assetTag || '',
    unit_serial_number: candidate.unitSerialNumber || '',
    bios_serial_number: candidate.biosSerialNumber || '',
    system_uuid: candidate.systemUuid || '',
    match_reasons: Array.isArray(candidate.matchReasons) ? candidate.matchReasons : [],
    evidence: candidate.evidence || null,
    manufacturer: candidate.manufacturerLabel || '',
    model: candidate.modelLabel || '',
    model_summary: candidate.modelSummary || '',
    processor: {
      brand: candidate.processorBrandLabel || '',
      model: candidate.processorLabel || '',
      speed_ghz: candidate.processorSpeedGhz === '' ? null : numberOrNull(candidate.processorSpeedGhz),
      summary: candidate.cpuSummary || ''
    },
    memory: {
      total_gb: numberOrNull(candidate.ramGb),
      type: candidate.ramTypeLabel || '',
      summary: memorySummary
    },
    storage: {
      total_gb: numberOrNull(candidate.storageGb),
      type: candidate.storageTypeLabel || '',
      summary: storageSummary
    },
    lot: {
      lot_id: Number(candidate.lotId) || null,
      name: candidate.lotName || ''
    },
    assignment: {
      user_id: Number(candidate.assignedToUserId) || null,
      username: candidate.assignedToUsername || '',
      name: candidate.assignedToName || ''
    },
    status: {
      config_value_id: Number(candidate.currentUnitStatusConfigValueId) || null,
      label: candidate.currentUnitStatusLabel || '',
      is_parked: Boolean(candidate.isParked),
      is_archived: Boolean(candidate.isArchived)
    }
  };
}

async function serializeUnit(unitId) {
  const [unit, formData] = await Promise.all([
    techUnitModel.getUnitById(unitId),
    techUnitModel.getUnitFormDataById(unitId)
  ]);

  if (!unit || !formData) return null;

  return {
    unit_id: Number(unit.unit_id),
    asset_tag: formData.assetTag || '',
    lot_id: Number(unit.lot_id) || null,
    assigned_to_user_id: Number(unit.assigned_to_user_id) || null,
    is_parked: Number(unit.is_parked || 0) === 1,
    unit_serial_number: formData.unitSerialNumber || '',
    bios_serial_number: formData.biosSerialNumber || '',
    system_uuid: formData.systemUuid || '',
    unit_category_config_value_id: Number(unit.unit_category_config_value_id) || null,
    current_unit_status_config_value_id: Number(unit.current_unit_status_config_value_id) || null,
    created_at: unit.created_at || null
  };
}

function findCreationLot(formOptions, lotId) {
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeLotId) return null;
  return (Array.isArray(formOptions?.lots) ? formOptions.lots : [])
    .find((option) => Number(option.lot_id) === safeLotId) || null;
}

function serializeSelectedLot(lot, requestedLotId = null) {
  if (!lot && !requestedLotId) return null;
  return {
    lot_id: lot ? Number(lot.lot_id) : normalizePositiveInteger(requestedLotId),
    name: lot ? String(lot.lot_name || '').trim() : '',
    assignable: Boolean(lot),
    allow_duplicate_match_unit_assumption: Boolean(lot && Number(lot.allow_duplicate_unit_assumption || 0) === 1)
  };
}

function buildCreationPolicy({ resolution, selectedLot, lotWasSupplied }) {
  const hasMatches = Number(resolution.matchCount || 0) > 0;
  const exactAssetTag = resolution.matchMode === 'asset_tag_exact' && hasMatches;
  const duplicateMatchAllowed = Boolean(selectedLot && Number(selectedLot.allow_duplicate_unit_assumption || 0) === 1);

  if (exactAssetTag) {
    return {
      evaluated: true,
      creation_allowed: false,
      reason: 'asset_tag_already_exists',
      duplicate_match_creation_allowed: false,
      duplicate_creation_requires_confirmation: false
    };
  }

  if (!lotWasSupplied) {
    return {
      evaluated: false,
      creation_allowed: null,
      reason: 'lot_required_for_creation_policy',
      duplicate_match_creation_allowed: null,
      duplicate_creation_requires_confirmation: hasMatches
    };
  }

  if (!selectedLot) {
    return {
      evaluated: true,
      creation_allowed: false,
      reason: 'lot_not_assignable',
      duplicate_match_creation_allowed: false,
      duplicate_creation_requires_confirmation: hasMatches
    };
  }

  if (!hasMatches) {
    return {
      evaluated: true,
      creation_allowed: true,
      reason: 'no_existing_candidates',
      duplicate_match_creation_allowed: duplicateMatchAllowed,
      duplicate_creation_requires_confirmation: false
    };
  }

  return {
    evaluated: true,
    creation_allowed: duplicateMatchAllowed,
    reason: duplicateMatchAllowed
      ? 'lot_allows_duplicate_match_unit_assumption'
      : 'existing_candidates_require_bwtdallas_review',
    duplicate_match_creation_allowed: duplicateMatchAllowed,
    duplicate_creation_requires_confirmation: duplicateMatchAllowed
  };
}

async function resolveUnit(body = {}, { formOptions = null, preflightContext = null } = {}) {
  const identity = normalizeIdentity(body);
  const matches = await techUnitModel.findDuplicateUnitsForForm({
    assetTag: identity.assetTag,
    unitSerialNumber: identity.unitSerialNumber,
    biosSerialNumber: identity.biosSerialNumber,
    systemUuid: identity.systemUuid
  });
  const resolution = resolveUnitIdentity({
    assetNumber: identity.assetNumber,
    unitSerialNumber: identity.unitSerialNumber,
    biosSerialNumber: identity.biosSerialNumber,
    systemUuid: identity.systemUuid,
    matches
  });

  const requestedLotId = body.lot_id ?? body.lotId;
  const lotWasSupplied = requestedLotId !== undefined && requestedLotId !== null && String(requestedLotId).trim() !== '';
  let resolvedFormOptions = formOptions;
  if (lotWasSupplied && !resolvedFormOptions) resolvedFormOptions = await techUnitModel.getTechUnitFormOptions();
  const selectedLot = lotWasSupplied ? findCreationLot(resolvedFormOptions, requestedLotId) : null;
  const creationPolicy = buildCreationPolicy({ resolution, selectedLot, lotWasSupplied });
  const serializedMatches = (resolution.candidates || []).map(serializeCandidate);

  const response = {
    status: resolution.status,
    match_mode: resolution.matchMode,
    match_count: serializedMatches.length,
    requires_user_review: serializedMatches.length > 0,
    evidence: resolution.evidence || null,
    matches: serializedMatches,
    // Keep the original candidates key for v1 clients built against 10W79B.
    candidates: serializedMatches,
    selected_lot: serializeSelectedLot(selectedLot, lotWasSupplied ? requestedLotId : null),
    creation_policy: creationPolicy
  };

  if (resolution.status === 'MATCHED' && resolution.matchedUnitId) {
    response.unit = await serializeUnit(resolution.matchedUnitId);
  }

  if (preflightContext) {
    response.preflight = await apiUnitPreflight.buildPreflight({
      body,
      resolution: response,
      userId: preflightContext.userId,
      roleCodes: preflightContext.roleCodes,
      toolSource: preflightContext.toolSource,
      intentionalDuplicate: normalizeBoolean(body.confirm_duplicate_match_creation ?? body.confirmDuplicateMatchCreation)
    });
  }

  return response;
}

async function listCreationOptions() {
  const [formOptions, expandedFormOptions] = await Promise.all([
    techUnitModel.getTechUnitFormOptions(),
    unitExpandedFormModel.getExpandedFormOptions()
  ]);
  const serializeConfigOptions = (options) => (Array.isArray(options) ? options : []).map((option) => ({
    config_value_id: Number(option.id),
    label: String(option.label || option.value || '').trim()
  }));
  return {
    lots: (Array.isArray(formOptions.lots) ? formOptions.lots : []).map((lot) => ({
      lot_id: Number(lot.lot_id),
      name: String(lot.lot_name || '').trim(),
      parent_lot_id: Number(lot.parent_lot_id) || null,
      allow_duplicate_match_unit_assumption: Number(lot.allow_duplicate_unit_assumption || 0) === 1
    })),
    unit_categories: (Array.isArray(formOptions.unitCategories) ? formOptions.unitCategories : []).map((category) => ({
      config_value_id: Number(category.id),
      label: String(category.label || category.value || '').trim()
    })),
    previous_component_options: {
      ram_types: serializeConfigOptions(formOptions.ramTypes),
      memory_install_types: (Array.isArray(formOptions.memoryInstallTypes) ? formOptions.memoryInstallTypes : []).map((option) => ({
        code: String(option.code || '').trim(),
        label: String(option.label || option.code || '').trim()
      })),
      storage_types: serializeConfigOptions(formOptions.storageTypes),
      storage_wipe_statuses: serializeConfigOptions(formOptions.storageWipeStatuses)
    },
    tool_field_options: {
      test_results: serializeConfigOptions(expandedFormOptions.testResultOptions),
      component_test_results: serializeConfigOptions(expandedFormOptions.componentTestResultOptions),
      lock_statuses: serializeConfigOptions(expandedFormOptions.lockStatusOptions)
    }
  };
}

async function createUnitInternal({ body = {}, userId, toolSource, connection = null }) {
  const identity = normalizeIdentity(body);
  const lotId = normalizePositiveInteger(body.lot_id ?? body.lotId);
  if (!lotId) {
    throw new ApiUnitIntakeError(422, 'LOT_REQUIRED', 'Choose an open, assignable Lot before creating a Unit.');
  }

  const formOptions = await techUnitModel.getTechUnitFormOptions();
  const lot = findCreationLot(formOptions, lotId);
  if (!lot) {
    throw new ApiUnitIntakeError(422, 'LOT_NOT_ASSIGNABLE', 'The selected Lot is not open and assignable for new Units.');
  }

  const existing = await resolveUnit({ ...body, lot_id: lotId }, { formOptions });

  if (identity.assetTag) {
    if (existing.match_mode === 'asset_tag_exact' && existing.match_count > 0) {
      throw new ApiUnitIntakeError(
        409,
        'UNIT_ALREADY_EXISTS',
        'The supplied BWTDallas Asset Tag identifies an existing Unit. Review the returned Unit instead of creating another one.',
        existing
      );
    }

    throw new ApiUnitIntakeError(
      409,
      'ASSET_TAG_NOT_ASSIGNABLE',
      'Asset Tags are generated by BWTDallas. Do not supply an Asset Tag when creating a new Unit.',
      existing.match_count > 0 ? existing : null
    );
  }

  if (!identity.unitSerialNumber && !identity.biosSerialNumber) {
    throw new ApiUnitIntakeError(
      400,
      'NEW_UNIT_SERIAL_REQUIRED',
      'A new tool-created Unit requires a Tech-entered Unit Serial Number or a tool-observed BIOS Serial Number so BWTDallas can safely identify it.'
    );
  }

  const hasDuplicateCandidates = existing.match_count > 0;
  const allowDuplicateCreation = hasDuplicateCandidates
    && existing.creation_policy?.creation_allowed === true
    && existing.creation_policy?.duplicate_match_creation_allowed === true;

  if (hasDuplicateCandidates && !allowDuplicateCreation) {
    throw new ApiUnitIntakeError(
      409,
      'UNIT_DUPLICATE_REVIEW_REQUIRED',
      'Possible existing BWTDallas Units were found. Review the returned candidates in BWTDallas before creating another Unit.',
      existing
    );
  }

  if (allowDuplicateCreation && !normalizeBoolean(body.confirm_duplicate_match_creation ?? body.confirmDuplicateMatchCreation)) {
    throw new ApiUnitIntakeError(
      409,
      'DUPLICATE_MATCH_CONFIRMATION_REQUIRED',
      'This Lot allows duplicate-match Unit creation, but the Tech User must explicitly confirm creation after reviewing the returned candidates.',
      existing
    );
  }

  const requestedCategoryId = normalizePositiveInteger(
    body.unit_category_config_value_id ?? body.unitCategoryConfigValueId
  );
  if ((body.unit_category_config_value_id ?? body.unitCategoryConfigValueId) && !requestedCategoryId) {
    throw new ApiUnitIntakeError(422, 'INVALID_UNIT_CATEGORY', 'The supplied Unit Category is invalid.');
  }
  if (requestedCategoryId && !(Array.isArray(formOptions.unitCategories) ? formOptions.unitCategories : [])
    .some((category) => Number(category.id) === requestedCategoryId)) {
    throw new ApiUnitIntakeError(422, 'INVALID_UNIT_CATEGORY', 'The supplied Unit Category is not available in BWTDallas.');
  }

  const previousMemory = normalizePreviousMemory(body, formOptions);
  const previousStorage = normalizePreviousStorage(body, formOptions);

  const formData = {
    ...techUnitModel.getBlankUnitFormData(formOptions),
    lotId: String(lotId),
    unitCategoryConfigValueId: requestedCategoryId ? String(requestedCategoryId) : '',
    previousRamGb: previousMemory.totalGb === null ? '' : String(previousMemory.totalGb),
    previousMemoryModules: previousMemory.modules,
    previousStorageGb: previousStorage.totalGb === null ? '' : String(previousStorage.totalGb),
    previousStorageDevices: previousStorage.devices,
    // Unit Serial is never inferred by the tool. If present here it was physically
    // confirmed and entered by the Tech User in ScanTools/TechTools.
    unitSerialNumber: identity.unitSerialNumber,
    // BIOS Serial is the tool-observed hardware identity.
    biosSerialNumber: identity.biosSerialNumber,
    // UUID is tertiary identity evidence and is never generated by the Tool.
    systemUuid: identity.systemUuid
  };

  let createdAssetTag = '';

  try {
    const unitId = await techUnitModel.createTechUnit(formData, userId, {
      connection,
      allowDuplicateIdentifiers: allowDuplicateCreation,
      beforeCommit: async ({ connection, unitId: pendingUnitId, assetNumber }) => {
        createdAssetTag = techUnitModel.getDisplayAssetTag(assetNumber);
        const event = buildUnitFormAuditEvent({
          mode: 'create',
          unitId: pendingUnitId,
          actorUserId: userId,
          afterFormData: {
            ...formData,
            assetTag: createdAssetTag
          },
          formOptions,
          source: `api_${toolSource}`
        });
        event.metadata = {
          ...(event.metadata || {}),
          toolSource,
          apiVersion: 'v1',
          identifierProvenance: {
            assetTag: 'bwtdallas_generated',
            unitSerialNumber: identity.unitSerialNumber ? 'tech_user_input_via_tool' : 'not_supplied',
            biosSerialNumber: identity.biosSerialNumber ? 'tool_observed' : 'not_supplied',
            systemUuid: identity.systemUuid ? 'tool_or_tech_observed' : 'not_supplied'
          },
          previousComponentProvenance: {
            memory: previousMemory.supplied ? 'tech_user_input_via_tool' : 'not_supplied',
            storage: previousStorage.supplied ? 'tech_user_input_via_tool' : 'not_supplied'
          },
          duplicateMatchCreation: allowDuplicateCreation,
          duplicateMatchCount: hasDuplicateCandidates ? existing.match_count : 0
        };
        await unitAuditEventModel.createUnitAuditEvent(event, connection);
      }
    });

    return {
      unitId: Number(unitId),
      assetTag: createdAssetTag,
      formData,
      formOptions,
      duplicateReview: hasDuplicateCandidates ? {
        match_mode: existing.match_mode,
        match_count: existing.match_count,
        matches: existing.matches,
        lot_allows_duplicate_match_creation: true,
        tech_user_confirmed_creation: allowDuplicateCreation
      } : null
    };
  } catch (error) {
    if (error && error.code === 'BWT_DUPLICATE_IDENTIFIER') {
      const resolution = connection
        ? existing
        : await resolveUnit({ ...body, lot_id: lotId }, { formOptions });
      throw new ApiUnitIntakeError(
        409,
        'UNIT_DUPLICATE_REVIEW_REQUIRED',
        'Another Unit now uses one or more supplied identifiers. BWTDallas did not create a duplicate Unit.',
        resolution
      );
    }

    if (error && error.code === 'BWT_DUPLICATE_IDENTIFIER_STORAGE_BLOCKED') {
      throw new ApiUnitIntakeError(409, 'DUPLICATE_IDENTIFIER_STORAGE_BLOCKED', error.message, existing);
    }

    if (error && error.code === 'BWT_LOT_DESTINATION_NOT_OPEN') {
      throw new ApiUnitIntakeError(422, 'LOT_NOT_ASSIGNABLE', error.message);
    }

    if (error && error.code === 'ER_BAD_NULL_ERROR' && /unit_category_config_value_id/i.test(String(error.message || ''))) {
      throw new ApiUnitIntakeError(
        422,
        'UNIT_CATEGORY_REQUIRED',
        'Unit Category is a Tool processing prerequisite for creating a new Unit. Supply unit_category_config_value_id from /api/v1/units/creation-options.'
      );
    }

    throw error;
  }
}


async function createUnitForCommit({ body = {}, userId, toolSource, connection }) {
  if (!connection) throw new Error('createUnitForCommit requires a caller-owned database transaction.');
  return createUnitInternal({ body, userId, toolSource, connection });
}

module.exports = {
  ApiUnitIntakeError,
  normalizeIdentity,
  resolveUnit,
  listCreationOptions,
  createUnitForCommit,
  serializeUnit
};
