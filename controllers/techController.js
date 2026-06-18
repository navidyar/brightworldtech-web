const techUnitModel = require('../models/techUnitModel');
const overrideRequestModel = require('../models/overrideRequestModel');
const unitExpandedDetailModel = require('../models/unitExpandedDetailModel');
const unitIssueEntryModel = require('../models/unitIssueEntryModel');
const unitExpandedFormModel = require('../models/unitExpandedFormModel');
const unitOutcomeModel = require('../models/unitOutcomeModel');

const VALID_MEMORY_INSTALL_TYPE_CODES = new Set([
  'removable_module',
  'integrated_soldered',
  'unknown'
]);

const DEFAULT_MEMORY_INSTALL_TYPE_CODE = 'removable_module';

function buildTechUnitsTableUrl(filters) {
  const params = new URLSearchParams();
  const passthroughKeys = [
    'search',
    'lotId',
    'categoryId',
    'gradeFilter',
    'techUserId',
    'createdStartDate',
    'createdEndDate',
    'createdWindow'
  ];

  passthroughKeys.forEach((key) => {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  });

  const queryString = params.toString();

  return queryString ? `/tech/units/table?${queryString}` : '/tech/units/table';
}


function userCanOverrideProductionWeight(req) {
  const roles = req && req.currentUser && Array.isArray(req.currentUser.roles)
    ? req.currentUser.roles
    : [];

  return roles.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function markProductionWeightPermission(formData, formOptions) {
  return {
    ...formData,
    canOverrideProductionWeight: Boolean(formOptions && formOptions.canOverrideProductionWeight)
  };
}

function getFiltersFromRequest(req) {
  return {
    search: String(req.query.search || '').trim(),
    lotId: String(req.query.lotId || '').trim(),
    categoryId: String(req.query.categoryId || '').trim(),
    gradeFilter: String(req.query.gradeFilter || '').trim(),
    techUserId: String(req.query.techUserId || '').trim(),
    createdStartDate: String(req.query.createdStartDate || '').trim(),
    createdEndDate: String(req.query.createdEndDate || '').trim(),
    createdWindow: String(req.query.createdWindow || '').trim()
  };
}

async function attachLatestOverrideHistory(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const latestOverrideMap = await overrideRequestModel.getLatestOverrideRequestMapForUnits(unitIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      latestOverride: latestOverrideMap.get(Number(unit.unitId)) || null
    }))
  };
}


async function attachExpandedUnitDetails(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const expandedDetailMap = await unitExpandedDetailModel.listExpandedDetailsForUnits(unitIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      expandedDetails: expandedDetailMap.get(Number(unit.unitId)) || null
    }))
  };
}

async function buildTechUnitsResult(filters) {
  const rawResult = await techUnitModel.listTechUnits(filters);

  return attachExpandedUnitDetails(rawResult);
}

function normalizeModuleRowsFromBody(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((row) => row && typeof row === 'object');
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter((row) => row && typeof row === 'object');
  }

  return [];
}

function normalizeModuleField(value) {
  return String(value || '').trim();
}

function normalizeMemoryInstallTypeCode(value) {
  const normalized = normalizeModuleField(value);

  return VALID_MEMORY_INSTALL_TYPE_CODES.has(normalized)
    ? normalized
    : DEFAULT_MEMORY_INSTALL_TYPE_CODE;
}

function getMemoryModulesFromRequest(req) {
  return normalizeModuleRowsFromBody(req.body.memoryModules).map((row) => ({
    slotLabel: normalizeModuleField(row.slotLabel),
    sizeGb: normalizeModuleField(row.sizeGb),
    ramTypeConfigValueId: normalizeModuleField(row.ramTypeConfigValueId),
    memoryInstallTypeCode: normalizeMemoryInstallTypeCode(row.memoryInstallTypeCode),
    speedMhz: normalizeModuleField(row.speedMhz),
    manufacturerName: normalizeModuleField(row.manufacturerName),
    partNumber: normalizeModuleField(row.partNumber),
    serialNumber: normalizeModuleField(row.serialNumber),
    changeNotes: normalizeModuleField(row.changeNotes)
  }));
}

function getStorageDevicesFromRequest(req) {
  return normalizeModuleRowsFromBody(req.body.storageDevices).map((row) => ({
    slotLabel: normalizeModuleField(row.slotLabel),
    sizeGb: normalizeModuleField(row.sizeGb),
    storageTypeConfigValueId: normalizeModuleField(row.storageTypeConfigValueId),
    manufacturerName: normalizeModuleField(row.manufacturerName),
    modelNumber: normalizeModuleField(row.modelNumber),
    serialNumber: normalizeModuleField(row.serialNumber),
    firmwareVersion: normalizeModuleField(row.firmwareVersion),
    wipeStatusConfigValueId: normalizeModuleField(row.wipeStatusConfigValueId),
    changeNotes: normalizeModuleField(row.changeNotes)
  }));
}

function getIssueRowsFromBody(value) {
  return normalizeModuleRowsFromBody(value);
}

function getCosmeticIssuesFromRequest(req) {
  return getIssueRowsFromBody(req.body.cosmeticIssues).map((row) => ({
    issueTypeConfigValueId: normalizeModuleField(row.issueTypeConfigValueId),
    severityConfigValueId: normalizeModuleField(row.severityConfigValueId),
    locationConfigValueId: normalizeModuleField(row.locationConfigValueId),
    issueRemark: normalizeModuleField(row.issueRemark)
  }));
}

function getHardwareIssuesFromRequest(req) {
  return getIssueRowsFromBody(req.body.hardwareIssues).map((row) => ({
    issueTypeConfigValueId: normalizeModuleField(row.issueTypeConfigValueId),
    customIssueLabel: normalizeModuleField(row.customIssueLabel),
    locationConfigValueId: normalizeModuleField(row.locationConfigValueId),
    issueRemark: normalizeModuleField(row.issueRemark)
  }));
}

function getIssueDetailsFromRequest(req) {
  return {
    cosmeticIssues: getCosmeticIssuesFromRequest(req),
    hardwareIssues: getHardwareIssuesFromRequest(req),
    generalCommentTypeConfigValueId: normalizeModuleField(req.body.generalCommentTypeConfigValueId),
    generalCommentText: normalizeModuleField(req.body.generalCommentText)
  };
}


function getGraphicsAdaptersFromRequest(req) {
  return normalizeModuleRowsFromBody(req.body.graphicsAdapters).map((row) => ({
    gpuTypeConfigValueId: normalizeModuleField(row.gpuTypeConfigValueId),
    gpuModel: normalizeModuleField(row.gpuModel),
    vramMb: normalizeModuleField(row.vramMb)
  }));
}

function getExpandedDetailsFromRequest(req) {
  return {
    overallGradeConfigValueId: normalizeModuleField(req.body.overallGradeConfigValueId),
    overallGradeNotes: normalizeModuleField(req.body.overallGradeNotes),
    biosVersion: normalizeModuleField(req.body.biosVersion),
    osBuild: normalizeModuleField(req.body.osBuild),
    absoluteStatusConfigValueId: normalizeModuleField(req.body.absoluteStatusConfigValueId),
    physicalCameraStatusConfigValueId: normalizeModuleField(req.body.physicalCameraStatusConfigValueId),
    touchscreenStatusConfigValueId: normalizeModuleField(req.body.touchscreenStatusConfigValueId),
    keyboardLanguageConfigValueId: normalizeModuleField(req.body.keyboardLanguageConfigValueId),
    completeDiagnosticsStatusConfigValueId: normalizeModuleField(req.body.completeDiagnosticsStatusConfigValueId),
    virusCheckStatusConfigValueId: normalizeModuleField(req.body.virusCheckStatusConfigValueId),
    driverCheckStatusConfigValueId: normalizeModuleField(req.body.driverCheckStatusConfigValueId),
    skinnedStatusConfigValueId: normalizeModuleField(req.body.skinnedStatusConfigValueId),
    graphicsAdapters: getGraphicsAdaptersFromRequest(req),
    outcomeCode: normalizeModuleField(req.body.outcomeCode),
    outcomeNotes: normalizeModuleField(req.body.outcomeNotes),
    outcomeApprovalRequested: req.body.outcomeApprovalRequested ? '1' : '',
    outcomeApprovalRequestNotes: normalizeModuleField(req.body.outcomeApprovalRequestNotes)
  };
}


function getPositiveIntegerOrBlank(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : trimmed;
}

function getModuleTotalGb(rows) {
  return rows.reduce((sum, row) => {
    const parsed = Number(row.sizeGb);

    return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum;
  }, 0);
}

function getUnitFormDataFromRequest(req) {
  const memoryModules = getMemoryModulesFromRequest(req);
  const storageDevices = getStorageDevicesFromRequest(req);
  const memoryTotalGb = getModuleTotalGb(memoryModules);
  const storageTotalGb = getModuleTotalGb(storageDevices);
  const issueDetails = getIssueDetailsFromRequest(req);
  const expandedDetails = getExpandedDetailsFromRequest(req);

  return {
    assetTag: String(req.body.assetTag || '').trim(),
    unitSerialNumber: String(req.body.unitSerialNumber || '').trim(),
    biosSerialNumber: String(req.body.biosSerialNumber || '').trim(),
    lotId: String(req.body.lotId || '').trim(),
    unitCategoryConfigValueId: String(req.body.unitCategoryConfigValueId || '').trim(),
    currentUnitStatusConfigValueId: String(req.body.currentUnitStatusConfigValueId || '').trim(),
    manufacturerId: String(req.body.manufacturerId || '').trim(),
    unitModelId: String(req.body.unitModelId || '').trim(),
    processorModelId: String(req.body.processorModelId || '').trim(),
    processorSpeedGhz: String(req.body.processorSpeedGhz || '').trim(),
    ramGb: memoryTotalGb > 0 ? String(memoryTotalGb) : String(req.body.ramGb || '').trim(),
    ramTypeConfigValueId: String(req.body.ramTypeConfigValueId || '').trim(),
    storageGb: storageTotalGb > 0 ? String(storageTotalGb) : String(req.body.storageGb || '').trim(),
    storageTypeConfigValueId: String(req.body.storageTypeConfigValueId || '').trim(),
    operatingSystemConfigValueId: String(req.body.operatingSystemConfigValueId || '').trim(),
    memoryModules,
    storageDevices,
    cosmeticIssues: issueDetails.cosmeticIssues,
    hardwareIssues: issueDetails.hardwareIssues,
    generalCommentTypeConfigValueId: issueDetails.generalCommentTypeConfigValueId,
    generalCommentText: issueDetails.generalCommentText,
    overallGradeConfigValueId: expandedDetails.overallGradeConfigValueId,
    overallGradeNotes: expandedDetails.overallGradeNotes,
    biosVersion: expandedDetails.biosVersion,
    osBuild: expandedDetails.osBuild,
    absoluteStatusConfigValueId: expandedDetails.absoluteStatusConfigValueId,
    physicalCameraStatusConfigValueId: expandedDetails.physicalCameraStatusConfigValueId,
    touchscreenStatusConfigValueId: expandedDetails.touchscreenStatusConfigValueId,
    keyboardLanguageConfigValueId: expandedDetails.keyboardLanguageConfigValueId,
    completeDiagnosticsStatusConfigValueId: expandedDetails.completeDiagnosticsStatusConfigValueId,
    virusCheckStatusConfigValueId: expandedDetails.virusCheckStatusConfigValueId,
    driverCheckStatusConfigValueId: expandedDetails.driverCheckStatusConfigValueId,
    skinnedStatusConfigValueId: expandedDetails.skinnedStatusConfigValueId,
    graphicsAdapters: expandedDetails.graphicsAdapters,
    outcomeCode: expandedDetails.outcomeCode,
    outcomeNotes: expandedDetails.outcomeNotes,
    outcomeApprovalRequested: expandedDetails.outcomeApprovalRequested,
    outcomeApprovalRequestNotes: expandedDetails.outcomeApprovalRequestNotes,
    productionWeightOverride: String(req.body.productionWeightOverride || '').trim(),
    productionWeightNotes: String(req.body.productionWeightNotes || '').trim(),
    hardwareNotes: String(req.body.hardwareNotes || '').trim(),
    cosmeticNotes: String(req.body.cosmeticNotes || '').trim()
  };
}

function isPositiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0;
}

function isPositiveOrZeroNumber(value) {
  if (!value) {
    return true;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0;
}

function isAssignableLotId(lotId, formOptions) {
  return formOptions.lots.some((lot) => String(lot.lot_id) === String(lotId));
}

function moduleRowHasAnyValue(row, ignoredFields = []) {
  const ignored = new Set(ignoredFields);

  return Object.entries(row || {}).some(([key, value]) => {
    if (ignored.has(key)) {
      return false;
    }

    return String(value || '').trim();
  });
}

function validateMemoryModules(formData) {
  const errors = [];

  (formData.memoryModules || []).forEach((moduleRow, index) => {
    if (!moduleRowHasAnyValue(moduleRow, ['slotLabel', 'memoryInstallTypeCode'])) {
      return;
    }

    const rowLabel = `Memory module ${index + 1}`;

    if (!moduleRow.sizeGb || !isPositiveInteger(moduleRow.sizeGb)) {
      errors.push(`${rowLabel} requires a valid positive memory size.`);
    }

    if (moduleRow.ramTypeConfigValueId && !isPositiveInteger(moduleRow.ramTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid memory type.`);
    }

    if (!VALID_MEMORY_INSTALL_TYPE_CODES.has(moduleRow.memoryInstallTypeCode || DEFAULT_MEMORY_INSTALL_TYPE_CODE)) {
      errors.push(`${rowLabel} has an invalid memory install type.`);
    }

    if (moduleRow.speedMhz && !isPositiveInteger(moduleRow.speedMhz)) {
      errors.push(`${rowLabel} speed must be a positive whole number.`);
    }

    if (moduleRow.slotLabel.length > 80) {
      errors.push(`${rowLabel} slot label must be 80 characters or fewer.`);
    }

    if (moduleRow.manufacturerName.length > 120 || moduleRow.partNumber.length > 120 || moduleRow.serialNumber.length > 120) {
      errors.push(`${rowLabel} manufacturer, part number, and serial number must each be 120 characters or fewer.`);
    }

    if (moduleRow.changeNotes.length > 500) {
      errors.push(`${rowLabel} notes must be 500 characters or fewer.`);
    }
  });

  return errors;
}

function validateStorageDevices(formData) {
  const errors = [];

  (formData.storageDevices || []).forEach((deviceRow, index) => {
    if (!moduleRowHasAnyValue(deviceRow, ['slotLabel'])) {
      return;
    }

    const rowLabel = `Storage device ${index + 1}`;

    if (!deviceRow.sizeGb || !isPositiveInteger(deviceRow.sizeGb)) {
      errors.push(`${rowLabel} requires a valid positive storage size.`);
    }

    if (deviceRow.storageTypeConfigValueId && !isPositiveInteger(deviceRow.storageTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid storage type.`);
    }

    if (deviceRow.wipeStatusConfigValueId && !isPositiveInteger(deviceRow.wipeStatusConfigValueId)) {
      errors.push(`${rowLabel} has an invalid wipe status.`);
    }

    if (deviceRow.slotLabel.length > 80) {
      errors.push(`${rowLabel} slot label must be 80 characters or fewer.`);
    }

    if (
      deviceRow.manufacturerName.length > 120 ||
      deviceRow.modelNumber.length > 120 ||
      deviceRow.serialNumber.length > 120 ||
      deviceRow.firmwareVersion.length > 120
    ) {
      errors.push(`${rowLabel} manufacturer, model, serial, and firmware fields must each be 120 characters or fewer.`);
    }

    if (deviceRow.changeNotes.length > 500) {
      errors.push(`${rowLabel} notes must be 500 characters or fewer.`);
    }
  });

  return errors;
}

function issueRowHasAnyValue(row) {
  return Object.values(row || {}).some((value) => String(value || '').trim());
}

function validateIssueDetails(formData) {
  const errors = [];

  (formData.cosmeticIssues || []).forEach((issueRow, index) => {
    if (!issueRowHasAnyValue(issueRow)) {
      return;
    }

    const rowLabel = `Cosmetic issue ${index + 1}`;

    if (!issueRow.issueTypeConfigValueId || !isPositiveInteger(issueRow.issueTypeConfigValueId)) {
      errors.push(`${rowLabel} requires a valid issue type.`);
    }

    if (!issueRow.severityConfigValueId || !isPositiveInteger(issueRow.severityConfigValueId)) {
      errors.push(`${rowLabel} requires a valid severity.`);
    }

    if (!issueRow.locationConfigValueId || !isPositiveInteger(issueRow.locationConfigValueId)) {
      errors.push(`${rowLabel} requires a valid location.`);
    }

    if (issueRow.issueRemark.length > 500) {
      errors.push(`${rowLabel} remarks must be 500 characters or fewer.`);
    }
  });

  (formData.hardwareIssues || []).forEach((issueRow, index) => {
    if (!issueRowHasAnyValue(issueRow)) {
      return;
    }

    const rowLabel = `Hardware issue ${index + 1}`;

    if (issueRow.issueTypeConfigValueId && !isPositiveInteger(issueRow.issueTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid configured issue type.`);
    }

    if (!issueRow.issueTypeConfigValueId && !issueRow.customIssueLabel) {
      errors.push(`${rowLabel} requires either a configured issue type or a custom issue.`);
    }

    if (issueRow.customIssueLabel.length > 120) {
      errors.push(`${rowLabel} custom issue must be 120 characters or fewer.`);
    }

    if (issueRow.locationConfigValueId && !isPositiveInteger(issueRow.locationConfigValueId)) {
      errors.push(`${rowLabel} has an invalid location.`);
    }

    if (issueRow.issueRemark.length > 500) {
      errors.push(`${rowLabel} remarks must be 500 characters or fewer.`);
    }
  });

  if (formData.generalCommentTypeConfigValueId && !isPositiveInteger(formData.generalCommentTypeConfigValueId)) {
    errors.push('General comment type is invalid.');
  }

  if (formData.generalCommentText && formData.generalCommentText.length > 2000) {
    errors.push('General comment must be 2000 characters or fewer.');
  }

  return errors;
}

function validateExpandedDetails(formData) {
  const errors = [];
  const configFieldLabels = [
    ['overallGradeConfigValueId', 'Overall Unit Grade'],
    ['absoluteStatusConfigValueId', 'Absolute status'],
    ['physicalCameraStatusConfigValueId', 'Physical camera status'],
    ['touchscreenStatusConfigValueId', 'Touchscreen status'],
    ['keyboardLanguageConfigValueId', 'Keyboard language'],
    ['completeDiagnosticsStatusConfigValueId', 'Complete diagnostics status'],
    ['virusCheckStatusConfigValueId', 'Virus check status'],
    ['driverCheckStatusConfigValueId', 'Driver check status'],
    ['skinnedStatusConfigValueId', 'Skinned status']
  ];

  configFieldLabels.forEach(([fieldName, label]) => {
    if (formData[fieldName] && !isPositiveInteger(formData[fieldName])) {
      errors.push(`${label} is invalid.`);
    }
  });

  if (formData.overallGradeNotes && formData.overallGradeNotes.length > 500) {
    errors.push('Cosmetic grade notes must be 500 characters or fewer.');
  }

  const normalizedOutcomeCode = unitOutcomeModel.normalizeOutcomeCode(formData.outcomeCode);
  const outcomeApprovalRequested = unitOutcomeModel.normalizeApprovalRequested(formData.outcomeApprovalRequested);

  if (formData.outcomeCode && !normalizedOutcomeCode) {
    errors.push('Unit outcome must be Pass or Fail.');
  }

  if (outcomeApprovalRequested && !normalizedOutcomeCode) {
    errors.push('Choose Pass or Fail before requesting outcome approval.');
  }

  if (formData.outcomeNotes && formData.outcomeNotes.length > 500) {
    errors.push('Unit outcome notes must be 500 characters or fewer.');
  }

  if (formData.outcomeApprovalRequestNotes && formData.outcomeApprovalRequestNotes.length > 1000) {
    errors.push('Outcome approval request notes must be 1000 characters or fewer.');
  }

  if (formData.biosVersion && formData.biosVersion.length > 100) {
    errors.push('BIOS version must be 100 characters or fewer.');
  }

  if (formData.osBuild && formData.osBuild.length > 100) {
    errors.push('OS build must be 100 characters or fewer.');
  }

  (formData.graphicsAdapters || []).forEach((graphicsAdapter, index) => {
    if (!moduleRowHasAnyValue(graphicsAdapter)) {
      return;
    }

    const rowLabel = `Graphics adapter ${index + 1}`;

    if (graphicsAdapter.gpuTypeConfigValueId && !isPositiveInteger(graphicsAdapter.gpuTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid GPU type.`);
    }

    if (graphicsAdapter.gpuModel.length > 150) {
      errors.push(`${rowLabel} model must be 150 characters or fewer.`);
    }

    if (graphicsAdapter.vramMb) {
      const parsedVram = Number(graphicsAdapter.vramMb);

      if (!Number.isInteger(parsedVram) || parsedVram < 0) {
        errors.push(`${rowLabel} VRAM must be a non-negative whole number of MB.`);
      }
    }
  });

  return errors;
}

function validateUnitForm(formData, formOptions, mode) {
  const errors = [];

  if (!formOptions.supported) {
    errors.push(formOptions.message || 'The units table is not ready yet.');
    return errors;
  }

  if (!formData.lotId || !isPositiveInteger(formData.lotId)) {
    errors.push('A valid assignable lot is required.');
  } else if (!isAssignableLotId(formData.lotId, formOptions)) {
    errors.push('Units can only be assigned to lots that do not have child lots. Choose a more specific child lot, or choose a standalone lot with no children.');
  }

  if (!formData.unitCategoryConfigValueId || !isPositiveInteger(formData.unitCategoryConfigValueId)) {
    errors.push('Unit category is required.');
  }

  if (!formData.currentUnitStatusConfigValueId || !isPositiveInteger(formData.currentUnitStatusConfigValueId)) {
    errors.push('Unit status is required.');
  }

  if (mode === 'create' && formData.assetTag && !techUnitModel.normalizeAssetTagInput(formData.assetTag)) {
    errors.push(`Asset tag must be a positive number with or without the ${formOptions.assetTagPrefix} prefix.`);
  }

  if (formData.unitSerialNumber.length > 150) {
    errors.push('Unit serial number must be 150 characters or fewer.');
  }

  if (formData.biosSerialNumber.length > 150) {
    errors.push('BIOS serial number must be 150 characters or fewer.');
  }

  if (formData.ramGb && !isPositiveInteger(formData.ramGb)) {
    errors.push('Memory total must be a positive whole number.');
  }

  if (formData.storageGb && !isPositiveInteger(formData.storageGb)) {
    errors.push('Storage GB must be a positive whole number.');
  }

  if (!isPositiveOrZeroNumber(formData.processorSpeedGhz)) {
    errors.push('Processor speed must be a valid number.');
  }

  if (formData.hardwareNotes.length > 1000) {
    errors.push('Hardware notes must be 1000 characters or fewer.');
  }

  if (formData.cosmeticNotes.length > 1000) {
    errors.push('Cosmetic notes must be 1000 characters or fewer.');
  }

  if (formOptions.canOverrideProductionWeight && formData.productionWeightOverride && !isPositiveOrZeroNumber(formData.productionWeightOverride)) {
    errors.push('Production weight override must be a valid non-negative number.');
  }

  if (formOptions.canOverrideProductionWeight && formData.productionWeightNotes && formData.productionWeightNotes.length > 500) {
    errors.push('Production weight notes must be 500 characters or fewer.');
  }

  errors.push(...validateMemoryModules(formData));
  errors.push(...validateStorageDevices(formData));
  errors.push(...validateIssueDetails(formData));
  errors.push(...validateExpandedDetails(formData));

  return errors;
}

function getFriendlySaveError(error, formOptions) {
  if (error && error.code === 'BWT_DUPLICATE_IDENTIFIER') {
    return techUnitModel.getDuplicateUnitMessage(error.duplicateMatches, formOptions.assetTagPrefix);
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return `That asset tag or identifier already exists. Search for the existing unit before creating a duplicate.`;
  }

  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return 'One of the selected dropdown values no longer exists. Refresh the page and try again.';
  }

  return null;
}


function isDuplicateIdentifierError(error) {
  return Boolean(error && error.code === 'BWT_DUPLICATE_IDENTIFIER' && Array.isArray(error.duplicateMatches));
}

function getDuplicateMatches(error) {
  return isDuplicateIdentifierError(error) ? error.duplicateMatches : [];
}

async function renderDuplicateUnitModal(res, { formOptions, formData, duplicateMatches, errorMessages = [] }) {
  return res.render('fragments/tech-unit-duplicate-modal', {
    pageTitle: 'Possible Existing Unit Found',
    formOptions,
    formData,
    duplicateMatches,
    errorMessages
  });
}

async function getTechUnitFormOptionsWithIssues(req = null) {
  const formOptions = await techUnitModel.getTechUnitFormOptions();
  const issueFormOptions = await unitIssueEntryModel.getIssueFormOptions();
  const expandedFormOptions = await unitExpandedFormModel.getExpandedFormOptions();

  return {
    ...formOptions,
    ...issueFormOptions,
    ...expandedFormOptions,
    canOverrideProductionWeight: userCanOverrideProductionWeight(req)
  };
}

async function buildEditFormData(unitId, formOptions) {
  const unitFormData = await techUnitModel.getUnitFormDataById(unitId, formOptions);

  if (!unitFormData) {
    return null;
  }

  const issueFormData = await unitIssueEntryModel.getIssueFormDataByUnitId(unitId);
  const expandedFormData = await unitExpandedFormModel.getExpandedFormDataByUnitId(unitId);

  return {
    ...unitFormData,
    ...issueFormData,
    ...expandedFormData,
    generalCommentTypeConfigValueId: issueFormData.generalCommentTypeConfigValueId || formOptions.defaultCommentTypeConfigValueId || '',
    generalCommentText: ''
  };
}

async function saveIssueDetailsIfPossible(unitId, formData, currentUserId) {
  const safeUnitId = Number(unitId);

  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return;
  }

  await unitIssueEntryModel.saveIssueDetailsForUnit({
    unitId: safeUnitId,
    formData,
    currentUserId
  });
}

async function saveExpandedDetailsIfPossible(unitId, formData, currentUserId) {
  const safeUnitId = Number(unitId);

  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) {
    return;
  }

  await unitExpandedFormModel.saveExpandedDetailsForUnit({
    unitId: safeUnitId,
    formData,
    currentUserId
  });
}

async function getBlankFormDataWithDefaults(req = null) {
  const formOptions = await getTechUnitFormOptionsWithIssues(req);

  return {
    formOptions,
    formData: {
      ...techUnitModel.getBlankUnitFormData(formOptions),
      ...unitIssueEntryModel.getBlankIssueFormData(),
      ...unitExpandedFormModel.getBlankExpandedFormData(),
      generalCommentTypeConfigValueId: formOptions.defaultCommentTypeConfigValueId || '',
      generalCommentText: ''
    }
  };
}

async function renderTechUnitsPage(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('pages/tech-units', {
      pageTitle: 'Tech Units',
      currentNav: 'tech-units',
      result,
      filters,
      tableUrl: buildTechUnitsTableUrl(filters),
      successMessage: req.query.created === '1'
        ? 'Unit created successfully.'
        : req.query.updated === '1'
          ? 'Unit updated successfully.'
          : req.query.archived === '1'
            ? 'Unit archived successfully. Search by an identifier to retrieve the retained record.'
            : null
    });
  } catch (error) {
    next(error);
  }
}

async function renderTechUnitsTable(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('fragments/tech-units-table', {
      result,
      filters
    });
  } catch (error) {
    next(error);
  }
}

async function renderTechUnitHistoryPanel(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-history-panel', {
        unitId: null,
        historyDetails: {
          schemaReady: false,
          gradeHistory: [],
          memoryHistory: [],
          storageHistory: [],
          hardwareIssueHistory: [],
          cosmeticIssueHistory: []
        },
        overrideHistory: {
          supported: false,
          requests: []
        },
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const historyDetails = await unitExpandedDetailModel.getHistoryDetailsForUnit(unitId);
    const overrideHistory = await overrideRequestModel.listOverrideRequestsForUnit(unitId, 25);

    return res.render('fragments/tech-unit-history-panel', {
      unitId,
      historyDetails,
      overrideHistory,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


async function renderArchiveTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-delete-modal', {
        unit: null,
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const unit = await techUnitModel.getTechUnitDeleteSummaryById(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-delete-modal', {
        unit: null,
        errorMessages: ['The selected unit could not be found.']
      });
    }

    return res.render('fragments/tech-unit-delete-modal', {
      unit,
      errorMessages: unit.isArchived
        ? ['This unit is already archived. Search by identifier to view its retained details.']
        : unit.archiveSupported
          ? []
          : ['Unit archiving is not ready yet. Run the Step 6f archive SQL migration before archiving units.']
    });
  } catch (error) {
    next(error);
  }
}

async function archiveTechUnit(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-delete-modal', {
        unit: null,
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const unit = await techUnitModel.getTechUnitDeleteSummaryById(unitId);

    if (!unit) {
      if (req.get('HX-Request') === 'true') {
        res.set('HX-Trigger', 'unit-saved, unit-archived');
        return res.send('');
      }

      return res.redirect('/tech/units?archived=1');
    }

    if (unit.isArchived) {
      return res.status(400).render('fragments/tech-unit-delete-modal', {
        unit,
        errorMessages: ['This unit is already archived. Search by identifier to view its retained details.']
      });
    }

    const archiveResult = await techUnitModel.archiveTechUnit(unitId, req.currentUser.user_id);

    if (!archiveResult.archived) {
      const errorMessage = archiveResult.reason === 'archive_migration_required'
        ? 'Unit archiving is not ready yet. Run the Step 6f archive SQL migration before archiving units.'
        : 'The unit could not be archived. Refresh the page and try again.';

      return res.status(400).render('fragments/tech-unit-delete-modal', {
        unit,
        errorMessages: [errorMessage]
      });
    }

    if (req.get('HX-Request') === 'true') {
      res.set('HX-Trigger', 'unit-saved, unit-archived');
      return res.send('');
    }

    return res.redirect('/tech/units?archived=1');
  } catch (error) {
    next(error);
  }
}

async function renderNewTechUnitPage(req, res, next) {
  try {
    const { formOptions, formData } = await getBlankFormDataWithDefaults(req);

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Create Unit',
      currentNav: 'tech-units',
      mode: 'create',
      formAction: '/tech/units',
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderNewTechUnitModal(req, res, next) {
  try {
    const { formOptions, formData } = await getBlankFormDataWithDefaults(req);

    return res.render('fragments/tech-unit-modal', {
      pageTitle: 'Create Unit',
      mode: 'create',
      formAction: '/tech/units/modal',
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function createTechUnit(req, res, next) {
  try {
    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions);
    const errorMessages = validateUnitForm(formData, formOptions, 'create');

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Create Unit',
        currentNav: 'tech-units',
        mode: 'create',
        formAction: '/tech/units',
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      const savedUnitId = await techUnitModel.createTechUnit(formData, req.currentUser.user_id);
      await saveIssueDetailsIfPossible(savedUnitId, formData, req.currentUser.user_id);
      await saveExpandedDetailsIfPossible(savedUnitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.status(400).render('pages/tech-unit-form', {
          pageTitle: 'Create Unit',
          currentNav: 'tech-units',
          mode: 'create',
          formAction: '/tech/units',
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    return res.redirect('/tech/units?created=1');
  } catch (error) {
    next(error);
  }
}

async function createTechUnitModal(req, res, next) {
  try {
    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions);
    const errorMessages = validateUnitForm(formData, formOptions, 'create');

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Create Unit',
        mode: 'create',
        formAction: '/tech/units/modal',
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      const savedUnitId = await techUnitModel.createTechUnit(formData, req.currentUser.user_id);
      await saveIssueDetailsIfPossible(savedUnitId, formData, req.currentUser.user_id);
      await saveExpandedDetailsIfPossible(savedUnitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: getDuplicateMatches(saveError),
          errorMessages: []
        });
      }

      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Create Unit',
          mode: 'create',
          formAction: '/tech/units/modal',
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

async function useExistingTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'create',
        formAction: '/tech/units/modal',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          storageWipeStatuses: [],
          operatingSystems: [],
          cosmeticIssueTypes: [],
          hardwareIssueTypes: [],
          issueLocations: [],
          issueSeverities: [],
          commentTypes: [],
          defaultCommentTypeConfigValueId: '',
          overallGradeOptions: [],
          absoluteStatusOptions: [],
          physicalCameraStatusOptions: [],
          touchscreenStatusOptions: [],
          keyboardLanguageOptions: [],
          diagnosticsStatusOptions: [],
          virusCheckStatusOptions: [],
          driverCheckStatusOptions: [],
          skinnedStatusOptions: [],
          gpuTypeOptions: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return renderDuplicateUnitModal(res, {
        formOptions,
        formData,
        duplicateMatches: [],
        errorMessages
      });
    }

    try {
      await techUnitModel.useExistingTechUnit(unitId, formData, req.currentUser.user_id);
      await saveIssueDetailsIfPossible(unitId, formData, req.currentUser.user_id);
      await saveExpandedDetailsIfPossible(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: getDuplicateMatches(saveError),
          errorMessages: ['Another matching unit was found while updating the existing unit. Review the matches before continuing.']
        });
      }

      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return renderDuplicateUnitModal(res, {
          formOptions,
          formData,
          duplicateMatches: [],
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

async function renderEditTechUnitPage(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = await buildEditFormData(unitId, formOptions);

    if (!formData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Edit Unit',
      currentNav: 'tech-units',
      mode: 'edit',
      formAction: `/tech/units/${unitId}`,
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderEditTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          storageWipeStatuses: [],
          operatingSystems: [],
          cosmeticIssueTypes: [],
          hardwareIssueTypes: [],
          issueLocations: [],
          issueSeverities: [],
          commentTypes: [],
          defaultCommentTypeConfigValueId: '',
          overallGradeOptions: [],
          absoluteStatusOptions: [],
          physicalCameraStatusOptions: [],
          touchscreenStatusOptions: [],
          keyboardLanguageOptions: [],
          diagnosticsStatusOptions: [],
          virusCheckStatusOptions: [],
          driverCheckStatusOptions: [],
          skinnedStatusOptions: [],
          gpuTypeOptions: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = await buildEditFormData(unitId, formOptions);

    if (!formData) {
      return res.status(404).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions,
        formData: techUnitModel.getBlankUnitFormData(formOptions),
        errorMessages: ['The selected unit could not be found.']
      });
    }

    return res.render('fragments/tech-unit-modal', {
      pageTitle: 'Edit Unit',
      mode: 'edit',
      formAction: `/tech/units/${unitId}/modal`,
      formOptions,
      formData,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function updateTechUnit(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Edit Unit',
        currentNav: 'tech-units',
        mode: 'edit',
        formAction: `/tech/units/${unitId}`,
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);
    await saveIssueDetailsIfPossible(unitId, formData, req.currentUser.user_id);
      await saveExpandedDetailsIfPossible(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.status(400).render('pages/tech-unit-form', {
          pageTitle: 'Edit Unit',
          currentNav: 'tech-units',
          mode: 'edit',
          formAction: `/tech/units/${unitId}`,
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    return res.redirect('/tech/units?updated=1');
  } catch (error) {
    next(error);
  }
}

async function updateTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions: {
          supported: false,
          message: 'The selected unit ID is invalid.',
          assetTagPrefix: techUnitModel.getAssetTagPrefix(),
          lots: [],
          unitCategories: [],
          unitStatuses: [],
          manufacturers: [],
          unitModels: [],
          processorModels: [],
          ramTypes: [],
          storageTypes: [],
          storageWipeStatuses: [],
          operatingSystems: [],
          cosmeticIssueTypes: [],
          hardwareIssueTypes: [],
          issueLocations: [],
          issueSeverities: [],
          commentTypes: [],
          defaultCommentTypeConfigValueId: '',
          overallGradeOptions: [],
          absoluteStatusOptions: [],
          physicalCameraStatusOptions: [],
          touchscreenStatusOptions: [],
          keyboardLanguageOptions: [],
          diagnosticsStatusOptions: [],
          virusCheckStatusOptions: [],
          driverCheckStatusOptions: [],
          skinnedStatusOptions: [],
          gpuTypeOptions: []
        },
        formData: techUnitModel.getBlankUnitFormData(),
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions);
    const errorMessages = validateUnitForm(formData, formOptions, 'edit');

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Edit Unit',
        mode: 'edit',
        formAction: `/tech/units/${unitId}/modal`,
        formOptions,
        formData,
        errorMessages
      });
    }

    try {
      await techUnitModel.updateTechUnit(unitId, formData, req.currentUser.user_id);
    await saveIssueDetailsIfPossible(unitId, formData, req.currentUser.user_id);
      await saveExpandedDetailsIfPossible(unitId, formData, req.currentUser.user_id);
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Edit Unit',
          mode: 'edit',
          formAction: `/tech/units/${unitId}/modal`,
          formOptions,
          formData,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}


function getOutcomeApprovalNotes(req) {
  return String(req.body.approvalNotes || '').trim();
}

async function renderOutcomeApprovalModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-outcome-approval-modal', {
        unit: null,
        currentOutcome: null,
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const unit = await techUnitModel.getTechUnitDeleteSummaryById(unitId);
    const currentOutcome = await unitOutcomeModel.getCurrentOutcomeByUnitId(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-outcome-approval-modal', {
        unit: null,
        currentOutcome: null,
        errorMessages: ['The selected unit could not be found.']
      });
    }

    if (!currentOutcome || !currentOutcome.isPendingApproval) {
      return res.status(400).render('fragments/tech-unit-outcome-approval-modal', {
        unit,
        currentOutcome,
        errorMessages: ['This unit does not have a pending Pass/Fail approval request.']
      });
    }

    return res.render('fragments/tech-unit-outcome-approval-modal', {
      unit,
      currentOutcome,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function approveOutcomeRequest(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-outcome-approval-modal', {
        unit: null,
        currentOutcome: null,
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const unit = await techUnitModel.getTechUnitDeleteSummaryById(unitId);
    const currentOutcome = await unitOutcomeModel.getCurrentOutcomeByUnitId(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-outcome-approval-modal', {
        unit: null,
        currentOutcome: null,
        errorMessages: ['The selected unit could not be found.']
      });
    }

    if (!currentOutcome || !currentOutcome.isPendingApproval) {
      return res.status(400).render('fragments/tech-unit-outcome-approval-modal', {
        unit,
        currentOutcome,
        errorMessages: ['This unit does not have a pending Pass/Fail approval request.']
      });
    }

    const approved = await unitOutcomeModel.approveCurrentOutcome({
      unitId,
      approvedByUserId: req.currentUser.user_id,
      approvalNotes: getOutcomeApprovalNotes(req)
    });

    if (!approved) {
      return res.status(409).render('fragments/tech-unit-outcome-approval-modal', {
        unit,
        currentOutcome,
        errorMessages: ['This approval request may have already been reviewed. Refresh the Unit Browser and try again.']
      });
    }

    res.set('HX-Trigger', 'unit-saved');
    return res.send('');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderTechUnitsPage,
  renderTechUnitsTable,
  renderTechUnitHistoryPanel,
  renderArchiveTechUnitModal,
  archiveTechUnit,
  renderNewTechUnitPage,
  renderNewTechUnitModal,
  createTechUnit,
  createTechUnitModal,
  useExistingTechUnitModal,
  renderEditTechUnitPage,
  renderEditTechUnitModal,
  updateTechUnit,
  updateTechUnitModal,
  renderOutcomeApprovalModal,
  approveOutcomeRequest
};
