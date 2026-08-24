const crypto = require('crypto');
const techUnitModel = require('../models/techUnitModel');
const lotModel = require('../models/lotModel');
const overrideRequestModel = require('../models/overrideRequestModel');
const unitRequestModel = require('../models/unitRequestModel');
const unitExpandedDetailModel = require('../models/unitExpandedDetailModel');
const unitIssueEntryModel = require('../models/unitIssueEntryModel');
const unitExpandedFormModel = require('../models/unitExpandedFormModel');
const unitOutcomeModel = require('../models/unitOutcomeModel');
const lotUnitFormProfileModel = require('../models/lotUnitFormProfileModel');
const techLotRequirementModel = require('../models/techLotRequirementModel');
const lotValidationOverrideModel = require('../models/lotValidationOverrideModel');
const unitAuditEventModel = require('../models/unitAuditEventModel');
const unitQcCheckModel = require('../models/unitQcCheckModel');
const unitQcCorrectionModel = require('../models/unitQcCorrectionModel');
const unitExportService = require('../services/unitExportService');
const unitExportFileService = require('../services/unitExportFileService');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { UNIT_FORM_FIELD_REGISTRY } = require('../config/unitFormFieldRegistry');
const qcGradingModel = require('../models/qcGradingModel');
const unitLotDestinationValidationModel = require('../models/unitLotDestinationValidationModel');
const { buildUnitFormProfilePresentation } = require('../services/unitFormProfilePresentation');
const { getBlockingMessage: getLotRequirementBlockingMessage } = require('../services/techLotRequirementWorkflow');
const { buildUnitFormAuditEvent } = require('../services/unitAuditSnapshot');
const { buildUnitHistoryTimeline } = require('../services/unitHistoryTimeline');
const { buildQcStatusPresentation } = require('../services/qcStatusPresentation');
const { getQcReviewActionAvailability } = require('../services/qcReviewActionAvailability');
const { buildUnitWeightBrowserPresentation } = require('../services/unitWeightBrowserPresentation');
const catalogRequestAccessPolicy = require('../services/catalogRequestAccessPolicy');
const {
  parseHardwareCapacityToGb,
  normalizeHardwareCapacityForStorage
} = require('../services/hardwareCapacity');
const {
  subscribeToUnitBrowserChanges,
  publishUnitBrowserChange
} = require('../services/unitBrowserRealtime');
const {
  applyUnitFormSubmissionPolicy,
  buildManagedValidationFormData
} = require('../services/unitFormSubmissionPolicy');
const {
  canChooseCompletionAttribution,
  getAllowedCompletionUserIds,
  resolveCompletionUserId
} = require('../services/completionAttributionPolicy');

const VALID_MEMORY_INSTALL_TYPE_CODES = new Set([
  'removable_module',
  'integrated_soldered',
  'unknown'
]);


function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function canViewCrossTechnicianQcSummary(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management', 'tech_lead', 'qc'].includes(roleCode));
}

function resolveQcSummaryTechnicianUserId(req) {
  const currentUserId = normalizePositiveInteger(req && req.currentUser ? req.currentUser.user_id : null);

  if (!canViewCrossTechnicianQcSummary(req)) {
    return currentUserId;
  }

  return normalizePositiveInteger(req && req.query ? req.query.techUserId : null);
}

function buildTechUnitsQcSummaryUrl(filters = {}, req = null) {
  const params = new URLSearchParams();
  const selectedTechnicianUserId = canViewCrossTechnicianQcSummary(req)
    ? normalizePositiveInteger(filters.techUserId)
    : null;

  if (selectedTechnicianUserId) {
    params.set('techUserId', String(selectedTechnicianUserId));
  }

  const queryString = params.toString();
  return queryString ? `/tech/units/qc-summary?${queryString}` : '/tech/units/qc-summary';
}

function buildTechUnitsTableUrl(filters, pathname = '/tech/units/table') {
  const params = new URLSearchParams();
  const passthroughKeys = [
    'search',
    'lotId',
    'lotScope',
    'categoryId',
    'gradeFilter',
    'completionFilter',
    'qcReviewFilter',
    'techUserId',
    'createdStartDate',
    'createdEndDate',
    'createdWindow',
    'unitState',
    'sort',
    'page',
    'perPage'
  ];

  passthroughKeys.forEach((key) => {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  });

  const queryString = params.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

const TECH_UNIT_EXPORT_FILTER_KEYS = Object.freeze([
  'search',
  'lotId',
  'lotScope',
  'categoryId',
  'gradeFilter',
  'completionFilter',
  'qcReviewFilter',
  'techUserId',
  'createdStartDate',
  'createdEndDate',
  'createdWindow',
  'unitState',
  'sort'
]);

function buildTechUnitsExportUrl(pathname, filters = {}) {
  const params = new URLSearchParams();

  TECH_UNIT_EXPORT_FILTER_KEYS.forEach((key) => {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  });

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function buildTechUnitsExportPreviewUrl(filters) {
  return buildTechUnitsExportUrl('/tech/units/export/preview', filters);
}

function buildTechUnitsExportDownloadUrl(format, filters) {
  return buildTechUnitsExportUrl(`/tech/units/export/${format}`, filters);
}


function getCurrentRoleCodes(req) {
  return req && req.currentUser && Array.isArray(req.currentUser.roles)
    ? req.currentUser.roles
    : [];
}

function userCanViewProductionWeight(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function userCanOverrideProductionWeight(req) {
  return userCanViewProductionWeight(req);
}

function canRequestCatalogException(req) {
  return catalogRequestAccessPolicy.canSubmitCatalogRequest(getCurrentRoleCodes(req));
}

function markProductionWeightPermission(formData, formOptions, { allowOverrideInput = true } = {}) {
  const canOverrideProductionWeight = Boolean(
    allowOverrideInput
    && formOptions
    && formOptions.canOverrideProductionWeight
  );

  return {
    ...formData,
    productionWeightOverride: canOverrideProductionWeight ? formData.productionWeightOverride : '',
    productionWeightNotes: canOverrideProductionWeight ? formData.productionWeightNotes : '',
    canOverrideProductionWeight
  };
}


function redactProductionWeightFromTimeline(timeline) {
  const safeTimeline = timeline || {};
  const events = (Array.isArray(safeTimeline.events) ? safeTimeline.events : []).map((event) => ({
    ...event,
    changes: (Array.isArray(event.changes) ? event.changes : []).filter((change) => !/production weight|production credit|current lot weight/i.test(String(change.label || ''))),
    notes: (Array.isArray(event.notes) ? event.notes : []).filter((note) => !/^prior tech credit:/i.test(String(note || '').trim()))
  }));

  return {
    ...safeTimeline,
    events,
    totalChanges: events.reduce((sum, event) => sum + (Array.isArray(event.changes) ? event.changes.length : 0), 0)
  };
}

function isHtmxRequest(req) {
  return req.get('HX-Request') === 'true';
}

function getDuplicateAssumptionCreateNonce(req) {
  if (!req || !req.session) {
    return '';
  }

  if (!req.session.duplicateAssumptionCreateNonce) {
    req.session.duplicateAssumptionCreateNonce = crypto.randomUUID();
  }

  return String(req.session.duplicateAssumptionCreateNonce);
}

function hasValidDuplicateAssumptionCreateNonce(req, nonce) {
  return Boolean(
    req
    && req.session
    && req.session.duplicateAssumptionCreateNonce
    && nonce
    && String(req.session.duplicateAssumptionCreateNonce) === String(nonce)
  );
}

function getCurrentUserDisplayName(req) {
  const currentUser = req && req.currentUser ? req.currentUser : {};
  const fullName = [currentUser.first_name, currentUser.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || currentUser.email || 'Current user';
}

function buildCompleteWorkModalView({
  preview = null,
  req = null,
  selectedCompletedByUserId = null,
  successMessage = null,
  errorMessages = []
} = {}) {
  const safePreview = preview || {
    ready: false,
    unitId: null,
    unitLabel: 'Unit not found',
    lotName: 'Unknown lot',
    productionWeight: null,
    formattedProductionWeight: '—',
    errorMessage: ''
  };
  const currentUserId = normalizePositiveInteger(req && req.currentUser ? req.currentUser.user_id : null);
  const currentUserName = getCurrentUserDisplayName(req);
  const assignedUserId = normalizePositiveInteger(safePreview.assignedToUserId);
  const assignedUserName = String(safePreview.assignedToName || '').trim();
  const roleCodes = getCurrentRoleCodes(req);
  const allowedUserIds = getAllowedCompletionUserIds({
    currentUserId,
    assignedUserId,
    roleCodes
  });
  const defaultCompletedByUserId = allowedUserIds[0] || currentUserId;
  const normalizedSelectedUserId = normalizePositiveInteger(selectedCompletedByUserId);
  const effectiveCompletedByUserId = normalizedSelectedUserId && allowedUserIds.includes(normalizedSelectedUserId)
    ? normalizedSelectedUserId
    : defaultCompletedByUserId;
  const completionAttributionOptions = allowedUserIds.map((userId) => ({
    userId,
    name: userId === assignedUserId && assignedUserName ? assignedUserName : currentUserName,
    isAssignedUser: userId === assignedUserId,
    isCurrentUser: userId === currentUserId
  }));
  const selectedOption = completionAttributionOptions.find((option) => option.userId === effectiveCompletedByUserId) || null;

  return {
    preview: safePreview,
    creditedToName: selectedOption ? selectedOption.name : currentUserName,
    currentUserName,
    completionAttributionOptions,
    canChooseCompletionAttribution: canChooseCompletionAttribution(roleCodes) && completionAttributionOptions.length > 1,
    selectedCompletedByUserId: effectiveCompletedByUserId,
    canViewProductionWeight: userCanViewProductionWeight(req),
    successMessage,
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

function buildReverseCompletionModalView({
  preview = null,
  reason = '',
  successMessage = null,
  errorMessages = []
} = {}) {
  return {
    preview: preview || {
      ready: false,
      unitId: null,
      unitWorkCompletionId: null,
      unitLabel: 'Unit not found',
      lotName: 'Unknown lot',
      completedByName: 'Unknown user',
      completedAt: null,
      formattedProductionWeight: '—',
      errorMessage: ''
    },
    reason: String(reason || ''),
    successMessage,
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

function canViewParkedUnits(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function canSearchParkedUnits(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management', 'tech_lead', 'tech'].includes(roleCode));
}

function canViewAnyLotFilter(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management'].includes(roleCode));
}

function canExportTechUnits(req) {
  return getCurrentRoleCodes(req)
    .some((roleCode) => ['admin', 'management'].includes(roleCode));
}

function getUnitExportColumnSelection(req) {
  const query = req && req.query ? req.query : {};

  return {
    value: query.columns,
    selectionProvided: Object.prototype.hasOwnProperty.call(query, 'columns')
  };
}

function isRegularTechUnitBrowserUser(req) {
  const roleCodes = getCurrentRoleCodes(req);

  return roleCodes.includes('tech')
    && !roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead', 'qc'].includes(roleCode));
}

function getFiltersFromRequest(req) {
  return {
    search: String(req.query.search || '').trim(),
    lotId: String(req.query.lotId || '').trim(),
    lotScope: String(req.query.lotScope || '').trim() === 'descendants' ? 'descendants' : 'direct',
    categoryId: String(req.query.categoryId || '').trim(),
    gradeFilter: String(req.query.gradeFilter || '').trim(),
    completionFilter: ['completed', 'not_completed'].includes(String(req.query.completionFilter || '').trim())
      ? String(req.query.completionFilter).trim()
      : '',
    qcReviewFilter: String(req.query.qcReviewFilter || '').trim(),
    techUserId: String(req.query.techUserId || '').trim(),
    createdStartDate: String(req.query.createdStartDate || '').trim(),
    createdEndDate: String(req.query.createdEndDate || '').trim(),
    createdWindow: String(req.query.createdWindow || '').trim(),
    unitState: String(req.query.unitState || 'active').trim(),
    sort: String(req.query.sort || '').trim(),
    page: String(req.query.page || '').trim(),
    perPage: String(req.query.perPage || '').trim(),
    currentUserId: req && req.currentUser ? req.currentUser.user_id : null,
    restrictToCurrentAssignment: isRegularTechUnitBrowserUser(req),
    canViewParkedUnits: canViewParkedUnits(req),
    canSearchParkedUnits: canSearchParkedUnits(req),
    allowAnyLotFilter: canViewAnyLotFilter(req)
  };
}

function getQcPortalFiltersFromRequest(req) {
  return {
    ...getFiltersFromRequest(req),
    unitState: 'active',
    restrictToCurrentAssignment: false,
    canViewParkedUnits: false,
    canSearchParkedUnits: false,
    allowAnyLotFilter: false
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

async function attachLatestWorkCompletion(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const latestCompletionMap = await techUnitModel.getLatestWorkCompletionMapForUnits(unitIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      latestWorkCompletion: latestCompletionMap.get(Number(unit.unitId)) || null
    }))
  };
}

async function attachLatestQcReviews(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const unitIds = result.units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isInteger(unitId) && unitId > 0);

  if (unitIds.length === 0) {
    return result;
  }

  const completionIds = result.units
    .map((unit) => unit.latestWorkCompletion && Number(unit.latestWorkCompletion.unitWorkCompletionId))
    .filter((completionId) => Number.isSafeInteger(completionId) && completionId > 0);
  const latestQcReviewMap = await unitQcCheckModel.listLatestQcChecksForCompletions(completionIds);

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      latestQcReview: unit.latestWorkCompletion
        ? latestQcReviewMap.get(Number(unit.latestWorkCompletion.unitWorkCompletionId)) || null
        : null
    }))
  };
}

async function attachLatestQcCorrections(result) {
  if (!result || !result.supported || !Array.isArray(result.units) || result.units.length === 0) {
    return result;
  }

  const rejectedQcCheckIds = result.units
    .map((unit) => unit.latestQcReview && unit.latestQcReview.decisionCode === 'rejected'
      ? Number(unit.latestQcReview.qcCheckId)
      : null)
    .filter((qcCheckId) => Number.isSafeInteger(qcCheckId) && qcCheckId > 0);
  const latestCorrectionMap = await unitQcCorrectionModel.listLatestCorrectionsForQcChecks(rejectedQcCheckIds);

  return {
    ...result,
    units: result.units.map((unit) => {
      const latestQcCorrection = unit.latestQcReview && unit.latestQcReview.decisionCode === 'rejected'
        ? latestCorrectionMap.get(Number(unit.latestQcReview.qcCheckId)) || null
        : null;

      return {
        ...unit,
        latestQcCorrection,
        qcReviewActionAvailability: getQcReviewActionAvailability({
          hasCompletion: Boolean(unit.latestWorkCompletion),
          isParked: Boolean(unit.isParked),
          latestDecisionCode: unit.latestQcReview ? unit.latestQcReview.decisionCode : '',
          hasCorrection: Boolean(latestQcCorrection)
        })
      };
    })
  };
}

function attachUnitWeightBrowserPresentation(result) {
  if (!result || !result.supported || !Array.isArray(result.units)) {
    return result;
  }

  return {
    ...result,
    units: result.units.map((unit) => ({
      ...unit,
      ...buildUnitWeightBrowserPresentation(unit)
    }))
  };
}


function attachTechUnitBrowserVersions(result) {
  if (!result || !result.supported || !Array.isArray(result.units)) {
    return result;
  }

  const qcReviewQueue = result.qcReviewQueue
    ? {
      ...result.qcReviewQueue,
      version: crypto
        .createHash('sha256')
        .update(JSON.stringify({
          queue: result.qcReviewQueue,
          selectedFilter: result.filters ? result.filters.qcReviewFilter : ''
        }))
        .digest('hex')
        .slice(0, 24)
    }
    : null;

  return {
    ...result,
    qcReviewQueue,
    units: result.units.map((unit) => ({
      ...unit,
      browserVersion: crypto
        .createHash('sha256')
        .update(JSON.stringify(unit))
        .digest('hex')
        .slice(0, 24)
    }))
  };
}

async function buildTechUnitsResult(filters) {
  const rawResult = await techUnitModel.listTechUnits(filters);
  const expandedResult = await attachExpandedUnitDetails(rawResult);
  const overrideResult = await attachLatestOverrideHistory(expandedResult);
  const completionResult = await attachLatestWorkCompletion(overrideResult);
  const qcResult = await attachLatestQcReviews(completionResult);
  const correctionResult = await attachLatestQcCorrections(qcResult);
  const weightPresentationResult = attachUnitWeightBrowserPresentation(correctionResult);

  return attachTechUnitBrowserVersions(weightPresentationResult);
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
  return normalizeModuleField(value);
}

function getMemoryModulesFromRequest(req, collectionName = 'memoryModules') {
  return normalizeModuleRowsFromBody(req.body[collectionName]).map((row) => {
    const sizeGb = normalizeHardwareCapacityForStorage(row.sizeGb);
    const isEmptySlot = sizeGb === '0';

    return {
      componentRowId: normalizeModuleField(row.componentRowId),
      slotLabel: normalizeModuleField(row.slotLabel),
      sizeGb,
      ramTypeConfigValueId: isEmptySlot ? '' : normalizeModuleField(row.ramTypeConfigValueId),
      memoryInstallTypeCode: isEmptySlot ? '' : normalizeMemoryInstallTypeCode(row.memoryInstallTypeCode)
    };
  });
}

function getStorageDevicesFromRequest(req, collectionName = 'storageDevices') {
  return normalizeModuleRowsFromBody(req.body[collectionName]).map((row) => {
    const sizeGb = normalizeHardwareCapacityForStorage(row.sizeGb);
    const isEmptySlot = sizeGb === '0';

    return {
      componentRowId: normalizeModuleField(row.componentRowId),
      slotLabel: normalizeModuleField(row.slotLabel),
      sizeGb,
      storageTypeConfigValueId: isEmptySlot ? '' : normalizeModuleField(row.storageTypeConfigValueId),
      wipeStatusConfigValueId: isEmptySlot ? '' : normalizeModuleField(row.wipeStatusConfigValueId)
    };
  });
}

function getIssueRowsFromBody(value) {
  return normalizeModuleRowsFromBody(value);
}

function getCosmeticIssuesFromRequest(req) {
  return getIssueRowsFromBody(req.body.cosmeticIssues).map((row) => ({
    issueTypeConfigValueId: normalizeModuleField(row.issueTypeConfigValueId),
    severityConfigValueId: normalizeModuleField(row.severityConfigValueId),
    locationConfigValueId: normalizeModuleField(row.locationConfigValueId),
    issueRemark: normalizeModuleField(row.issueRemark),
    isNoIssue: normalizeModuleField(row.isNoIssue)
  }));
}

function getHardwareIssuesFromRequest(req) {
  return getIssueRowsFromBody(req.body.hardwareIssues).map((row) => ({
    issueTypeConfigValueId: normalizeModuleField(row.issueTypeConfigValueId),
    customIssueLabel: normalizeModuleField(row.customIssueLabel),
    locationConfigValueId: normalizeModuleField(row.locationConfigValueId),
    issueRemark: normalizeModuleField(row.issueRemark),
    isNoIssue: normalizeModuleField(row.isNoIssue)
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



function getSpecsTestsRowsFromRequest(req) {
  return {
    cameras: normalizeModuleRowsFromBody(req.body.cameras).slice(0, 3).map((row) => ({
      rowId: normalizeModuleField(row.rowId),
      cameraTypeConfigValueId: normalizeModuleField(row.cameraTypeConfigValueId),
      cameraLocationConfigValueId: normalizeModuleField(row.cameraLocationConfigValueId),
      testResultConfigValueId: normalizeModuleField(row.testResultConfigValueId)
    })),
    batteries: normalizeModuleRowsFromBody(req.body.batteries).slice(0, 2).map((row) => ({
      rowId: normalizeModuleField(row.rowId),
      healthPercent: normalizeModuleField(row.healthPercent),
      cycleCount: normalizeModuleField(row.cycleCount)
    })),
    biometrics: normalizeModuleRowsFromBody(req.body.biometrics).slice(0, 6).map((row) => ({
      rowId: normalizeModuleField(row.rowId),
      hardwareConfigValueId: normalizeModuleField(row.hardwareConfigValueId),
      testResultConfigValueId: normalizeModuleField(row.testResultConfigValueId)
    })),
    ports: normalizeModuleRowsFromBody(req.body.ports).slice(0, 30).map((row) => ({
      rowId: normalizeModuleField(row.rowId),
      portTypeConfigValueId: normalizeModuleField(row.portTypeConfigValueId),
      portCount: normalizeModuleField(row.portCount)
    }))
  };
}

function getBatteryHealthSummaryFromRows(rows) {
  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(String(row.healthPercent || '').trim()))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  return values.length > 0 ? String(Math.min(...values)) : '';
}

function getExpandedDetailsFromRequest(req) {
  const specsTestsRows = getSpecsTestsRowsFromRequest(req);
  const canRequestOutcomeConfirmation = isRegularTechUnitBrowserUser(req);
  return {
    overallGradeConfigValueId: normalizeModuleField(req.body.overallGradeConfigValueId),
    overallGradeNotes: normalizeModuleField(req.body.overallGradeNotes),
    biosVersion: normalizeModuleField(req.body.biosVersion),
    osBuild: normalizeModuleField(req.body.osBuild),
    wifiCardPresentConfigValueId: normalizeModuleField(req.body.wifiCardPresentConfigValueId),
    chargerIncludedConfigValueId: normalizeModuleField(req.body.chargerIncludedConfigValueId),
    displayTypeConfigValueId: normalizeModuleField(req.body.displayTypeConfigValueId),
    nativeScreenResolutionConfigValueId: normalizeModuleField(req.body.nativeScreenResolutionConfigValueId),
    refreshRateConfigValueId: normalizeModuleField(req.body.refreshRateConfigValueId),
    colorConfigValueId: normalizeModuleField(req.body.colorConfigValueId),
    appleModelNumber: normalizeModuleField(req.body.appleModelNumber),
    keyboardTestResultConfigValueId: normalizeModuleField(req.body.keyboardTestResultConfigValueId),
    microphoneCheckResultConfigValueId: normalizeModuleField(req.body.microphoneCheckResultConfigValueId),
    audioOutputCheckResultConfigValueId: normalizeModuleField(req.body.audioOutputCheckResultConfigValueId),
    allScrewsPresentConfigValueId: normalizeModuleField(req.body.allScrewsPresentConfigValueId),
    biosLockConfigValueId: normalizeModuleField(req.body.biosLockConfigValueId),
    efiLockConfigValueId: normalizeModuleField(req.body.efiLockConfigValueId),
    mdmLockConfigValueId: normalizeModuleField(req.body.mdmLockConfigValueId),
    icloudActivationLockConfigValueId: normalizeModuleField(req.body.icloudActivationLockConfigValueId),
    ceCertificationConfigValueId: normalizeModuleField(req.body.ceCertificationConfigValueId),
    openBoxStatusConfigValueId: normalizeModuleField(req.body.openBoxStatusConfigValueId),
    boxLanguageConfigValueId: normalizeModuleField(req.body.boxLanguageConfigValueId),
    cameras: specsTestsRows.cameras,
    batteries: specsTestsRows.batteries,
    biometrics: specsTestsRows.biometrics,
    ports: specsTestsRows.ports,
    absoluteStatusConfigValueId: normalizeModuleField(req.body.absoluteStatusConfigValueId),
    physicalCameraStatusConfigValueId: normalizeModuleField(req.body.physicalCameraStatusConfigValueId),
    touchscreenStatusConfigValueId: normalizeModuleField(req.body.touchscreenStatusConfigValueId),
    keyboardLanguageConfigValueId: normalizeModuleField(req.body.keyboardLanguageConfigValueId),
    completeDiagnosticsStatusConfigValueId: normalizeModuleField(req.body.completeDiagnosticsStatusConfigValueId),
    virusCheckStatusConfigValueId: normalizeModuleField(req.body.virusCheckStatusConfigValueId),
    driverCheckStatusConfigValueId: normalizeModuleField(req.body.driverCheckStatusConfigValueId),
    skinnedStatusConfigValueId: normalizeModuleField(req.body.skinnedStatusConfigValueId),
    graphicsAdapters: [],
    outcomeCode: normalizeModuleField(req.body.outcomeCode),
    outcomeNotes: normalizeModuleField(req.body.outcomeNotes),
    outcomeApprovalRequested: canRequestOutcomeConfirmation && req.body.outcomeApprovalRequested ? '1' : '',
    outcomeApprovalRequestNotes: canRequestOutcomeConfirmation ? normalizeModuleField(req.body.outcomeApprovalRequestNotes) : ''
  };
}


function getPositiveIntegerOrBlank(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '';
}

function getModuleTotalGb(rows) {
  return rows.reduce((sum, row) => {
    const parsed = parseHardwareCapacityToGb(row.sizeGb);

    return parsed.valid && parsed.gb !== null ? sum + parsed.gb : sum;
  }, 0);
}

function hasStructuredCapacityEntry(rows) {
  return rows.some((row) => {
    const parsed = parseHardwareCapacityToGb(row.sizeGb);

    return parsed.valid && parsed.gb !== null;
  });
}

function getComponentCapacityTotalGb(rows, submittedLegacyTotal) {
  const componentTotal = getModuleTotalGb(rows);

  if (hasStructuredCapacityEntry(rows)) {
    return String(componentTotal);
  }

  // The visible total fields were removed in Stage 10E. Preserve a valid
  // summary-only legacy value when no structured rows exist, but never allow
  // stale zero/negative/non-integer hidden values to block form submission.
  return getPositiveIntegerOrBlank(submittedLegacyTotal);
}

function normalizeSerialInput(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function getUnitFormDataFromRequest(req, { allowAssetTag = true } = {}) {
  const previousMemoryModules = getMemoryModulesFromRequest(req, 'previousMemoryModules');
  const memoryModules = getMemoryModulesFromRequest(req);
  const previousStorageDevices = getStorageDevicesFromRequest(req, 'previousStorageDevices');
  const storageDevices = getStorageDevicesFromRequest(req);
  const previousMemoryTotalGb = getModuleTotalGb(previousMemoryModules);
  const memoryTotalGb = getModuleTotalGb(memoryModules);
  const previousStorageTotalGb = getModuleTotalGb(previousStorageDevices);
  const storageTotalGb = getModuleTotalGb(storageDevices);
  const issueDetails = getIssueDetailsFromRequest(req);
  const expandedDetails = getExpandedDetailsFromRequest(req);

  return {
    assetTag: allowAssetTag ? String(req.body.assetTag || '').trim() : '',
    duplicateAssumptionNonce: String(req.body.duplicateAssumptionNonce || '').trim(),
    unitSerialNumber: normalizeSerialInput(req.body.unitSerialNumber),
    biosSerialNumber: normalizeSerialInput(req.body.biosSerialNumber),
    lotId: String(req.body.lotId || '').trim(),
    unitCategoryConfigValueId: String(req.body.unitCategoryConfigValueId || '').trim(),
    currentUnitStatusConfigValueId: String(req.body.currentUnitStatusConfigValueId || '').trim(),
    manufacturerId: String(req.body.manufacturerId || '').trim(),
    unitModelId: String(req.body.unitModelId || '').trim(),
    screenSizeConfigValueId: String(req.body.screenSizeConfigValueId || '').trim(),
    modelYear: String(req.body.modelYear || '').trim(),
    processorModelId: String(req.body.processorModelId || '').trim(),
    processorSpeedGhz: String(req.body.processorSpeedGhz || '').trim(),
    previousRamGb: getComponentCapacityTotalGb(previousMemoryModules, req.body.previousRamGb),
    ramGb: getComponentCapacityTotalGb(memoryModules, req.body.ramGb),
    ramTypeConfigValueId: String(req.body.ramTypeConfigValueId || '').trim(),
    previousStorageGb: getComponentCapacityTotalGb(previousStorageDevices, req.body.previousStorageGb),
    storageGb: getComponentCapacityTotalGb(storageDevices, req.body.storageGb),
    storageTypeConfigValueId: String(req.body.storageTypeConfigValueId || '').trim(),
    operatingSystemConfigValueId: String(req.body.operatingSystemConfigValueId || '').trim(),
    batteryHealthPercent: getBatteryHealthSummaryFromRows(expandedDetails.batteries),
    previousMemoryModules,
    memoryModules,
    previousStorageDevices,
    storageDevices,
    cosmeticIssues: issueDetails.cosmeticIssues,
    hardwareIssues: issueDetails.hardwareIssues,
    generalCommentTypeConfigValueId: issueDetails.generalCommentTypeConfigValueId,
    generalCommentText: issueDetails.generalCommentText,
    overallGradeConfigValueId: expandedDetails.overallGradeConfigValueId,
    overallGradeNotes: expandedDetails.overallGradeNotes,
    biosVersion: expandedDetails.biosVersion,
    osBuild: expandedDetails.osBuild,
    wifiCardPresentConfigValueId: expandedDetails.wifiCardPresentConfigValueId,
    chargerIncludedConfigValueId: expandedDetails.chargerIncludedConfigValueId,
    displayTypeConfigValueId: expandedDetails.displayTypeConfigValueId,
    nativeScreenResolutionConfigValueId: expandedDetails.nativeScreenResolutionConfigValueId,
    refreshRateConfigValueId: expandedDetails.refreshRateConfigValueId,
    colorConfigValueId: expandedDetails.colorConfigValueId,
    appleModelNumber: expandedDetails.appleModelNumber,
    cameras: expandedDetails.cameras,
    batteries: expandedDetails.batteries,
    biometrics: expandedDetails.biometrics,
    ports: expandedDetails.ports,
    keyboardTestResultConfigValueId: expandedDetails.keyboardTestResultConfigValueId,
    microphoneCheckResultConfigValueId: expandedDetails.microphoneCheckResultConfigValueId,
    audioOutputCheckResultConfigValueId: expandedDetails.audioOutputCheckResultConfigValueId,
    allScrewsPresentConfigValueId: expandedDetails.allScrewsPresentConfigValueId,
    biosLockConfigValueId: expandedDetails.biosLockConfigValueId,
    efiLockConfigValueId: expandedDetails.efiLockConfigValueId,
    mdmLockConfigValueId: expandedDetails.mdmLockConfigValueId,
    icloudActivationLockConfigValueId: expandedDetails.icloudActivationLockConfigValueId,
    ceCertificationConfigValueId: expandedDetails.ceCertificationConfigValueId,
    openBoxStatusConfigValueId: expandedDetails.openBoxStatusConfigValueId,
    boxLanguageConfigValueId: expandedDetails.boxLanguageConfigValueId,
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

function isNonNegativeInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0;
}

function isNumberInRangeWithPrecision(value, minimum, maximum, maximumDecimalPlaces) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return true;
  }

  const normalized = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return false;
  }

  const parsed = Number(normalized);
  const decimalPart = normalized.includes('.') ? normalized.split('.')[1] : '';

  return Number.isFinite(parsed)
    && parsed >= minimum
    && parsed <= maximum
    && decimalPart.length <= maximumDecimalPlaces;
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

function validateMemoryModules(formData, propertyName = 'memoryModules', rowLabelPrefix = 'Memory module') {
  const errors = [];

  (formData[propertyName] || []).forEach((moduleRow, index) => {
    if (!moduleRowHasAnyValue(moduleRow, ['slotLabel'])) {
      return;
    }

    const rowLabel = `${rowLabelPrefix} ${index + 1}`;

    const parsedCapacity = parseHardwareCapacityToGb(moduleRow.sizeGb);

    if (!parsedCapacity.valid || parsedCapacity.gb === null) {
      errors.push(`${rowLabel}: ${parsedCapacity.message || 'Enter 0 for an empty slot, or a size such as 16GB, 512GB, 1TB, or 2TB.'}`);
    }

    const isEmptySlot = parsedCapacity.valid && parsedCapacity.gb === 0;

    if (!isEmptySlot && !moduleRow.ramTypeConfigValueId) {
      errors.push(`${rowLabel} requires a Memory Type selection.`);
    } else if (moduleRow.ramTypeConfigValueId && !isPositiveInteger(moduleRow.ramTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid memory type.`);
    }

    if (!isEmptySlot && !moduleRow.memoryInstallTypeCode) {
      errors.push(`${rowLabel} requires an Install Type selection.`);
    } else if (moduleRow.memoryInstallTypeCode && !VALID_MEMORY_INSTALL_TYPE_CODES.has(moduleRow.memoryInstallTypeCode)) {
      errors.push(`${rowLabel} has an invalid memory install type.`);
    }

    if (moduleRow.slotLabel.length > 80) {
      errors.push(`${rowLabel} slot label must be 80 characters or fewer.`);
    }
  });

  return errors;
}

function validateStorageDevices(formData, propertyName = 'storageDevices', rowLabelPrefix = 'Storage device') {
  const errors = [];

  (formData[propertyName] || []).forEach((deviceRow, index) => {
    if (!moduleRowHasAnyValue(deviceRow, ['slotLabel'])) {
      return;
    }

    const rowLabel = `${rowLabelPrefix} ${index + 1}`;

    const parsedCapacity = parseHardwareCapacityToGb(deviceRow.sizeGb);

    if (!parsedCapacity.valid || parsedCapacity.gb === null) {
      errors.push(`${rowLabel}: ${parsedCapacity.message || 'Enter 0 for an empty slot, or a size such as 512GB, 1TB, or 2TB.'}`);
    }

    const isEmptySlot = parsedCapacity.valid && parsedCapacity.gb === 0;

    if (!isEmptySlot && !deviceRow.storageTypeConfigValueId) {
      errors.push(`${rowLabel} requires a Storage Type selection.`);
    } else if (deviceRow.storageTypeConfigValueId && !isPositiveInteger(deviceRow.storageTypeConfigValueId)) {
      errors.push(`${rowLabel} has an invalid storage type.`);
    }

    if (deviceRow.wipeStatusConfigValueId && !isPositiveInteger(deviceRow.wipeStatusConfigValueId)) {
      errors.push(`${rowLabel} has an invalid wipe status.`);
    }

    if (deviceRow.slotLabel.length > 80) {
      errors.push(`${rowLabel} slot label must be 80 characters or fewer.`);
    }
  });

  return errors;
}

function issueRowHasAnyValue(row) {
  return Object.entries(row || {}).some(([key, value]) => (
    key !== 'isNoIssue' && String(value || '').trim()
  ));
}

function getNoCosmeticIssueTypeIdSet(formOptions = {}) {
  return new Set(
    (Array.isArray(formOptions.cosmeticIssueTypes) ? formOptions.cosmeticIssueTypes : [])
      .filter((option) => option && option.isNoIssue)
      .map((option) => String(option.id || '').trim())
      .filter(Boolean)
  );
}

function normalizeCosmeticIssueRowsForSubmission(formData, formOptions = {}) {
  const noIssueTypeIds = getNoCosmeticIssueTypeIdSet(formOptions);
  const rows = Array.isArray(formData && formData.cosmeticIssues)
    ? formData.cosmeticIssues
    : [];

  rows.forEach((issueRow) => {
    const selectedTypeId = String(issueRow.issueTypeConfigValueId || '').trim();
    const isNoIssue = Boolean(selectedTypeId && noIssueTypeIds.has(selectedTypeId));

    issueRow.isNoIssue = isNoIssue ? '1' : '';

    if (isNoIssue) {
      issueRow.severityConfigValueId = '';
      issueRow.locationConfigValueId = '';
    }
  });

  return formData;
}

function getNoHardwareIssueTypeIdSet(formOptions = {}) {
  return new Set(
    (Array.isArray(formOptions.hardwareIssueTypes) ? formOptions.hardwareIssueTypes : [])
      .filter((option) => option && option.isNoIssue)
      .map((option) => String(option.id || '').trim())
      .filter(Boolean)
  );
}

function normalizeHardwareIssueRowsForSubmission(formData, formOptions = {}) {
  const noIssueTypeIds = getNoHardwareIssueTypeIdSet(formOptions);
  const rows = Array.isArray(formData && formData.hardwareIssues)
    ? formData.hardwareIssues
    : [];

  rows.forEach((issueRow) => {
    const selectedTypeId = String(issueRow.issueTypeConfigValueId || '').trim();
    const isNoIssue = Boolean(selectedTypeId && noIssueTypeIds.has(selectedTypeId));

    issueRow.isNoIssue = isNoIssue ? '1' : '';

    if (isNoIssue) {
      issueRow.customIssueLabel = '';
      issueRow.locationConfigValueId = '';
    }
  });

  return formData;
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

    const isNoIssue = issueRow.isNoIssue === '1';

    if (!isNoIssue && (!issueRow.severityConfigValueId || !isPositiveInteger(issueRow.severityConfigValueId))) {
      errors.push(`${rowLabel} requires a valid severity.`);
    }

    if (!isNoIssue && (!issueRow.locationConfigValueId || !isPositiveInteger(issueRow.locationConfigValueId))) {
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

    const isNoIssue = issueRow.isNoIssue === '1';

    if (!isNoIssue && !issueRow.issueTypeConfigValueId && !issueRow.customIssueLabel) {
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
    ['touchscreenStatusConfigValueId', 'Touchscreen test'],
    ['keyboardLanguageConfigValueId', 'Keyboard language'],
    ['wifiCardPresentConfigValueId', 'Wi-Fi Card Present'],
    ['chargerIncludedConfigValueId', 'Charger Included'],
    ['displayTypeConfigValueId', 'Display Type'],
    ['nativeScreenResolutionConfigValueId', 'Native Screen Resolution'],
    ['refreshRateConfigValueId', 'Refresh Rate'],
    ['colorConfigValueId', 'Color'],
    ['keyboardTestResultConfigValueId', 'Keyboard Test'],
    ['microphoneCheckResultConfigValueId', 'Microphone Check'],
    ['audioOutputCheckResultConfigValueId', 'Audio Output Check'],
    ['allScrewsPresentConfigValueId', 'All Screws Present'],
    ['completeDiagnosticsStatusConfigValueId', 'Diagnostics Test'],
    ['virusCheckStatusConfigValueId', 'Threat Protection Scan'],
    ['driverCheckStatusConfigValueId', 'Driver Check'],
    ['biosLockConfigValueId', 'BIOS Lock'],
    ['efiLockConfigValueId', 'EFI Lock'],
    ['mdmLockConfigValueId', 'MDM Lock'],
    ['icloudActivationLockConfigValueId', 'iCloud Activation Lock'],
    ['ceCertificationConfigValueId', 'CE Certification'],
    ['openBoxStatusConfigValueId', 'Open-Box Status'],
    ['boxLanguageConfigValueId', 'Box Language'],
    ['skinnedStatusConfigValueId', 'Skinned status']
  ];

  configFieldLabels.forEach(([fieldName, label]) => {
    if (formData[fieldName] && !isPositiveInteger(formData[fieldName])) {
      errors.push(`${label} is invalid.`);
    }
  });

  if (formData.appleModelNumber && formData.appleModelNumber.length > 80) {
    errors.push('Apple Model Number must be 80 characters or fewer.');
  }

  (formData.cameras || []).forEach((row, index) => {
    if (row.cameraTypeConfigValueId && !isPositiveInteger(row.cameraTypeConfigValueId)) errors.push(`Camera ${index + 1} has an invalid Camera Type.`);
    if (row.cameraLocationConfigValueId && !isPositiveInteger(row.cameraLocationConfigValueId)) errors.push(`Camera ${index + 1} has an invalid Camera Location.`);
    if (row.testResultConfigValueId && !isPositiveInteger(row.testResultConfigValueId)) errors.push(`Camera ${index + 1} has an invalid Test Result.`);
  });
  (formData.batteries || []).forEach((row, index) => {
    if (!isNumberInRangeWithPrecision(row.healthPercent, 0, 100, 1)) errors.push(`Battery ${index + 1} Health must be from 0.0 through 100.0.`);
    if (row.cycleCount && !isNonNegativeInteger(row.cycleCount)) errors.push(`Battery ${index + 1} Cycle Count must be a non-negative whole number.`);
  });
  (formData.biometrics || []).forEach((row, index) => {
    if (row.hardwareConfigValueId && !isPositiveInteger(row.hardwareConfigValueId)) errors.push(`Biometric ${index + 1} has invalid hardware.`);
    if (row.testResultConfigValueId && !isPositiveInteger(row.testResultConfigValueId)) errors.push(`Biometric ${index + 1} has an invalid Test Result.`);
  });
  (formData.ports || []).forEach((row, index) => {
    if (row.portTypeConfigValueId && !isPositiveInteger(row.portTypeConfigValueId)) errors.push(`Port / Expansion ${index + 1} has an invalid type.`);
    if (row.portCount && !isNonNegativeInteger(row.portCount)) errors.push(`Port / Expansion ${index + 1} Count must be a non-negative whole number.`);
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

async function validateUnitForm(formData, formOptions, mode) {
  const errors = [];

  normalizeCosmeticIssueRowsForSubmission(formData, formOptions);
  normalizeHardwareIssueRowsForSubmission(formData, formOptions);

  const validationFormData = buildManagedValidationFormData(formData);

  if (!formOptions.supported) {
    errors.push(formOptions.message || 'The units table is not ready yet.');
    return errors;
  }

  if (!validationFormData.lotId || !isPositiveInteger(validationFormData.lotId)) {
    errors.push('A valid assignable lot is required.');
  } else if (!isAssignableLotId(validationFormData.lotId, formOptions)) {
    errors.push('The selected Lot is not open, visible, and assignable. Choose a Lot that currently accepts Unit assignments.');
  }

  if (!validationFormData.unitCategoryConfigValueId || !isPositiveInteger(validationFormData.unitCategoryConfigValueId)) {
    errors.push('Unit category is required.');
  }

  if (!validationFormData.currentUnitStatusConfigValueId || !isPositiveInteger(validationFormData.currentUnitStatusConfigValueId)) {
    errors.push('Unit status is required.');
  }

  if (validationFormData.unitSerialNumber.length > 150) {
    errors.push('Unit serial number must be 150 characters or fewer.');
  }

  if (validationFormData.biosSerialNumber.length > 150) {
    errors.push('BIOS serial number must be 150 characters or fewer.');
  }

  if (validationFormData.previousRamGb && !isNonNegativeInteger(validationFormData.previousRamGb)) {
    errors.push('Previous memory size must be a non-negative whole number.');
  }

  if (validationFormData.ramGb && !isNonNegativeInteger(validationFormData.ramGb)) {
    errors.push('Current memory total must be a non-negative whole number.');
  }

  if (validationFormData.previousStorageGb && !isNonNegativeInteger(validationFormData.previousStorageGb)) {
    errors.push('Previous storage size must be a non-negative whole number.');
  }

  if (validationFormData.storageGb && !isNonNegativeInteger(validationFormData.storageGb)) {
    errors.push('Current storage total must be a non-negative whole number.');
  }

  if (validationFormData.screenSizeConfigValueId) {
    const selectedScreenSizeId = Number(validationFormData.screenSizeConfigValueId);
    const validScreenSize = isPositiveInteger(validationFormData.screenSizeConfigValueId)
      && (Array.isArray(formOptions.screenSizes) ? formOptions.screenSizes : [])
        .some((option) => Number(option.id) === selectedScreenSizeId);
    if (!validScreenSize) {
      errors.push('Choose a valid Screen Size.');
    }
  }

  if (validationFormData.modelYear) {
    const parsedModelYear = Number(validationFormData.modelYear);
    if (!Number.isInteger(parsedModelYear) || parsedModelYear < 1980 || parsedModelYear > 2100) {
      errors.push('Model Year must be a four-digit year from 1980 through 2100.');
    }
  }

  const selectedManufacturerLabel = getOptionLabel(formOptions.manufacturers, validationFormData.manufacturerId).toLowerCase();
  if (selectedManufacturerLabel === 'apple' && validationFormData.displayTypeConfigValueId) {
    const selectedDisplayTypeId = Number(validationFormData.displayTypeConfigValueId);
    const selectedDisplayType = (Array.isArray(formOptions.displayTypeOptions) ? formOptions.displayTypeOptions : [])
      .find((option) => Number(option.id) === selectedDisplayTypeId);
    if (selectedDisplayType && selectedDisplayType.appleDisallowed) {
      errors.push('LCD and OLED are not available Display Type selections for Apple Units.');
    }
  }

  if (validationFormData.processorModelId && !isPositiveInteger(validationFormData.processorModelId)) {
    errors.push('Choose a valid processor from the compatibility catalog.');
  }

  if (validationFormData.unitModelId && validationFormData.processorModelId && isPositiveInteger(validationFormData.unitModelId) && isPositiveInteger(validationFormData.processorModelId)) {
    const processorCompatibility = await techUnitModel.getProcessorCompatibilityStatus({
      unitModelId: validationFormData.unitModelId,
      processorModelId: validationFormData.processorModelId
    });

    if (processorCompatibility.hasCatalog && !processorCompatibility.isSupported) {
      errors.push('The selected processor is not listed as compatible with the chosen Unit Model. Choose a catalog-supported processor.');
    }
  }

  if (!isPositiveOrZeroNumber(validationFormData.processorSpeedGhz)) {
    errors.push('Processor speed must be a valid number.');
  }

  if (!isNumberInRangeWithPrecision(validationFormData.batteryHealthPercent, 0, 100, 1)) {
    errors.push('Battery health must be a percentage from 0.0 through 100.0 with no more than one decimal place.');
  }

  if (validationFormData.hardwareNotes.length > 1000) {
    errors.push('Hardware notes must be 1000 characters or fewer.');
  }

  if (validationFormData.cosmeticNotes.length > 1000) {
    errors.push('Cosmetic notes must be 1000 characters or fewer.');
  }

  if (validationFormData.overallGradeConfigValueId) {
    const selectedGradeId = Number(validationFormData.overallGradeConfigValueId);
    const allowedGrade = (Array.isArray(formOptions.overallGradeOptions) ? formOptions.overallGradeOptions : [])
      .some((option) => (
        Number(option.id) === selectedGradeId
        || (Array.isArray(option.filterIds) && option.filterIds.includes(selectedGradeId))
      ));

    if (!allowedGrade) {
      errors.push('Choose a valid Cosmetic Grade: A, AB, B, C, or D.');
    }
  }

  if (formOptions.canOverrideProductionWeight && validationFormData.productionWeightOverride && !isPositiveOrZeroNumber(validationFormData.productionWeightOverride)) {
    errors.push('Production weight override must be a valid non-negative number.');
  }

  if (formOptions.canOverrideProductionWeight && validationFormData.productionWeightNotes && validationFormData.productionWeightNotes.length > 500) {
    errors.push('Production weight notes must be 500 characters or fewer.');
  }

  errors.push(...validateMemoryModules(validationFormData, 'previousMemoryModules', 'Previous memory module'));
  errors.push(...validateMemoryModules(validationFormData));
  errors.push(...validateStorageDevices(validationFormData, 'previousStorageDevices', 'Previous storage device'));
  errors.push(...validateStorageDevices(validationFormData));
  errors.push(...validateIssueDetails(validationFormData));
  errors.push(...validateExpandedDetails(validationFormData));

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

  if (error && error.code === 'BWT_UNIT_EDIT_NOT_ASSIGNED') {
    return 'You can edit only units currently assigned to you. Use Request Override for another Tech’s unit.';
  }

  if (error && error.code === 'BWT_UNIT_ACTION_NOT_ASSIGNED') {
    return 'You can record work only for a unit currently assigned to you.';
  }

  if (error && error.code === 'BWT_UNIT_IS_PARKED') {
    return 'This unit is parked. Return it to Active before changing its details or recording work.';
  }

  if (error && error.code === 'BWT_LOT_MOVE_NOT_ASSIGNED') {
    return 'Only the Tech currently assigned to an unfinished unit may correct its lot directly.';
  }

  if (error && error.code === 'BWT_LOT_MOVE_REQUIRES_APPROVAL') {
    return 'This unit already has recorded work. A Tech Lead, Management user, or Admin must move it to another lot.';
  }

  if (error && error.code === 'BWT_LOT_DESTINATION_NOT_OPEN') {
    return error.message || 'Closed, hidden, and parent/container lots cannot receive units. Choose an open child or standalone lot.';
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

async function getDuplicateAssumptionRecoveryView(req, formData) {
  const unitSerialNumber = normalizeSerialInput(formData.unitSerialNumber).slice(0, 150);
  const biosSerialNumber = normalizeSerialInput(formData.biosSerialNumber).slice(0, 150);
  const destinationLotId = String(formData.lotId || '').trim();
  const duplicateMatches = (unitSerialNumber || biosSerialNumber)
    ? await techUnitModel.getDuplicateAssumptionCandidates({
      unitSerialNumber,
      biosSerialNumber,
      destinationLotId,
      actorRoleCodes: getCurrentRoleCodes(req),
      actorUserId: req.currentUser ? req.currentUser.user_id : null
    })
    : [];

  return {
    duplicateMatches,
    duplicateCheckPerformed: true,
    errorMessages: duplicateMatches.length > 0
      ? ['An existing serial match was confirmed before this form could be saved. Select an eligible existing unit below or change the serial values.']
      : ['An existing serial match was confirmed. Refresh the serial values and try the duplicate check again before creating a new unit.']
  };
}

async function renderEarlySerialDuplicateCheck(req, res, next) {
  try {
    const unitSerialNumber = normalizeSerialInput(req.query.unitSerialNumber).slice(0, 150);
    const biosSerialNumber = normalizeSerialInput(req.query.biosSerialNumber).slice(0, 150);
    const hasSerialSearch = Boolean(unitSerialNumber || biosSerialNumber);
    const destinationLotId = String(req.query.destinationLotId || '').trim();
    const currentUnitId = normalizePositiveInteger(req.query.currentUnitId);
    const duplicateMatches = hasSerialSearch
      ? await techUnitModel.getDuplicateAssumptionCandidates({
        unitSerialNumber,
        biosSerialNumber,
        destinationLotId,
        actorRoleCodes: getCurrentRoleCodes(req),
        actorUserId: req.currentUser ? req.currentUser.user_id : null,
        currentUnitId
      })
      : [];

    res.set('Cache-Control', 'no-store');

    return res.render('fragments/tech-unit-duplicate-check', {
      duplicateMatches,
      hasSerialSearch,
      destinationLotId,
      isEditDuplicateCheck: Boolean(currentUnitId),
      canRequestIntentionalDuplicate: !currentUnitId && isRegularTechIntentionalDuplicateRequester(req)
    });
  } catch (error) {
    next(error);
  }
}

function getDuplicateAssumptionRequestData(req) {
  const query = req && req.query ? req.query : {};
  const body = req && req.body ? req.body : {};

  return {
    unitSerialNumber: normalizeSerialInput(query.unitSerialNumber || body.unitSerialNumber || '').slice(0, 150),
    biosSerialNumber: normalizeSerialInput(query.biosSerialNumber || body.biosSerialNumber || '').slice(0, 150),
    destinationLotId: String(
      query.destinationLotId
      || body.destinationLotId
      || query.lotId
      || body.lotId
      || ''
    ).trim(),
    duplicateAssumptionNonce: String(query.duplicateAssumptionNonce || body.duplicateAssumptionNonce || '').trim()
  };
}

function buildDuplicateAssumeModalView({ candidate = null, formData = {}, errorMessages = [] } = {}) {
  return {
    candidate,
    formData: {
      unitSerialNumber: String(formData.unitSerialNumber || '').trim(),
      biosSerialNumber: String(formData.biosSerialNumber || '').trim(),
      destinationLotId: String(formData.destinationLotId || '').trim(),
      duplicateAssumptionNonce: String(formData.duplicateAssumptionNonce || '').trim()
    },
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

function isRegularTechIntentionalDuplicateRequester(req) {
  const roleCodes = getCurrentRoleCodes(req).map((roleCode) => String(roleCode || '').trim());

  return roleCodes.includes('tech')
    && !roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function getOptionLabel(options, selectedId) {
  const option = (Array.isArray(options) ? options : [])
    .find((candidate) => String(candidate.id) === String(selectedId));

  return option ? String(option.label || option.name || option.modelName || '').trim() : '';
}

function applyManufacturerApplicabilityToUnitFormProfile(profile, formData, formOptions) {
  const manufacturerLabel = getOptionLabel(formOptions?.manufacturers, formData?.manufacturerId);
  const normalizedManufacturer = manufacturerLabel.trim().toLowerCase();
  const isApple = normalizedManufacturer === 'apple';
  const selectedProcessor = (Array.isArray(formOptions?.processorModels) ? formOptions.processorModels : [])
    .find((processor) => String(processor.id) === String(formData?.processorModelId));
  const processorName = String(selectedProcessor?.shortLabel || selectedProcessor?.label || '').trim();
  const isAppleSilicon = isApple && /^(?:apple\s+)?m\d/i.test(processorName);
  const fieldsByKey = new Map(profile.fieldsByKey);

  UNIT_FORM_FIELD_REGISTRY.forEach((definition) => {
    const allowed = Array.isArray(definition.applicableManufacturers)
      ? definition.applicableManufacturers.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const excluded = Array.isArray(definition.excludedManufacturers)
      ? definition.excludedManufacturers.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const manufacturerAllowed = (allowed.length === 0 || allowed.includes(normalizedManufacturer))
      && !excluded.includes(normalizedManufacturer);
    if (manufacturerAllowed) return;
    const resolved = fieldsByKey.get(definition.key);
    if (!resolved) return;
    fieldsByKey.set(definition.key, Object.freeze({
      ...resolved,
      visible: false,
      required: false,
      requiredSuppressedByHidden: Boolean(resolved.required)
    }));
  });

  if (isAppleSilicon) {
    const processorSpeed = fieldsByKey.get('processor_speed_ghz');
    if (processorSpeed) {
      fieldsByKey.set('processor_speed_ghz', Object.freeze({
        ...processorSpeed,
        visible: false,
        required: false,
        requiredSuppressedByHidden: Boolean(processorSpeed.required)
      }));
    }
  }

  return Object.freeze({ ...profile, fieldsByKey });
}

function buildIntentionalDuplicateRequestSnapshot({ formData, formOptions, candidate }) {
  const selectedLot = (Array.isArray(formOptions.lots) ? formOptions.lots : [])
    .find((lot) => String(lot.lot_id) === String(formData.lotId));
  const selectedManufacturer = (Array.isArray(formOptions.manufacturers) ? formOptions.manufacturers : [])
    .find((manufacturer) => String(manufacturer.id) === String(formData.manufacturerId));
  const selectedModel = (Array.isArray(formOptions.unitModels) ? formOptions.unitModels : [])
    .find((model) => String(model.id) === String(formData.unitModelId));
  const selectedProcessor = (Array.isArray(formOptions.processorModels) ? formOptions.processorModels : [])
    .find((processor) => String(processor.id) === String(formData.processorModelId));

  const safeFormData = JSON.parse(JSON.stringify({
    ...formData,
    assetTag: '',
    productionWeightOverride: '',
    productionWeightNotes: '',
    canOverrideProductionWeight: false,
    graphicsAdapters: []
  }));

  const requestedManufacturerLabel = selectedManufacturer ? selectedManufacturer.name : '—';
  const requestedModelLabel = selectedModel ? selectedModel.modelName : '—';
  const existingManufacturerLabel = candidate && candidate.manufacturerLabel ? candidate.manufacturerLabel : '—';
  const existingModelLabel = candidate && candidate.modelLabel ? candidate.modelLabel : '—';

  return {
    version: 2,
    formData: safeFormData,
    display: {
      destinationLotName: selectedLot ? selectedLot.lot_name : 'Lot name not available',
      unitCategoryLabel: getOptionLabel(formOptions.unitCategories, formData.unitCategoryConfigValueId) || '—',
      manufacturerLabel: requestedManufacturerLabel,
      modelLabel: requestedModelLabel,
      processorLabel: selectedProcessor ? selectedProcessor.label : '—',
      operatingSystemLabel: getOptionLabel(formOptions.operatingSystems, formData.operatingSystemConfigValueId) || '—',
      serialSummary: `Unit Serial: ${formData.unitSerialNumber || '—'}; BIOS Serial: ${formData.biosSerialNumber || '—'}`,
      existingManufacturerLabel,
      existingModelLabel,
      manufacturerDiffers: existingManufacturerLabel !== '—' && requestedManufacturerLabel !== '—' && existingManufacturerLabel !== requestedManufacturerLabel,
      modelDiffers: existingModelLabel !== '—' && requestedModelLabel !== '—' && existingModelLabel !== requestedModelLabel
    },
    capturedAt: new Date().toISOString(),
    selectedMatchingUnitId: Number(candidate.unitId)
  };
}

function buildMatchedUnitSnapshot(candidate) {
  const matchingIdentifiers = Array.isArray(candidate && candidate.matchedIdentifiers)
    ? candidate.matchedIdentifiers
    : [];

  return {
    unitId: Number(candidate && candidate.unitId),
    assetTag: candidate && candidate.assetTag ? candidate.assetTag : '',
    isParked: Boolean(candidate && candidate.isParked),
    lotName: candidate && candidate.lotName ? candidate.lotName : '',
    unitSerialNumber: candidate && candidate.unitSerialNumber ? candidate.unitSerialNumber : '',
    biosSerialNumber: candidate && candidate.biosSerialNumber ? candidate.biosSerialNumber : '',
    manufacturerLabel: candidate && candidate.manufacturerLabel ? candidate.manufacturerLabel : '',
    modelLabel: candidate && candidate.modelLabel ? candidate.modelLabel : '',
    modelSummary: candidate && candidate.modelSummary ? candidate.modelSummary : '',
    cpuSummary: candidate && candidate.cpuSummary ? candidate.cpuSummary : '',
    assignedToName: candidate && candidate.assignedToName ? candidate.assignedToName : '',
    matchedIdentifiers: matchingIdentifiers
  };
}

function parseIntentionalDuplicateSnapshot(value) {
  try {
    const snapshot = JSON.parse(String(value || ''));

    if (!snapshot || typeof snapshot !== 'object' || !snapshot.formData || typeof snapshot.formData !== 'object') {
      return null;
    }

    return snapshot;
  } catch (error) {
    return null;
  }
}

function intentionalDuplicateModalResponseStatus(req, fallbackStatus) {
  return isHtmxRequest(req) ? 200 : fallbackStatus;
}

function buildIntentionalDuplicateRequestModalView({
  candidate = null,
  formData = {},
  intakeSnapshot = null,
  requesterNote = '',
  errorMessages = [],
  successRequestId = null
} = {}) {
  return {
    candidate,
    formData: {
      unitSerialNumber: String(formData.unitSerialNumber || '').trim(),
      biosSerialNumber: String(formData.biosSerialNumber || '').trim(),
      destinationLotId: String(formData.destinationLotId || formData.lotId || '').trim(),
      duplicateAssumptionNonce: String(formData.duplicateAssumptionNonce || '').trim()
    },
    intakeSnapshotJson: intakeSnapshot ? JSON.stringify(intakeSnapshot) : '',
    snapshotDisplay: intakeSnapshot && intakeSnapshot.display ? intakeSnapshot.display : {},
    requesterNote: String(requesterNote || '').trim(),
    errorMessages: Array.isArray(errorMessages) ? errorMessages : [],
    successRequestId: successRequestId ? Number(successRequestId) : null
  };
}

async function getDuplicateAssumptionCandidateForRequest(req, unitId) {
  const formData = getDuplicateAssumptionRequestData(req);
  const candidates = await techUnitModel.getDuplicateAssumptionCandidates({
    ...formData,
    actorRoleCodes: getCurrentRoleCodes(req),
    actorUserId: req.currentUser ? req.currentUser.user_id : null
  });

  return {
    formData,
    candidate: candidates.find((candidateRow) => Number(candidateRow.unitId) === Number(unitId)) || null
  };
}

async function renderDuplicateAssumeExistingUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        errorMessages: ['The selected existing unit is invalid. Refresh the serial check and try again.']
      }));
    }

    const submittedNonce = String(req.query.duplicateAssumptionNonce || '').trim();

    if (!hasValidDuplicateAssumptionCreateNonce(req, submittedNonce)) {
      return res.status(403).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        errorMessages: ['Open Create Unit again and refresh the serial match before assuming an existing unit.']
      }));
    }

    const { formData, candidate } = await getDuplicateAssumptionCandidateForRequest(req, unitId);

    if (!candidate) {
      return res.status(409).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        formData,
        errorMessages: ['The selected unit no longer matches the serial values entered in this Create Unit form. Refresh the serial check and choose a current candidate.']
      }));
    }

    const eligibility = candidate.duplicateAssumption || {};

    if (!eligibility.allowed) {
      return res.status(409).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        candidate,
        formData,
        errorMessages: [eligibility.message || 'This unit cannot be assumed through Create Unit intake.']
      }));
    }

    return res.render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
      candidate,
      formData
    }));
  } catch (error) {
    next(error);
  }
}

async function assumeExistingTechUnitFromDuplicateMatch(req, res, next) {
  const unitId = Number(req.params.unitId);
  const formData = getDuplicateAssumptionRequestData(req);

  try {
    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        formData,
        errorMessages: ['The selected existing unit is invalid. Refresh the serial check and try again.']
      }));
    }

    if (!hasValidDuplicateAssumptionCreateNonce(req, formData.duplicateAssumptionNonce)) {
      return res.status(403).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        formData,
        errorMessages: ['This Create Unit assumption session is no longer valid. Open Create Unit again and refresh the serial match.']
      }));
    }

    const destinationValidation = await unitLotDestinationValidationModel.assertExistingUnitDestination({
      unitId,
      destinationLotId: formData.destinationLotId
    });

    const result = await techUnitModel.assumeExistingTechUnitFromDuplicateMatch({
      unitId,
      ...formData,
      assumedByUserId: req.currentUser.user_id,
      actorRoleCodes: getCurrentRoleCodes(req)
    });

    // A Create Unit assumption is a one-time intake action. Rotate the session nonce
    // after success so a stale duplicate-match panel cannot be reused to move another unit.
    if (req.session) {
      req.session.duplicateAssumptionCreateNonce = crypto.randomUUID();
    }

    const assumptionParams = new URLSearchParams({
      assumed: '1',
      unitId: String(result.unitId)
    });
    if (destinationValidation.warningMessages.length > 0) {
      assumptionParams.set('destinationWarning', destinationValidation.warningMessages.join(' ').slice(0, 1000));
    }
    const redirectUrl = `/tech/units?${assumptionParams.toString()}`;

    if (isHtmxRequest(req)) {
      res.set('HX-Redirect', redirectUrl);
      return res.send('');
    }

    return res.redirect(redirectUrl);
  } catch (error) {
    try {
      const candidateContext = Number.isInteger(unitId) && unitId > 0
        ? await getDuplicateAssumptionCandidateForRequest(req, unitId)
        : { formData, candidate: null };

      return res.status(409).render('fragments/tech-unit-duplicate-assume-modal', buildDuplicateAssumeModalView({
        candidate: candidateContext.candidate,
        formData: candidateContext.formData || formData,
        errorMessages: [error.message || 'The existing unit could not be assumed.']
      }));
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function renderIntentionalDuplicateRequestModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        errorMessages: ['The selected matching existing unit is invalid. Refresh the serial check and try again.']
      }));
    }

    if (!isRegularTechIntentionalDuplicateRequester(req)) {
      return res.status(403).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        errorMessages: ['Intentional Duplicate requests are available only to regular Tech users during Create Unit intake.']
      }));
    }

    const requestData = getDuplicateAssumptionRequestData(req);

    if (!hasValidDuplicateAssumptionCreateNonce(req, requestData.duplicateAssumptionNonce)) {
      return res.status(403).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        errorMessages: ['Open Create Unit again and refresh the serial match before submitting an Intentional Duplicate request.']
      }));
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(getUnitFormDataFromRequest(req, { allowAssetTag: false }), formOptions, { allowOverrideInput: false });
    const validationErrors = await validateUnitForm(formData, formOptions, 'create');
    const { candidate } = await getDuplicateAssumptionCandidateForRequest(req, unitId);

    if (!candidate) {
      return res.status(409).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        errorMessages: ['The selected unit no longer matches the serial values in this Create Unit form. Refresh the serial check and choose the matching existing unit again.']
      }));
    }

    if (validationErrors.length > 0) {
      const errorMessages = ['Complete the required Create Unit details before requesting an intentional duplicate.', ...validationErrors];

      if (isHtmxRequest(req)) {
        res.set('X-BWT-Intentional-Duplicate-Readiness', 'invalid');

        return res.status(422).render('fragments/tech-unit-intentional-duplicate-request-feedback', {
          errorMessages
        });
      }

      return res.status(400).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        candidate,
        formData: requestData,
        errorMessages
      }));
    }

    const intakeSnapshot = buildIntentionalDuplicateRequestSnapshot({ formData, formOptions, candidate });

    return res.render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
      candidate,
      formData: requestData,
      intakeSnapshot
    }));
  } catch (error) {
    next(error);
  }
}

async function createIntentionalDuplicateRequest(req, res, next) {
  const unitId = Number(req.params.unitId);
  const requestData = getDuplicateAssumptionRequestData(req);
  const requestBody = req.body || {};
  const requesterNote = String(requestBody.requesterNote || '').trim();

  try {
    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 400)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        errorMessages: ['The selected matching existing unit is invalid. Refresh the serial check and try again.']
      }));
    }

    if (!isRegularTechIntentionalDuplicateRequester(req)) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 403)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        errorMessages: ['Intentional Duplicate requests are available only to regular Tech users during Create Unit intake.']
      }));
    }

    if (!hasValidDuplicateAssumptionCreateNonce(req, requestData.duplicateAssumptionNonce)) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 403)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        errorMessages: ['This Create Unit request session is no longer valid. Open Create Unit again and refresh the serial match.']
      }));
    }

    const intakeSnapshot = parseIntentionalDuplicateSnapshot(req.body.intakeSnapshotJson);

    if (!intakeSnapshot) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 400)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        requesterNote,
        errorMessages: ['The intended intake snapshot could not be read. Close this window, complete Create Unit again, and reopen the request.']
      }));
    }

    const formOptions = await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission({
      ...intakeSnapshot.formData,
      assetTag: '',
      duplicateAssumptionNonce: requestData.duplicateAssumptionNonce,
      graphicsAdapters: []
    }, formOptions, { allowOverrideInput: false });

    const snapshotMatchesRequestContext = (
      normalizeSerialInput(formData.unitSerialNumber) === requestData.unitSerialNumber
      && normalizeSerialInput(formData.biosSerialNumber) === requestData.biosSerialNumber
      && String(formData.lotId || '').trim() === String(requestData.destinationLotId || '').trim()
    );

    if (!snapshotMatchesRequestContext) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 409)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        intakeSnapshot,
        requesterNote,
        errorMessages: ['The request no longer matches the Create Unit serials or selected lot. Close this request, refresh the serial check, and reopen it.']
      }));
    }

    const validationErrors = await validateUnitForm(formData, formOptions, 'create');
    const { candidate } = await getDuplicateAssumptionCandidateForRequest(req, unitId);

    if (!candidate) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 409)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        formData: requestData,
        intakeSnapshot,
        requesterNote,
        errorMessages: ['The selected unit no longer matches the serial values in this Create Unit form. Refresh the serial check and choose the matching existing unit again.']
      }));
    }

    if (validationErrors.length > 0) {
      return res.status(intentionalDuplicateModalResponseStatus(req, 400)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        candidate,
        formData: requestData,
        intakeSnapshot,
        requesterNote,
        errorMessages: ['The intake details changed or are no longer valid. Close this request, correct Create Unit, and reopen it.', ...validationErrors]
      }));
    }

    const result = await unitRequestModel.createIntentionalDuplicateRequest({
      requestedByUserId: req.currentUser.user_id,
      matchedUnitId: candidate.unitId,
      requestedDestinationLotId: formData.lotId,
      requesterNote,
      intakeSnapshot: {
        ...intakeSnapshot,
        formData
      },
      matchedUnitSnapshot: buildMatchedUnitSnapshot(candidate)
    });

    if (req.session) {
      req.session.duplicateAssumptionCreateNonce = crypto.randomUUID();
    }

    if (isHtmxRequest(req)) {
      res.set('HX-Trigger-After-Swap', JSON.stringify({
        'intentional-duplicate-request-submitted': {
          requestId: Number(result.unitRequestId),
          requestUrl: `/unit-requests/${encodeURIComponent(result.unitRequestId)}`
        }
      }));

      return res.send('');
    }

    return res.redirect(`/unit-requests/${encodeURIComponent(result.unitRequestId)}`);
  } catch (error) {
    try {
      const candidateContext = Number.isInteger(unitId) && unitId > 0
        ? await getDuplicateAssumptionCandidateForRequest(req, unitId)
        : { formData: requestData, candidate: null };
      const intakeSnapshot = parseIntentionalDuplicateSnapshot(req.body.intakeSnapshotJson);

      return res.status(intentionalDuplicateModalResponseStatus(req, 400)).render('fragments/tech-unit-intentional-duplicate-request-modal', buildIntentionalDuplicateRequestModalView({
        candidate: candidateContext.candidate,
        formData: candidateContext.formData || requestData,
        intakeSnapshot,
        requesterNote,
        errorMessages: [error.message || 'The Intentional Duplicate request could not be submitted.']
      }));
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function getTechUnitFormOptionsWithIssues(req = null, options = {}) {
  const formOptions = await techUnitModel.getTechUnitFormOptions(options);
  const issueFormOptions = await unitIssueEntryModel.getIssueFormOptions();
  const expandedFormOptions = await unitExpandedFormModel.getExpandedFormOptions();

  return {
    ...formOptions,
    ...issueFormOptions,
    ...expandedFormOptions,
    canViewProductionWeight: userCanViewProductionWeight(req),
    canOverrideProductionWeight: userCanOverrideProductionWeight(req),
    canRequestCatalogException: canRequestCatalogException(req),
    canRequestOutcomeConfirmation: isRegularTechUnitBrowserUser(req)
  };
}

async function getEditTechUnitFormOptionsWithIssues(req, unitId) {
  const unit = await techUnitModel.getUnitById(unitId);

  return getTechUnitFormOptionsWithIssues(req, {
    includeCurrentLotId: unit && unit.lot_id ? unit.lot_id : null,
    includeCurrentUnitModelId: unit && unit.unit_model_id ? unit.unit_model_id : null,
    includeCurrentProcessorModelId: unit && unit.processor_model_id ? unit.processor_model_id : null
  });
}

async function buildEditFormData(unitId, formOptions) {
  const unitFormData = await techUnitModel.getUnitFormDataById(unitId, formOptions);

  if (!unitFormData) {
    return null;
  }

  const issueFormData = await unitIssueEntryModel.getIssueFormDataByUnitId(unitId);
  const expandedFormData = await unitExpandedFormModel.getExpandedFormDataByUnitId(unitId);

  return {
    unitId: String(unitId),
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

async function createTechUnitWithAudit({ formData, formOptions, currentUserId }) {
  let committedAssetNumber = null;

  const unitId = await techUnitModel.createTechUnit(formData, currentUserId, {
    beforeCommit: async ({ connection, unitId: pendingUnitId, assetNumber }) => {
      committedAssetNumber = Number(assetNumber) || null;

      await unitIssueEntryModel.saveIssueDetailsForUnitWithConnection(connection, {
        unitId: pendingUnitId,
        formData,
        currentUserId
      });
      await unitExpandedFormModel.saveExpandedDetailsForUnitWithConnection(connection, {
        unitId: pendingUnitId,
        formData,
        currentUserId,
        canRequestOutcomeConfirmation: Boolean(formOptions.canRequestOutcomeConfirmation)
      });

      const event = buildUnitFormAuditEvent({
        mode: 'create',
        unitId: pendingUnitId,
        actorUserId: currentUserId,
        afterFormData: {
          ...formData,
          assetTag: techUnitModel.getDisplayAssetTag(assetNumber)
        },
        formOptions
      });

      await unitAuditEventModel.createUnitAuditEvent(event, connection);
    }
  });

  return {
    unitId: Number(unitId),
    assetTag: committedAssetNumber
      ? techUnitModel.getDisplayAssetTag(committedAssetNumber)
      : ''
  };
}

function buildUnitFormSavedTriggerDetail({
  operation,
  unitId,
  assetTag,
  unitSerialNumber,
  biosSerialNumber
} = {}) {
  return {
    source: 'tech-unit-form',
    operation: operation === 'edit' ? 'edit' : 'create',
    unitId: Number(unitId) || null,
    assetTag: String(assetTag || '').trim(),
    unitSerialNumber: normalizeSerialInput(unitSerialNumber),
    biosSerialNumber: normalizeSerialInput(biosSerialNumber)
  };
}

function setUnitFormSavedTrigger(res, detail) {
  res.set('HX-Trigger-After-Swap', JSON.stringify({
    'unit-saved': detail
  }));
}

async function updateTechUnitWithAudit({
  unitId,
  formData,
  existingFormData,
  formOptions,
  currentUserId,
  actorRoleCodes
}) {
  return techUnitModel.updateTechUnit(unitId, formData, currentUserId, {
    actorRoleCodes,
    beforeCommit: async ({ connection }) => {
      await unitIssueEntryModel.saveIssueDetailsForUnitWithConnection(connection, {
        unitId,
        formData,
        currentUserId
      });
      await unitExpandedFormModel.saveExpandedDetailsForUnitWithConnection(connection, {
        unitId,
        formData,
        currentUserId,
        canRequestOutcomeConfirmation: Boolean(formOptions.canRequestOutcomeConfirmation)
      });

      const event = buildUnitFormAuditEvent({
        mode: 'edit',
        unitId,
        actorUserId: currentUserId,
        beforeFormData: existingFormData,
        afterFormData: {
          ...formData,
          assetTag: existingFormData && existingFormData.assetTag
        },
        formOptions
      });

      if (event.changes.length > 0) {
        await unitAuditEventModel.createUnitAuditEvent(event, connection);
      }
    }
  });
}

async function buildLotRequirementWorkflowForForm({
  formData,
  formOptions,
  unitId = null
} = {}) {
  const lotId = Number(formData && formData.lotId);

  if (!Number.isSafeInteger(lotId) || lotId <= 0 || !isAssignableLotId(lotId, formOptions)) {
    return null;
  }

  return techLotRequirementModel.buildWorkflowForForm({
    lotId,
    unitId,
    formData,
    formOptions
  });
}

function appendLotRequirementBlockingError(errorMessages, workflow) {
  const message = getLotRequirementBlockingMessage(workflow);

  if (message && !errorMessages.includes(message)) {
    errorMessages.push(message);
  }

  return errorMessages;
}

function appendUniqueMessages(target, messages) {
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    if (message && !target.includes(message)) {
      target.push(message);
    }
  });

  return target;
}

async function applyLatestLotUnitFormSubmissionPolicy({
  mode,
  formData,
  formOptions,
  existingFormData = null
} = {}) {
  const lotId = Number(formData && formData.lotId);

  if (!Number.isSafeInteger(lotId) || lotId <= 0 || !isAssignableLotId(lotId, formOptions)) {
    return {
      formData,
      errors: [],
      fieldErrors: []
    };
  }

  try {
    const profile = await lotUnitFormProfileModel.getRequirementAwareUnitFormProfileForLot(lotId);

    return applyUnitFormSubmissionPolicy({
      mode,
      submittedFormData: formData,
      existingFormData,
      profile: applyManufacturerApplicabilityToUnitFormProfile(profile, formData, formOptions)
    });
  } catch (error) {
    console.error('Authoritative Lot Unit form validation failed:', error);

    const databaseSetupError = error && (
      error.code === 'ER_NO_SUCH_TABLE'
      || error.code === 'ER_BAD_FIELD_ERROR'
    );
    const message = databaseSetupError
      ? 'The Lot Unit form configuration database setup is incomplete. Ask an administrator to verify the latest Lots migrations.'
      : 'The latest Lot Unit form configuration could not be verified. Saving is paused; refresh the form and try again.';

    return {
      formData,
      errors: [message],
      fieldErrors: []
    };
  }
}

async function prepareTechUnitFormSubmission({
  mode,
  formData,
  formOptions,
  unitId = null
} = {}) {
  const existingFormData = mode === 'edit'
    ? await buildEditFormData(unitId, formOptions)
    : null;

  if (mode === 'edit' && !existingFormData) {
    return {
      notFound: true,
      formData,
      errorMessages: [],
      fieldErrors: [],
      lotRequirementWorkflow: null
    };
  }

  normalizeCosmeticIssueRowsForSubmission(formData, formOptions);
  normalizeHardwareIssueRowsForSubmission(formData, formOptions);

  const submissionPolicy = await applyLatestLotUnitFormSubmissionPolicy({
    mode,
    formData,
    formOptions,
    existingFormData
  });
  const authoritativeFormData = submissionPolicy.formData;

  const errorMessages = [];

  appendUniqueMessages(errorMessages, submissionPolicy.errors);
  appendUniqueMessages(
    errorMessages,
    await validateUnitForm(authoritativeFormData, formOptions, mode)
  );

  const lotRequirementWorkflow = await buildLotRequirementWorkflowForForm({
    formData: authoritativeFormData,
    formOptions,
    unitId
  });
  appendLotRequirementBlockingError(errorMessages, lotRequirementWorkflow);

  return {
    notFound: false,
    formData: authoritativeFormData,
    errorMessages,
    fieldErrors: submissionPolicy.fieldErrors || [],
    lotRequirementWorkflow,
    existingFormData
  };
}

function getLotRequirementPreviewUnitId(req) {
  const mode = String(req && req.body ? req.body.lotRequirementMode || '' : '').trim().toLowerCase();
  const unitId = Number(req && req.body ? req.body.lotRequirementUnitId : 0);

  return mode === 'edit' && Number.isSafeInteger(unitId) && unitId > 0
    ? unitId
    : null;
}

async function getBlankFormDataWithDefaults(req = null) {
  const formOptions = await getTechUnitFormOptionsWithIssues(req);

  return {
    formOptions,
    formData: {
      ...techUnitModel.getBlankUnitFormData(formOptions),
      duplicateAssumptionNonce: getDuplicateAssumptionCreateNonce(req),
      ...unitIssueEntryModel.getBlankIssueFormData(),
      ...unitExpandedFormModel.getBlankExpandedFormData(),
      generalCommentTypeConfigValueId: formOptions.defaultCommentTypeConfigValueId || '',
      generalCommentText: ''
    }
  };
}

function streamTechUnitBrowserChanges(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  if (res.socket) {
    res.socket.setTimeout(0);
    res.socket.setKeepAlive(true);
  }

  res.write('retry: 3000\n\n');

  const sendChange = (change) => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    res.write(`id: ${change.eventId}\n`);
    res.write('event: unit-browser-change\n');
    res.write(`data: ${JSON.stringify(change)}\n\n`);

    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  const unsubscribe = subscribeToUnitBrowserChanges(sendChange);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': keep-alive\n\n');
    }
  }, 20000);

  heartbeat.unref();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
}

async function renderTechUnitsPage(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('pages/tech-units', {
      pageTitle: 'Tech Units',
      currentNav: 'tech-units',
      result,
      filters: result.filters || filters,
      tableUrl: buildTechUnitsTableUrl(result.filters || filters),
      unitBrowserBasePath: '/tech/units',
      qcPortalMode: false,
      qcSummaryUrl: buildTechUnitsQcSummaryUrl(result.filters || filters, req),
      successMessage: req.query.created === '1'
        ? 'Unit created successfully.'
        : req.query.updated === '1'
          ? 'Unit updated successfully.'
          : req.query.completed === '1'
            ? 'Unit completion recorded successfully.'
            : req.query.deleted === '1'
              ? 'Unit and all linked records were permanently deleted.'
              : req.query.parked === '1'
                ? 'Unit parked successfully. Its current lot and assignment were cleared while history and earned credit were retained.'
                : req.query.returnedToActive === '1'
                  ? 'Unit returned to Active successfully.'
                  : req.query.assumed === '1'
                    ? 'Existing unit assumed successfully. Its current lot and assignment now reflect the selected work lot; prior history and earned credit were retained.'
                    : null,
      warningMessage: String(req.query.destinationWarning || '').trim().slice(0, 1000) || null
    });
  } catch (error) {
    next(error);
  }
}

async function renderQcPortalReviewPage(req, res, next) {
  try {
    const filters = getQcPortalFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);
    const effectiveFilters = result.filters || filters;

    return res.render('pages/tech-units', {
      pageTitle: 'QC Review',
      currentNav: 'qc-review',
      result,
      filters: effectiveFilters,
      tableUrl: buildTechUnitsTableUrl(effectiveFilters, '/qc/review/table'),
      unitBrowserBasePath: '/qc/review',
      qcPortalMode: true,
      qcSummaryUrl: buildTechUnitsQcSummaryUrl(effectiveFilters, req),
      successMessage: null,
      warningMessage: null
    });
  } catch (error) {
    next(error);
  }
}

async function renderQcPortalReviewTable(req, res, next) {
  try {
    const filters = getQcPortalFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('fragments/tech-units-table', {
      result,
      filters: result.filters || filters,
      unitBrowserBasePath: '/qc/review',
      qcPortalMode: true
    });
  } catch (error) {
    next(error);
  }
}


async function renderTechUnitsExportPreview(req, res) {
  if (!canExportTechUnits(req)) {
    return res.status(403).render('fragments/tech-unit-export-preview-modal', {
      dataset: null,
      availableColumns: UNIT_EXPORT_COLUMNS,
      previewRows: [],
      csvDownloadUrl: '',
      xlsxDownloadUrl: '',
      errorMessages: ['Only Admin and Management users can export Unit data.']
    });
  }

  try {
    const filters = getFiltersFromRequest(req);
    const fullDataset = await unitExportService.buildFilteredUnitExportDataset(filters);
    const columnSelection = getUnitExportColumnSelection(req);
    const dataset = unitExportService.applyUnitExportColumnSelection(fullDataset, columnSelection.value, columnSelection);

    return res.render('fragments/tech-unit-export-preview-modal', {
      dataset,
      availableColumns: UNIT_EXPORT_COLUMNS,
      previewRows: dataset.rows,
      csvDownloadUrl: buildTechUnitsExportDownloadUrl('csv', dataset.filters),
      xlsxDownloadUrl: buildTechUnitsExportDownloadUrl('xlsx', dataset.filters),
      errorMessages: []
    });
  } catch (error) {
    console.error('Filtered Unit export preview could not be prepared:', error);
    return res.render('fragments/tech-unit-export-preview-modal', {
      dataset: null,
      availableColumns: UNIT_EXPORT_COLUMNS,
      previewRows: [],
      csvDownloadUrl: '',
      xlsxDownloadUrl: '',
      errorMessages: [error && error.message
        ? error.message
        : 'The filtered Unit export preview could not be prepared.']
    });
  }
}


async function downloadTechUnitsExport(req, res, next, format) {
  if (!canExportTechUnits(req)) {
    return res.status(403).type('text/plain').send('Only Admin and Management users can export Unit data.');
  }

  try {
    const filters = getFiltersFromRequest(req);
    const fullDataset = await unitExportService.buildFilteredUnitExportDataset(filters);
    const columnSelection = getUnitExportColumnSelection(req);
    const dataset = unitExportService.applyUnitExportColumnSelection(fullDataset, columnSelection.value, columnSelection);
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
    if (error && error.code === 'BWT_UNIT_EXPORT_COLUMNS_REQUIRED') {
      return res.status(400).type('text/plain').send(error.message);
    }

    return next(error);
  }
}

async function downloadTechUnitsCsv(req, res, next) {
  return downloadTechUnitsExport(req, res, next, 'csv');
}

async function downloadTechUnitsXlsx(req, res, next) {
  return downloadTechUnitsExport(req, res, next, 'xlsx');
}

async function renderTechUnitsQcSummary(req, res) {
  const technicianUserId = resolveQcSummaryTechnicianUserId(req);

  try {
    let summary;
    let scopeLabel;
    let gradedTechnicians = null;

    if (technicianUserId) {
      summary = await qcGradingModel.getTechnicianQcGradeSummary(technicianUserId);
      const subject = await qcGradingModel.getQcGradingTechnician(technicianUserId);
      scopeLabel = subject
        ? subject.displayName
        : (technicianUserId === normalizePositiveInteger(req.currentUser && req.currentUser.user_id)
          ? getCurrentUserDisplayName(req)
          : `User #${technicianUserId}`);
    } else {
      const overall = await qcGradingModel.getOverallQcGradeSummary();
      summary = overall.summary;
      gradedTechnicians = overall.gradedTechnicians;
      scopeLabel = 'All reviewed technicians';
    }

    const version = crypto
      .createHash('sha256')
      .update(JSON.stringify({ summary, scopeLabel, gradedTechnicians }))
      .digest('hex')
      .slice(0, 24);

    return res.render('fragments/tech-units-qc-summary', {
      qcSummary: {
        available: true,
        summary,
        scopeLabel,
        gradedTechnicians,
        version
      }
    });
  } catch (error) {
    if (!error || error.code !== 'BWT_QC_SCHEMA_REQUIRED') {
      console.error('QC grading summary could not be loaded:', error);
    }

    return res.render('fragments/tech-units-qc-summary', {
      qcSummary: {
        available: false,
        scopeLabel: technicianUserId ? 'Selected technician' : 'All reviewed technicians',
        message: error && error.code === 'BWT_QC_SCHEMA_REQUIRED'
          ? 'QC grading will appear after the Quality Control storage migration is validated.'
          : 'QC grading is temporarily unavailable. Unit browsing remains available.',
        version: 'unavailable'
      }
    });
  }
}

async function renderTechUnitsTable(req, res, next) {
  try {
    const filters = getFiltersFromRequest(req);
    const result = await buildTechUnitsResult(filters);

    return res.render('fragments/tech-units-table', {
      result,
      filters: result.filters || filters,
      unitBrowserBasePath: '/tech/units',
      qcPortalMode: false
    });
  } catch (error) {
    next(error);
  }
}


async function buildSingleTechUnitResult(req, unitId) {
  const unitRecord = await techUnitModel.getUnitById(unitId);

  if (!unitRecord) {
    return null;
  }

  const exactUnitSearch = String(
    unitRecord.asset_number
    || unitRecord.unit_serial_number
    || unitRecord.bios_serial_number
    || ''
  ).trim();
  const filters = {
    unitId: String(unitId),
    search: exactUnitSearch,
    unitState: Number(unitRecord.is_parked || 0) === 1 ? 'parked' : 'active',
    page: '1',
    perPage: '10',
    currentUserId: req.currentUser.user_id,
    restrictToCurrentAssignment: isRegularTechUnitBrowserUser(req),
    canViewParkedUnits: canViewParkedUnits(req),
    canSearchParkedUnits: canSearchParkedUnits(req)
  };
  const result = await buildTechUnitsResult(filters);

  if (!result.supported || !Array.isArray(result.units) || result.units.length !== 1) {
    return null;
  }

  return { result, filters };
}

async function renderTechUnitDetailPage(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const context = await buildSingleTechUnitResult(req, unitId);

    if (!context) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/tech-unit-detail', {
      pageTitle: context.result.units[0].assetTag || `Unit ${unitId}`,
      currentNav: 'tech-units',
      result: context.result,
      filters: context.filters
    });
  } catch (error) {
    next(error);
  }
}

async function renderTechUnitRecord(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      return res.status(404).send('Unit not found.');
    }

    const context = await buildSingleTechUnitResult(req, unitId);

    if (!context) {
      return res.status(404).send('Unit not found.');
    }

    return res.render('fragments/tech-units-table', {
      result: context.result,
      filters: context.filters,
      singleUnitView: true
    });
  } catch (error) {
    next(error);
  }
}


function buildQcReviewModalView({
  unit = null,
  latestCompletion = null,
  latestQcReview = null,
  latestQcCorrection = null,
  decisionCode = '',
  reviewNotes = '',
  errorMessages = []
} = {}) {
  const safeDecisionCode = ['accepted', 'rejected'].includes(String(decisionCode || '').trim().toLowerCase())
    ? String(decisionCode).trim().toLowerCase()
    : '';

  return {
    unit,
    latestCompletion,
    latestQcReview,
    latestQcCorrection,
    decisionCode: safeDecisionCode,
    decisionLabel: safeDecisionCode === 'accepted' ? 'Accept' : (safeDecisionCode === 'rejected' ? 'Reject' : ''),
    reviewNotes: String(reviewNotes || ''),
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

async function getQcReviewContext(unitId) {
  const safeUnitId = Number(unitId);
  if (!Number.isSafeInteger(safeUnitId) || safeUnitId <= 0) {
    return {
      unit: null,
      latestCompletion: null,
      latestQcReview: null,
      latestRecordedQcReview: null,
      latestQcCorrection: null,
      qcReviewHistory: [],
      qcCorrectionHistory: []
    };
  }

  const [unit, latestCompletionMap] = await Promise.all([
    techUnitModel.getTechUnitLifecycleSummaryById(safeUnitId),
    techUnitModel.getLatestWorkCompletionMapForUnits([safeUnitId])
  ]);
  const latestCompletion = latestCompletionMap.get(safeUnitId) || null;
  const [qcReviewHistory, qcCorrectionHistory] = latestCompletion
    ? await Promise.all([
      unitQcCheckModel.listQcChecksForCompletion(latestCompletion.unitWorkCompletionId),
      unitQcCorrectionModel.listCorrectionsForCompletion(latestCompletion.unitWorkCompletionId)
    ])
    : [[], []];
  const latestRecordedQcReview = qcReviewHistory.at(-1) || null;
  const latestQcReview = latestRecordedQcReview && !latestRecordedQcReview.isReverted
    ? latestRecordedQcReview
    : null;
  const latestQcCorrection = latestQcReview && latestQcReview.decisionCode === 'rejected'
    ? qcCorrectionHistory
      .filter((correction) => Number(correction.rejectedQcCheckId) === Number(latestQcReview.qcCheckId))
      .at(-1) || null
    : null;

  return {
    unit,
    latestCompletion,
    latestQcReview,
    latestRecordedQcReview,
    latestQcCorrection,
    qcReviewHistory,
    qcCorrectionHistory
  };
}

async function renderQcReviewModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const decisionCode = String(req.params.decisionCode || '').trim().toLowerCase();
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      errors.push('The selected unit ID is invalid.');
    } else if (!['accepted', 'rejected'].includes(decisionCode)) {
      errors.push('The selected Quality Control action is invalid.');
    } else if (!context.unit) {
      errors.push('The selected unit could not be found.');
    } else if (context.unit.isParked) {
      errors.push('Return this unit to Active before recording a Quality Control decision.');
    } else if (!context.latestCompletion) {
      errors.push('Quality Control can review a unit only after its current work cycle has been completed.');
    } else if (context.latestQcReview && context.latestQcReview.decisionCode === 'accepted') {
      errors.push('This completion cycle has already been accepted by Quality Control. Reverse completion and record a new completion cycle before reviewing it again.');
    } else if (context.latestQcReview && context.latestQcReview.decisionCode === 'rejected' && !context.latestQcCorrection) {
      errors.push('The assigned technician must mark this Unit corrected before Quality Control can review it again.');
    }

    return res.status(errors.length > 0 ? 400 : 200).render('fragments/tech-unit-qc-review-modal', buildQcReviewModalView({
      ...context,
      decisionCode,
      errorMessages: errors
    }));
  } catch (error) {
    next(error);
  }
}

async function recordQcReview(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const decisionCode = String(req.body.decisionCode || '').trim().toLowerCase();
    const reviewNotes = String(req.body.reviewNotes || '').trim();
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      errors.push('The selected unit ID is invalid.');
    } else if (!['accepted', 'rejected'].includes(decisionCode)) {
      errors.push('Choose Accept or Reject.');
    } else if (!context.unit) {
      errors.push('The selected unit could not be found.');
    } else if (context.unit.isParked) {
      errors.push('Return this unit to Active before recording a Quality Control decision.');
    } else if (!context.latestCompletion) {
      errors.push('Quality Control can review a unit only after its current work cycle has been completed.');
    } else if (context.latestQcReview && context.latestQcReview.decisionCode === 'accepted') {
      errors.push('This completion cycle has already been accepted by Quality Control. Reverse completion and record a new completion cycle before reviewing it again.');
    } else if (context.latestQcReview && context.latestQcReview.decisionCode === 'rejected' && !context.latestQcCorrection) {
      errors.push('The assigned technician must mark this Unit corrected before Quality Control can review it again.');
    }

    if (reviewNotes.length > 2000) {
      errors.push('QC notes must be 2,000 characters or fewer.');
    }

    if (decisionCode === 'rejected' && !reviewNotes) {
      errors.push('A rejection reason is required.');
    }

    if (errors.length > 0) {
      return res.status(400).render('fragments/tech-unit-qc-review-modal', buildQcReviewModalView({
        ...context,
        decisionCode,
        reviewNotes,
        errorMessages: errors
      }));
    }

    await unitQcCheckModel.recordQcReview({
      unitId,
      unitWorkCompletionId: context.latestCompletion.unitWorkCompletionId,
      reviewedByUserId: req.currentUser.user_id,
      decisionCode,
      reviewNotes
    });

    publishUnitBrowserChange({ unitId, changeType: 'qc-reviewed' });
    res.set('HX-Trigger', JSON.stringify({ 'unit-saved': true, 'qc-review-recorded': true }));
    return res.send('');
  } catch (error) {
    const unitId = Number(req.params.unitId);
    let context = { unit: null, latestCompletion: null, latestQcReview: null };

    try {
      context = await getQcReviewContext(unitId);
    } catch (contextError) {
      // Preserve the original save failure and still return a usable modal response.
    }

    if (['BWT_QC_SCHEMA_REQUIRED', 'BWT_QC_COMPLETION_NOT_FOUND', 'BWT_QC_COMPLETION_STALE', 'BWT_QC_UNIT_PARKED', 'BWT_QC_RECHECK_NOT_READY', 'BWT_QC_REVIEW_FINAL'].includes(error.code)) {
      return res.status(error.code === 'BWT_QC_COMPLETION_NOT_FOUND' ? 404 : 409).render('fragments/tech-unit-qc-review-modal', buildQcReviewModalView({
        ...context,
        decisionCode: req.body.decisionCode,
        reviewNotes: req.body.reviewNotes,
        errorMessages: [error.message]
      }));
    }

    console.error('Quality Control review save failed:', error);
    return res.status(500).render('fragments/tech-unit-qc-review-modal', buildQcReviewModalView({
      ...context,
      decisionCode: req.body.decisionCode,
      reviewNotes: req.body.reviewNotes,
      errorMessages: ['The Quality Control decision could not be saved. No review was recorded. Refresh and try again; if the problem continues, contact an administrator.']
    }));
  }
}

function canSubmitQcCorrection(req, unit) {
  if (!unit || unit.isParked) return false;
  const roleCodes = getCurrentRoleCodes(req);

  if (roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode))) {
    return true;
  }

  return roleCodes.includes('tech')
    && Number(unit.assignedToUserId) === Number(req.currentUser && req.currentUser.user_id);
}

function buildQcCorrectionModalView({ context = {}, correctionNotes = '', errorMessages = [] } = {}) {
  return {
    ...context,
    correctionNotes: String(correctionNotes || ''),
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

async function renderQcCorrectionModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      errors.push('The selected Unit ID is invalid.');
    } else if (!context.unit) {
      errors.push('The selected Unit could not be found.');
    } else if (!canSubmitQcCorrection(req, context.unit)) {
      errors.push('You do not have permission to mark this Unit corrected.');
    } else if (!context.latestCompletion) {
      errors.push('This Unit is not currently completed.');
    } else if (!context.latestQcReview || context.latestQcReview.decisionCode !== 'rejected') {
      errors.push('This Unit does not have a current QC rejection to correct.');
    } else if (context.latestQcCorrection) {
      errors.push('This Unit is already marked corrected and ready for QC recheck.');
    }

    return res.status(errors.length > 0 ? 400 : 200).render(
      'fragments/tech-unit-qc-correction-modal',
      buildQcCorrectionModalView({ context, errorMessages: errors })
    );
  } catch (error) {
    next(error);
  }
}

async function submitQcCorrection(req, res, next) {
  const unitId = Number(req.params.unitId);
  const correctionNotes = String(req.body.correctionNotes || '').trim();

  try {
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      errors.push('The selected Unit ID is invalid.');
    } else if (!context.unit) {
      errors.push('The selected Unit could not be found.');
    } else if (!canSubmitQcCorrection(req, context.unit)) {
      errors.push('You do not have permission to mark this Unit corrected.');
    } else if (!context.latestCompletion) {
      errors.push('This Unit is not currently completed.');
    } else if (!context.latestQcReview || context.latestQcReview.decisionCode !== 'rejected') {
      errors.push('This Unit does not have a current QC rejection to correct.');
    } else if (context.latestQcCorrection) {
      errors.push('This Unit is already marked corrected and ready for QC recheck.');
    }

    if (correctionNotes.length > 2000) {
      errors.push('Correction notes must be 2,000 characters or fewer.');
    }

    if (errors.length > 0) {
      return res.status(400).render(
        'fragments/tech-unit-qc-correction-modal',
        buildQcCorrectionModalView({ context, correctionNotes, errorMessages: errors })
      );
    }

    await unitQcCorrectionModel.recordCorrectionSubmission({
      unitId,
      unitWorkCompletionId: context.latestCompletion.unitWorkCompletionId,
      rejectedQcCheckId: context.latestQcReview.qcCheckId,
      submittedByUserId: req.currentUser.user_id,
      submittedByRoleCodes: getCurrentRoleCodes(req),
      correctionNotes
    });

    publishUnitBrowserChange({ unitId, changeType: 'qc-correction-submitted' });
    res.set('HX-Trigger', JSON.stringify({ 'unit-saved': true, 'qc-correction-submitted': true }));
    return res.send('');
  } catch (error) {
    let context = { unit: null, latestCompletion: null, latestQcReview: null, latestQcCorrection: null };
    try {
      context = await getQcReviewContext(unitId);
    } catch (contextError) {
      // Preserve the original write failure.
    }

    const handledCodes = new Set([
      'BWT_QC_CORRECTION_SCHEMA_REQUIRED',
      'BWT_QC_CORRECTION_COMPLETION_NOT_FOUND',
      'BWT_QC_CORRECTION_UNIT_PARKED',
      'BWT_QC_CORRECTION_COMPLETION_STALE',
      'BWT_QC_CORRECTION_PERMISSION_CHANGED',
      'BWT_QC_CORRECTION_STALE_REJECTION',
      'BWT_QC_CORRECTION_ALREADY_SUBMITTED'
    ]);

    if (handledCodes.has(error.code)) {
      return res.status(409).render(
        'fragments/tech-unit-qc-correction-modal',
        buildQcCorrectionModalView({ context, correctionNotes, errorMessages: [error.message] })
      );
    }

    console.error('QC correction submission failed:', error);
    return res.status(500).render(
      'fragments/tech-unit-qc-correction-modal',
      buildQcCorrectionModalView({
        context,
        correctionNotes,
        errorMessages: ['The correction could not be saved. No workflow change was recorded. Refresh and try again.']
      })
    );
  }
}

function canViewQcReviewDetails(req, unit) {
  if (!unit) return false;
  if (unit.isParked && !canViewParkedUnits(req)) return false;
  if (!isRegularTechUnitBrowserUser(req)) return true;

  return Number(unit.assignedToUserId) === Number(req.currentUser && req.currentUser.user_id);
}

async function renderQcReviewDetailsModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      errors.push('The selected unit ID is invalid.');
    } else if (!context.unit) {
      errors.push('The selected unit could not be found.');
    } else if (!canViewQcReviewDetails(req, context.unit)) {
      errors.push('You do not have access to this Unit review.');
    } else if (!context.latestRecordedQcReview) {
      errors.push('No Quality Control decision has been recorded for this unit.');
    }

    const roleCodes = getCurrentRoleCodes(req);
    const currentUserId = Number(req.currentUser && req.currentUser.user_id);
    const isQcRequester = roleCodes.includes('qc')
      && !roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
    const ownsLatestQcReview = Boolean(context.latestQcReview)
      && Number(context.latestQcReview.reviewedByUserId) === currentUserId;
    const pendingQcReversionRequest = context.latestQcReview
      ? await unitRequestModel.getPendingQcReversionRequestForQcCheck({ qcCheckId: context.latestQcReview.qcCheckId })
      : null;
    const canRequestQcReversion = isQcRequester && ownsLatestQcReview && !pendingQcReversionRequest;
    const canDirectlyRevertQc = Boolean(context.latestQcReview)
      && !pendingQcReversionRequest
      && roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));

    return res.status(errors.length > 0 ? 404 : 200).render('fragments/tech-unit-qc-review-details-modal', {
      ...context,
      qcStatusPresentation: buildQcStatusPresentation({
        reviews: context.qcReviewHistory,
        corrections: context.qcCorrectionHistory
      }),
      canRequestQcReversion,
      pendingQcReversionRequest,
      canDirectlyRevertQc,
      errorMessages: errors
    });
  } catch (error) {
    next(error);
  }
}



function canRequestQcReviewReversion(req) {
  const roleCodes = getCurrentRoleCodes(req);
  return roleCodes.includes('qc')
    && !roleCodes.some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function buildQcReversionRequestModalView({
  context = {},
  qcCheckId = null,
  requesterNote = '',
  pendingRequest = null,
  errorMessages = []
} = {}) {
  return {
    ...context,
    qcCheckId: Number(qcCheckId) || null,
    requesterNote: String(requesterNote || ''),
    pendingRequest,
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

async function renderQcReviewReversionRequestModal(req, res, next) {
  try {
    const unitId = normalizePositiveInteger(req.params.unitId);
    const qcCheckId = normalizePositiveInteger(req.params.qcCheckId);
    const context = await getQcReviewContext(unitId);
    const errors = [];
    let pendingRequest = null;

    if (!unitId || !qcCheckId) {
      errors.push('The selected Quality Control decision is invalid.');
    } else if (!canRequestQcReviewReversion(req)) {
      errors.push('Only a QC user can request review of their own current Quality Control decision.');
    } else if (!context.unit || !context.latestCompletion) {
      errors.push('The selected completed Unit could not be found.');
    } else if (!context.latestQcReview || Number(context.latestQcReview.qcCheckId) !== qcCheckId) {
      errors.push('This is no longer the current Quality Control decision. Refresh the Unit and review the latest QC status.');
    } else if (Number(context.latestQcReview.reviewedByUserId) !== Number(req.currentUser.user_id)) {
      errors.push('Only the QC user who recorded this current decision can request its reversion.');
    } else {
      pendingRequest = await unitRequestModel.getPendingQcReversionRequestForQcCheck({
        qcCheckId,
        requestedByUserId: req.currentUser.user_id
      });
      if (pendingRequest) errors.push(`Reversion Request #${pendingRequest.unitRequestId} is already pending for this QC decision.`);
    }

    return res.status(errors.length > 0 ? 409 : 200).render(
      'fragments/tech-unit-qc-reversion-request-modal',
      buildQcReversionRequestModalView({ context, qcCheckId, pendingRequest, errorMessages: errors })
    );
  } catch (error) {
    next(error);
  }
}

async function requestQcReviewReversion(req, res, next) {
  const unitId = normalizePositiveInteger(req.params.unitId);
  const qcCheckId = normalizePositiveInteger(req.params.qcCheckId);
  const requesterNote = String(req.body.requesterNote || '').trim();

  try {
    if (!canRequestQcReviewReversion(req)) {
      return res.status(403).render('pages/forbidden', { pageTitle: 'Access Denied' });
    }

    const result = await unitRequestModel.createQcReversionRequest({
      unitId,
      qcCheckId,
      requestedByUserId: req.currentUser.user_id,
      requesterNote
    });

    publishUnitBrowserChange({ unitId, changeType: 'qc-reversion-requested' });
    res.set('HX-Trigger', JSON.stringify({
      'qc-reversion-requested': {
        unitRequestId: result.unitRequestId,
        message: `QC Reversion Request #${result.unitRequestId} submitted for Tech Lead+ review.`
      }
    }));
    return res.send('');
  } catch (error) {
    if (error?.code === 'BWT_UNIT_REQUEST_ALREADY_PENDING' && error.unitRequestId) {
      res.set('HX-Trigger', JSON.stringify({
        'qc-reversion-requested': {
          unitRequestId: error.unitRequestId,
          message: `QC Reversion Request #${error.unitRequestId} is already pending.`
        }
      }));
      return res.send('');
    }

    const handledCodes = new Set([
      'BWT_UNIT_REQUEST_INPUT_INVALID',
      'BWT_UNIT_REQUEST_REASON_REQUIRED',
      'BWT_UNIT_REQUEST_SCHEMA_REQUIRED',
      'BWT_QC_SCHEMA_REQUIRED',
      'BWT_QC_REVERSION_STALE',
      'BWT_QC_REVERSION_REQUEST_OWNER_REQUIRED',
      'BWT_QC_REVERSION_COMPLETION_STALE',
      'BWT_QC_REVERSION_NOT_LATEST',
      'BWT_QC_REVERSION_ALREADY_REVERTED',
      'BWT_QC_REVERSION_NOT_FOUND'
    ]);
    if (!handledCodes.has(error?.code)) return next(error);

    let context = { unit: null, latestCompletion: null, latestQcReview: null, latestRecordedQcReview: null };
    try {
      context = await getQcReviewContext(unitId);
    } catch (_contextError) {
      // Preserve the original request failure.
    }

    return res.status(error.code === 'BWT_UNIT_REQUEST_REASON_REQUIRED' ? 400 : 409).render(
      'fragments/tech-unit-qc-reversion-request-modal',
      buildQcReversionRequestModalView({
        context,
        qcCheckId,
        requesterNote,
        errorMessages: [error.message]
      })
    );
  }
}

function canDirectlyRevertQcReview(req) {
  return getCurrentRoleCodes(req).some((roleCode) => ['admin', 'management', 'tech_lead'].includes(roleCode));
}

function buildQcReversionModalView({
  context = {},
  qcCheckId = null,
  reversionReason = '',
  errorMessages = []
} = {}) {
  return {
    ...context,
    qcCheckId: Number(qcCheckId) || null,
    reversionReason: String(reversionReason || ''),
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

async function renderQcReviewReversionModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const qcCheckId = Number(req.params.qcCheckId);
    const context = await getQcReviewContext(unitId);
    const errors = [];

    if (!Number.isSafeInteger(unitId) || unitId <= 0 || !Number.isSafeInteger(qcCheckId) || qcCheckId <= 0) {
      errors.push('The selected Quality Control decision is invalid.');
    } else if (!canDirectlyRevertQcReview(req)) {
      errors.push('Tech Lead+ authority is required to revert a Quality Control decision.');
    } else if (!context.unit || !context.latestCompletion) {
      errors.push('The selected completed Unit could not be found.');
    } else if (!context.latestQcReview || Number(context.latestQcReview.qcCheckId) !== qcCheckId) {
      errors.push('This is no longer the current Quality Control decision. Refresh the Unit and review the latest QC status.');
    } else {
      const pendingRequest = await unitRequestModel.getPendingQcReversionRequestForQcCheck({ qcCheckId });
      if (pendingRequest) {
        errors.push(`QC Reversion Request #${pendingRequest.unitRequestId} is pending for this decision. Review that request through Requests instead of using direct reversion.`);
      }
    }

    return res.status(errors.length > 0 ? 409 : 200).render(
      'fragments/tech-unit-qc-reversion-modal',
      buildQcReversionModalView({ context, qcCheckId, errorMessages: errors })
    );
  } catch (error) {
    next(error);
  }
}

async function revertQcReviewDirectly(req, res, next) {
  const unitId = Number(req.params.unitId);
  const qcCheckId = Number(req.params.qcCheckId);
  const reversionReason = String(req.body.reversionReason || '').trim();

  try {
    if (!canDirectlyRevertQcReview(req)) {
      return res.status(403).render('pages/forbidden', { pageTitle: 'Access Denied' });
    }

    await unitRequestModel.revertQcReviewDirectlyWithRequestGuard({
      unitId,
      qcCheckId,
      revertedByUserId: req.currentUser.user_id,
      reversionReason
    });

    publishUnitBrowserChange({ unitId, changeType: 'qc-reverted' });
    res.set('HX-Trigger', JSON.stringify({ 'qc-review-reverted': true }));
    return res.send('');
  } catch (error) {
    const handledCodes = new Set([
      'BWT_QC_SCHEMA_REQUIRED',
      'BWT_UNIT_REQUEST_SCHEMA_REQUIRED',
      'BWT_UNIT_REQUEST_INPUT_INVALID',
      'BWT_QC_REVERSION_PENDING_REQUEST',
      'BWT_QC_REVERSION_REASON_REQUIRED',
      'BWT_QC_REVERSION_REASON_TOO_LONG',
      'BWT_QC_REVERSION_NOT_FOUND',
      'BWT_QC_REVERSION_ALREADY_REVERTED',
      'BWT_QC_REVERSION_COMPLETION_STALE',
      'BWT_QC_REVERSION_NOT_LATEST',
      'BWT_QC_REVERSION_STALE'
    ]);

    if (!handledCodes.has(error && error.code)) return next(error);

    let context = { unit: null, latestCompletion: null, latestQcReview: null, latestRecordedQcReview: null };
    try {
      context = await getQcReviewContext(unitId);
    } catch (_contextError) {
      // Preserve the original reversion failure.
    }

    return res.status(error.code === 'BWT_QC_REVERSION_REASON_REQUIRED' || error.code === 'BWT_QC_REVERSION_REASON_TOO_LONG' ? 400 : 409).render(
      'fragments/tech-unit-qc-reversion-modal',
      buildQcReversionModalView({
        context,
        qcCheckId,
        reversionReason,
        errorMessages: [error.message]
      })
    );
  }
}

async function renderTechUnitHistoryPanel(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-history-panel', {
        unitId: null,
        timeline: {
          events: [],
          totalEvents: 0,
          totalChanges: 0,
          hasLegacyEvents: false,
          hasAuditEvents: false
        },
        schemaReady: false,
        errorMessages: ['The selected unit ID is invalid.']
      });
    }

    const [
      historyDetails,
      overrideHistory,
      operationalHistory,
      lotValidationAcceptanceHistory,
      auditEvents,
      creationContext,
      lotCatalog
    ] = await Promise.all([
      unitExpandedDetailModel.getHistoryDetailsForUnit(unitId),
      overrideRequestModel.listOverrideRequestsForUnit(unitId, 25),
      techUnitModel.getUnitOperationalHistory(unitId),
      lotValidationOverrideModel.listOverrideHistoryForUnit(unitId, 100),
      unitAuditEventModel.listUnitAuditEvents(unitId, { limit: 500 }),
      unitAuditEventModel.getUnitCreationContext(unitId, {
        assetTagPrefix: techUnitModel.getAssetTagPrefix()
      }),
      lotModel.listLots({ includeHidden: true })
    ]);
    const rawTimeline = buildUnitHistoryTimeline({
      auditEvents,
      historyDetails,
      overrideHistory,
      operationalHistory,
      acceptanceHistory: lotValidationAcceptanceHistory,
      creationContext,
      lotCatalog
    });
    const qcPortalHistoryView = String((req.query && req.query.qcPortal) || '').trim() === '1';
    const timeline = userCanViewProductionWeight(req) && !qcPortalHistoryView
      ? rawTimeline
      : redactProductionWeightFromTimeline(rawTimeline);

    return res.render('fragments/tech-unit-history-panel', {
      unitId,
      timeline,
      schemaReady: historyDetails.schemaReady !== false,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


async function renderMyUnitWeightPanel(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    const currentUserId = req && req.currentUser ? Number(req.currentUser.user_id) : NaN;

    if (!Number.isInteger(unitId) || unitId <= 0 || !Number.isInteger(currentUserId) || currentUserId <= 0) {
      return res.status(400).render('fragments/tech-unit-my-weight-panel', {
        completions: [],
        errorMessages: ['Your earned weight could not be loaded for the selected unit.']
      });
    }

    const lifecycleUnit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);

    if (!lifecycleUnit || (lifecycleUnit.isParked && !canViewParkedUnits(req))) {
      return res.status(404).render('fragments/tech-unit-my-weight-panel', {
        completions: [],
        errorMessages: ['Your earned weight could not be loaded for the selected unit.']
      });
    }

    const completions = await techUnitModel.getUnitWorkCompletionsForUser(unitId, currentUserId);

    return res.render('fragments/tech-unit-my-weight-panel', {
      completions,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderCompleteTechUnitWorkModal(req, res, next) {
  try {
    const preview = await techUnitModel.getUnitWorkCompletionPreview(req.params.unitId);
    const errorMessages = preview.ready ? [] : [preview.errorMessage];

    return res.render(
      'fragments/tech-unit-complete-work-modal',
      buildCompleteWorkModalView({
        preview,
        req,
        errorMessages
      })
    );
  } catch (error) {
    next(error);
  }
}

async function completeTechUnitWork(req, res, next) {
  let preview = null;

  try {
    preview = await techUnitModel.getUnitWorkCompletionPreview(req.params.unitId);

    if (!preview.ready) {
      return res.render(
        'fragments/tech-unit-complete-work-modal',
        buildCompleteWorkModalView({
          preview,
          req,
          errorMessages: [preview.errorMessage]
        })
      );
    }

    const selectedCompletedByUserId = resolveCompletionUserId({
      currentUserId: req.currentUser ? req.currentUser.user_id : null,
      assignedUserId: preview.assignedToUserId,
      roleCodes: getCurrentRoleCodes(req),
      requestedUserId: req.body ? req.body.completedByUserId : null
    });

    const completionResult = await techUnitModel.recordUnitWorkCompletion({
      unitId: preview.unitId,
      completedByUserId: selectedCompletedByUserId,
      recordedByUserId: req.currentUser.user_id,
      creditSource: 'manual_completion',
      notes: selectedCompletedByUserId === Number(req.currentUser.user_id)
        ? 'Unit completion recorded from the Tech Unit Browser.'
        : 'Unit completion recorded by Tech Lead+ for the technician assigned to the Unit.',
      actorRoleCodes: getCurrentRoleCodes(req),
      actorUserId: req.currentUser ? req.currentUser.user_id : null
    });

    publishUnitBrowserChange({ unitId: preview.unitId, changeType: 'work-completed' });

    if (isHtmxRequest(req)) {
      res.set('HX-Trigger', 'unit-work-completed');

      return res.render(
        'fragments/tech-unit-complete-work-modal',
        buildCompleteWorkModalView({
          preview: {
            ...preview,
            grantsProductionCredit: completionResult.grantsProductionCredit
          },
          req,
          selectedCompletedByUserId,
          successMessage: completionResult.grantsProductionCredit
            ? 'Unit completion and production credit were recorded successfully.'
            : 'Unit completion was recorded. The existing production cycle was retained, so no additional unit or weight credit was added.'
        })
      );
    }

    return res.redirect('/tech/units?completed=1');
  } catch (error) {
    if (isHtmxRequest(req)) {
      return res.render(
        'fragments/tech-unit-complete-work-modal',
        buildCompleteWorkModalView({
          preview,
          req,
          selectedCompletedByUserId: req.body ? req.body.completedByUserId : null,
          errorMessages: [error.message || 'Unit completion could not be recorded.']
        })
      );
    }

    next(error);
  }
}


async function renderReverseTechUnitCompletionModal(req, res, next) {
  try {
    const preview = await techUnitModel.getUnitWorkCompletionReversalPreview(
      req.params.unitId,
      req.params.completionId
    );

    return res.render(
      'fragments/tech-unit-reverse-completion-modal',
      buildReverseCompletionModalView({
        preview,
        errorMessages: preview.ready ? [] : [preview.errorMessage]
      })
    );
  } catch (error) {
    next(error);
  }
}

async function reverseTechUnitCompletion(req, res, next) {
  let preview = null;
  const reason = String(req.body && req.body.reason || '');

  try {
    preview = await techUnitModel.getUnitWorkCompletionReversalPreview(
      req.params.unitId,
      req.params.completionId
    );

    if (!preview.ready) {
      return res.render(
        'fragments/tech-unit-reverse-completion-modal',
        buildReverseCompletionModalView({
          preview,
          reason,
          errorMessages: [preview.errorMessage]
        })
      );
    }

    await techUnitModel.reverseUnitWorkCompletion({
      unitId: preview.unitId,
      unitWorkCompletionId: preview.unitWorkCompletionId,
      reversedByUserId: req.currentUser.user_id,
      reason,
      actorRoleCodes: getCurrentRoleCodes(req),
      actorUserId: req.currentUser ? req.currentUser.user_id : null
    });

    publishUnitBrowserChange({ unitId: preview.unitId, changeType: 'work-completion-reversed' });

    if (isHtmxRequest(req)) {
      res.set('HX-Trigger', 'unit-work-completion-reversed');

      return res.render(
        'fragments/tech-unit-reverse-completion-modal',
        buildReverseCompletionModalView({
          preview,
          reason,
          successMessage: 'Unit completion was undone successfully.'
        })
      );
    }

    return res.redirect('/tech/units?completionReversed=1');
  } catch (error) {
    if (isHtmxRequest(req)) {
      return res.render(
        'fragments/tech-unit-reverse-completion-modal',
        buildReverseCompletionModalView({
          preview,
          reason,
          errorMessages: [error.message || 'Unit completion could not be undone.']
        })
      );
    }

    next(error);
  }
}

function getLifecycleFormData(req = null) {
  return {
    destinationLotId: String(req && req.body ? req.body.destinationLotId || '' : '').trim(),
    assignedToUserId: String(req && req.body ? req.body.assignedToUserId || '' : '').trim()
  };
}

function buildUnitParkModalView({ mode = 'park', unit = null, formOptions = {}, formData = {}, errorMessages = [] } = {}) {
  return {
    mode,
    unit,
    formOptions: {
      lots: Array.isArray(formOptions.lots) ? formOptions.lots : [],
      lotHierarchyOptions: Array.isArray(formOptions.lotHierarchyOptions) ? formOptions.lotHierarchyOptions : [],
      assignees: Array.isArray(formOptions.assignees) ? formOptions.assignees : []
    },
    formData: {
      destinationLotId: String(formData.destinationLotId || ''),
      assignedToUserId: String(formData.assignedToUserId || '')
    },
    errorMessages: Array.isArray(errorMessages) ? errorMessages : []
  };
}

async function renderParkTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        errorMessages: ['The selected unit ID is invalid.']
      }));
    }

    const unit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        errorMessages: ['The selected unit could not be found.']
      }));
    }

    return res.render('fragments/tech-unit-park-modal', buildUnitParkModalView({
      mode: 'park',
      unit,
      errorMessages: unit.isParked
        ? ['This unit is already parked.']
        : unit.lifecycleSupported
          ? []
          : ['The Parked Unit lifecycle is not ready yet. Run the Step 6f.2 SQL migration first.']
    }));
  } catch (error) {
    next(error);
  }
}

async function parkTechUnit(req, res, next) {
  let unit = null;

  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        errorMessages: ['The selected unit ID is invalid.']
      }));
    }

    unit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        errorMessages: ['The selected unit could not be found.']
      }));
    }

    await techUnitModel.parkTechUnit({
      unitId,
      parkedByUserId: req.currentUser.user_id,
      actorRoleCodes: getCurrentRoleCodes(req),
      actorUserId: req.currentUser ? req.currentUser.user_id : null
    });

    publishUnitBrowserChange({ unitId, changeType: 'unit-parked' });

    if (isHtmxRequest(req)) {
      res.set('HX-Trigger', 'unit-saved, unit-parked');
      return res.send('');
    }

    return res.redirect('/tech/units?parked=1');
  } catch (error) {
    return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
      mode: 'park',
      unit,
      errorMessages: [error.message || 'The unit could not be parked.']
    }));
  }
}

async function renderReturnTechUnitToActiveModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        mode: 'return',
        errorMessages: ['The selected unit ID is invalid.']
      }));
    }

    const [unit, formOptions] = await Promise.all([
      techUnitModel.getTechUnitLifecycleSummaryById(unitId),
      techUnitModel.getReturnToActiveOptions()
    ]);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        mode: 'return',
        formOptions,
        errorMessages: ['The selected unit could not be found.']
      }));
    }

    return res.render('fragments/tech-unit-park-modal', buildUnitParkModalView({
      mode: 'return',
      unit,
      formOptions,
      errorMessages: !unit.isParked
        ? ['Only a parked unit can be returned to Active.']
        : unit.lifecycleSupported
          ? []
          : ['The Parked Unit lifecycle is not ready yet. Run the Step 6f.2 SQL migration first.']
    }));
  } catch (error) {
    next(error);
  }
}

async function returnTechUnitToActive(req, res, next) {
  let unit = null;
  let formOptions = { lots: [], lotHierarchyOptions: [], assignees: [] };
  const formData = getLifecycleFormData(req);

  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        mode: 'return',
        formData,
        errorMessages: ['The selected unit ID is invalid.']
      }));
    }

    [unit, formOptions] = await Promise.all([
      techUnitModel.getTechUnitLifecycleSummaryById(unitId),
      techUnitModel.getReturnToActiveOptions()
    ]);

    if (!unit) {
      return res.status(404).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        mode: 'return',
        formOptions,
        formData,
        errorMessages: ['The selected unit could not be found.']
      }));
    }

    const destinationValidation = await unitLotDestinationValidationModel.assertExistingUnitDestination({
      unitId,
      destinationLotId: formData.destinationLotId
    });

    await techUnitModel.returnTechUnitToActive({
      unitId,
      destinationLotId: formData.destinationLotId,
      assignedToUserId: formData.assignedToUserId,
      returnedByUserId: req.currentUser.user_id,
      actorRoleCodes: getCurrentRoleCodes(req),
      actorUserId: req.currentUser ? req.currentUser.user_id : null
    });

    publishUnitBrowserChange({ unitId, changeType: 'unit-returned-active' });

    const returnParams = new URLSearchParams({ returnedToActive: '1' });
    if (destinationValidation.warningMessages.length > 0) {
      returnParams.set('destinationWarning', destinationValidation.warningMessages.join(' ').slice(0, 1000));
    }
    const redirectUrl = `/tech/units?${returnParams.toString()}`;

    if (isHtmxRequest(req)) {
      res.set('HX-Redirect', redirectUrl);
      return res.send('');
    }

    return res.redirect(redirectUrl);
  } catch (error) {
    return res.status(400).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
      mode: 'return',
      unit,
      formOptions,
      formData,
      errorMessages: [error.message || 'The unit could not be returned to Active.']
    }));
  }
}

function buildPermanentDeleteModalView({ unit = null, errorMessages = [], confirmationPhrase = '' } = {}) {
  return {
    unit,
    errorMessages: Array.isArray(errorMessages) ? errorMessages : [],
    confirmationPhrase: String(confirmationPhrase || '')
  };
}

async function renderPermanentDeleteTechUnitModal(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          errorMessages: ['The selected unit ID is invalid.']
        })
      );
    }

    const unit = await techUnitModel.getTechUnitPermanentDeletionPreviewById(unitId);

    if (!unit) {
      return res.status(404).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          errorMessages: ['The selected unit could not be found.']
        })
      );
    }

    return res.render(
      'fragments/tech-unit-permanent-delete-modal',
      buildPermanentDeleteModalView({ unit })
    );
  } catch (error) {
    next(error);
  }
}

async function permanentlyDeleteTechUnit(req, res, next) {
  let unit = null;

  try {
    const unitId = Number(req.params.unitId);
    const confirmationPhrase = String(req.body.confirmationPhrase || '').trim();

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return res.status(400).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          errorMessages: ['The selected unit ID is invalid.'],
          confirmationPhrase
        })
      );
    }

    unit = await techUnitModel.getTechUnitPermanentDeletionPreviewById(unitId);

    if (!unit) {
      return res.status(404).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          errorMessages: ['The selected unit could not be found.'],
          confirmationPhrase
        })
      );
    }

    if (confirmationPhrase !== 'DELETE') {
      return res.status(400).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          unit,
          confirmationPhrase,
          errorMessages: ['Type DELETE exactly to confirm permanent deletion.']
        })
      );
    }

    const deleteResult = await techUnitModel.permanentlyDeleteTechUnit(unitId);

    if (!deleteResult.deleted) {
      const errorMessage = deleteResult.reason === 'missing'
        ? 'The selected unit could not be found.'
        : 'The unit could not be permanently deleted. No records were removed.';

      return res.status(400).render(
        'fragments/tech-unit-permanent-delete-modal',
        buildPermanentDeleteModalView({
          unit,
          errorMessages: [errorMessage]
        })
      );
    }

    publishUnitBrowserChange({ unitId, changeType: 'unit-deleted' });

    if (isHtmxRequest(req)) {
      res.set('HX-Trigger', 'unit-permanently-deleted');
      return res.send('');
    }

    return res.redirect('/tech/units?deleted=1');
  } catch (error) {
    console.error('Permanent unit deletion failed:', error);

    return res.status(400).render(
      'fragments/tech-unit-permanent-delete-modal',
      buildPermanentDeleteModalView({
        unit,
        errorMessages: ['The unit could not be permanently deleted. No records were removed.']
      })
    );
  }
}

async function renderLotUnitFormProfile(req, res, next) {
  try {
    const lotId = Number(req.query.lotId);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return res.status(400).render('fragments/tech-unit-form-profile', {
        profile: null,
        errorMessage: 'Choose a valid Lot before loading its Unit form settings.'
      });
    }

    const resolvedProfile = await lotUnitFormProfileModel.getRequirementAwareUnitFormProfileForLot(lotId);
    const profile = buildUnitFormProfilePresentation(resolvedProfile);

    return res.render('fragments/tech-unit-form-profile', {
      profile,
      errorMessage: ''
    });
  } catch (error) {
    if (error instanceof lotUnitFormProfileModel.LotUnitFormProfileDataError) {
      const statusCode = error.code === 'LOT_NOT_FOUND' ? 404 : 409;

      return res.status(statusCode).render('fragments/tech-unit-form-profile', {
        profile: null,
        errorMessage: error.message
      });
    }

    return next(error);
  }
}

async function renderLotRequirementWorkflowPreview(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const unitId = getLotRequirementPreviewUnitId(req);
    const formOptions = unitId
      ? await getEditTechUnitFormOptionsWithIssues(req, unitId)
      : await getTechUnitFormOptionsWithIssues(req);
    const formData = markProductionWeightPermission(
      getUnitFormDataFromRequest(req, { allowAssetTag: false }),
      formOptions,
      { allowOverrideInput: false }
    );
    const lotRequirementWorkflow = await buildLotRequirementWorkflowForForm({
      formData,
      formOptions,
      unitId
    });

    return res.render('fragments/tech-unit-lot-requirement-workflow', {
      lotRequirementWorkflow
    });
  } catch (error) {
    if (error && error.code === 'BWT_LOT_NOT_FOUND') {
      return res.status(404).render('fragments/tech-unit-lot-requirement-workflow', {
        lotRequirementWorkflow: null,
        lotRequirementError: error.message
      });
    }

    console.error('Tech Unit Lot requirement preview failed:', error);

    const databaseSetupError = error && (
      error.code === 'ER_NO_SUCH_TABLE'
      || error.code === 'ER_BAD_FIELD_ERROR'
    );
    const errorMessage = databaseSetupError
      ? 'The Lot requirement database setup is incomplete. Ask an administrator to verify the latest Lots migrations.'
      : 'The live Lot requirement check could not be completed. Refresh the form and try again.';

    return res.status(500).render('fragments/tech-unit-lot-requirement-workflow', {
      lotRequirementWorkflow: null,
      lotRequirementError: errorMessage
    });
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
    const submittedFormData = markProductionWeightPermission(
      getUnitFormDataFromRequest(req, { allowAssetTag: false }),
      formOptions,
      { allowOverrideInput: false }
    );
    const preparedSubmission = await prepareTechUnitFormSubmission({
      mode: 'create',
      formData: submittedFormData,
      formOptions
    });
    const {
      formData,
      errorMessages,
      fieldErrors: unitFormFieldErrors,
      lotRequirementWorkflow
    } = preparedSubmission;

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Create Unit',
        currentNav: 'tech-units',
        mode: 'create',
        formAction: '/tech/units',
        formOptions,
        formData,
        lotRequirementWorkflow,
        unitFormFieldErrors,
        errorMessages
      });
    }

    try {
      await createTechUnitWithAudit({
        formData,
        formOptions,
        currentUserId: req.currentUser.user_id
      });
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        const duplicateRecovery = await getDuplicateAssumptionRecoveryView(req, formData);

        return res.status(409).render('pages/tech-unit-form', {
          pageTitle: 'Create Unit',
          currentNav: 'tech-units',
          mode: 'create',
          formAction: '/tech/units',
          formOptions,
          formData,
          lotRequirementWorkflow,
          unitFormFieldErrors,
          canRequestIntentionalDuplicate: isRegularTechIntentionalDuplicateRequester(req),
          ...duplicateRecovery
        });
      }

      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.status(400).render('pages/tech-unit-form', {
          pageTitle: 'Create Unit',
          currentNav: 'tech-units',
          mode: 'create',
          formAction: '/tech/units',
          formOptions,
          formData,
          lotRequirementWorkflow,
          unitFormFieldErrors,
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
    const submittedFormData = markProductionWeightPermission(
      getUnitFormDataFromRequest(req, { allowAssetTag: false }),
      formOptions,
      { allowOverrideInput: false }
    );
    const preparedSubmission = await prepareTechUnitFormSubmission({
      mode: 'create',
      formData: submittedFormData,
      formOptions
    });
    const {
      formData,
      errorMessages,
      fieldErrors: unitFormFieldErrors,
      lotRequirementWorkflow
    } = preparedSubmission;

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Create Unit',
        mode: 'create',
        formAction: '/tech/units/modal',
        formOptions,
        formData,
        lotRequirementWorkflow,
        unitFormFieldErrors,
        errorMessages
      });
    }

    let savedUnit;

    try {
      savedUnit = await createTechUnitWithAudit({
        formData,
        formOptions,
        currentUserId: req.currentUser.user_id
      });
    } catch (saveError) {
      if (isDuplicateIdentifierError(saveError)) {
        const duplicateRecovery = await getDuplicateAssumptionRecoveryView(req, formData);

        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Create Unit',
          mode: 'create',
          formAction: '/tech/units/modal',
          formOptions,
          formData,
          lotRequirementWorkflow,
          unitFormFieldErrors,
          canRequestIntentionalDuplicate: isRegularTechIntentionalDuplicateRequester(req),
          ...duplicateRecovery
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
          lotRequirementWorkflow,
          unitFormFieldErrors,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    setUnitFormSavedTrigger(res, buildUnitFormSavedTriggerDetail({
      operation: 'create',
      unitId: savedUnit.unitId,
      assetTag: savedUnit.assetTag,
      unitSerialNumber: formData.unitSerialNumber,
      biosSerialNumber: formData.biosSerialNumber
    }));
    return res.send('');
  } catch (error) {
    next(error);
  }
}

async function useExistingTechUnitModal(req, res, next) {
  try {
    return res.status(409).render('fragments/tech-unit-duplicate-resolution-unavailable');
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

    const lifecycleUnit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);

    if (lifecycleUnit && lifecycleUnit.isParked) {
      return res.status(409).render('pages/error', {
        pageTitle: 'Parked Unit',
        message: 'This unit is parked. Return it to Active before editing its details.',
        error: null
      });
    }

    const formOptions = await getEditTechUnitFormOptionsWithIssues(req, unitId);
    const formData = await buildEditFormData(unitId, formOptions);

    if (!formData) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const lotRequirementWorkflow = await buildLotRequirementWorkflowForForm({
      formData,
      formOptions,
      unitId
    });

    return res.render('pages/tech-unit-form', {
      pageTitle: 'Edit Unit',
      currentNav: 'tech-units',
      mode: 'edit',
      formAction: `/tech/units/${unitId}`,
      formOptions,
      formData,
      lotRequirementWorkflow,
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
          processorBrands: [],
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

    const lifecycleUnit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);

    if (lifecycleUnit && lifecycleUnit.isParked) {
      return res.status(409).render('fragments/tech-unit-park-modal', buildUnitParkModalView({
        mode: 'park',
        unit: lifecycleUnit,
        errorMessages: ['This unit is parked. Return it to Active before editing its details.']
      }));
    }

    const formOptions = await getEditTechUnitFormOptionsWithIssues(req, unitId);
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

    const lotRequirementWorkflow = await buildLotRequirementWorkflowForForm({
      formData,
      formOptions,
      unitId
    });

    return res.render('fragments/tech-unit-modal', {
      pageTitle: 'Edit Unit',
      mode: 'edit',
      formAction: `/tech/units/${unitId}/modal`,
      formOptions,
      formData,
      lotRequirementWorkflow,
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

    const formOptions = await getEditTechUnitFormOptionsWithIssues(req, unitId);
    const submittedFormData = {
      unitId: String(unitId),
      ...markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions)
    };
    const preparedSubmission = await prepareTechUnitFormSubmission({
      mode: 'edit',
      formData: submittedFormData,
      formOptions,
      unitId
    });

    if (preparedSubmission.notFound) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Unit Not Found',
        requestedPath: req.originalUrl
      });
    }

    const {
      formData,
      errorMessages,
      fieldErrors: unitFormFieldErrors,
      lotRequirementWorkflow,
      existingFormData
    } = preparedSubmission;

    if (errorMessages.length > 0) {
      return res.status(400).render('pages/tech-unit-form', {
        pageTitle: 'Edit Unit',
        currentNav: 'tech-units',
        mode: 'edit',
        formAction: `/tech/units/${unitId}`,
        formOptions,
        formData,
        lotRequirementWorkflow,
        unitFormFieldErrors,
        errorMessages
      });
    }

    try {
      await updateTechUnitWithAudit({
        unitId,
        formData,
        existingFormData,
        formOptions,
        currentUserId: req.currentUser.user_id,
        actorRoleCodes: getCurrentRoleCodes(req),
        actorUserId: req.currentUser ? req.currentUser.user_id : null
      });
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
          lotRequirementWorkflow,
          unitFormFieldErrors,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    publishUnitBrowserChange({ unitId, changeType: 'unit-updated' });
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
          processorBrands: [],
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

    const formOptions = await getEditTechUnitFormOptionsWithIssues(req, unitId);
    const submittedFormData = {
      unitId: String(unitId),
      ...markProductionWeightPermission(getUnitFormDataFromRequest(req), formOptions)
    };
    const preparedSubmission = await prepareTechUnitFormSubmission({
      mode: 'edit',
      formData: submittedFormData,
      formOptions,
      unitId
    });

    if (preparedSubmission.notFound) {
      return res.status(404).render('fragments/tech-unit-modal', {
        pageTitle: 'Unit Not Found',
        mode: 'edit',
        formAction: '',
        formOptions,
        formData: techUnitModel.getBlankUnitFormData(formOptions),
        errorMessages: ['The selected unit could not be found.']
      });
    }

    const {
      formData,
      errorMessages,
      fieldErrors: unitFormFieldErrors,
      lotRequirementWorkflow,
      existingFormData
    } = preparedSubmission;

    if (errorMessages.length > 0) {
      return res.render('fragments/tech-unit-modal', {
        pageTitle: 'Edit Unit',
        mode: 'edit',
        formAction: `/tech/units/${unitId}/modal`,
        formOptions,
        formData,
        lotRequirementWorkflow,
        unitFormFieldErrors,
        errorMessages
      });
    }

    try {
      await updateTechUnitWithAudit({
        unitId,
        formData,
        existingFormData,
        formOptions,
        currentUserId: req.currentUser.user_id,
        actorRoleCodes: getCurrentRoleCodes(req),
        actorUserId: req.currentUser ? req.currentUser.user_id : null
      });
    } catch (saveError) {
      const friendlyError = getFriendlySaveError(saveError, formOptions);

      if (friendlyError) {
        return res.render('fragments/tech-unit-modal', {
          pageTitle: 'Edit Unit',
          mode: 'edit',
          formAction: `/tech/units/${unitId}/modal`,
          formOptions,
          formData,
          lotRequirementWorkflow,
          unitFormFieldErrors,
          errorMessages: [friendlyError]
        });
      }

      throw saveError;
    }

    publishUnitBrowserChange({ unitId, changeType: 'unit-updated' });
    setUnitFormSavedTrigger(res, buildUnitFormSavedTriggerDetail({
      operation: 'edit',
      unitId,
      assetTag: existingFormData && existingFormData.assetTag,
      unitSerialNumber: formData.unitSerialNumber,
      biosSerialNumber: formData.biosSerialNumber
    }));
    return res.send('');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  streamTechUnitBrowserChanges,
  renderTechUnitsPage,
  renderQcPortalReviewPage,
  renderQcPortalReviewTable,
  renderTechUnitsExportPreview,
  downloadTechUnitsCsv,
  downloadTechUnitsXlsx,
  renderTechUnitsQcSummary,
  renderTechUnitsTable,
  renderTechUnitDetailPage,
  renderTechUnitRecord,
  renderQcReviewModal,
  recordQcReview,
  renderQcCorrectionModal,
  submitQcCorrection,
  renderQcReviewDetailsModal,
  renderQcReviewReversionRequestModal,
  requestQcReviewReversion,
  renderQcReviewReversionModal,
  revertQcReviewDirectly,
  renderTechUnitHistoryPanel,
  renderMyUnitWeightPanel,
  renderCompleteTechUnitWorkModal,
  completeTechUnitWork,
  renderReverseTechUnitCompletionModal,
  reverseTechUnitCompletion,
  renderParkTechUnitModal,
  parkTechUnit,
  renderReturnTechUnitToActiveModal,
  returnTechUnitToActive,
  renderPermanentDeleteTechUnitModal,
  permanentlyDeleteTechUnit,
  renderNewTechUnitPage,
  renderLotUnitFormProfile,
  renderLotRequirementWorkflowPreview,
  renderEarlySerialDuplicateCheck,
  renderDuplicateAssumeExistingUnitModal,
  assumeExistingTechUnitFromDuplicateMatch,
  renderIntentionalDuplicateRequestModal,
  createIntentionalDuplicateRequest,
  renderNewTechUnitModal,
  createTechUnit,
  createTechUnitModal,
  useExistingTechUnitModal,
  renderEditTechUnitPage,
  renderEditTechUnitModal,
  updateTechUnit,
  updateTechUnitModal,
};
