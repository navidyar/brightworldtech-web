'use strict';

const { UNIT_EXPORT_COLUMNS, resolveUnitExportColumns } = require('../config/unitExportContract');
const { formatHardwareCapacityGb } = require('./hardwareCapacity');
const {
  buildHardwareComponentComparisons,
  formatHardwareComparisonList,
  formatHardwareComponentList
} = require('./hardwareComponentComparison');

const DETAIL_BATCH_SIZE = 250;

const QC_REVIEW_FILTER_LABELS = Object.freeze({
  awaiting: 'Awaiting QC',
  accepted: 'Accepted First Pass',
  corrected: 'Accepted After Correction',
  ready_recheck: 'Ready for QC Recheck',
  rejected: 'Rejected / Pending Correction'
});

const UNIT_SORT_LABELS = Object.freeze({
  date_desc: 'Newest Created First',
  date_asc: 'Oldest Created First',
  tech_az: 'Technician A–Z',
  tech_za: 'Technician Z–A',
  grade_asc: 'Cosmetic Grade Ascending',
  grade_desc: 'Cosmetic Grade Descending',
  outcome_pass_first: 'Pass First',
  outcome_fail_first: 'Fail First',
  qc_status_desc: 'QC Priority First',
  qc_status_asc: 'QC Priority Last'
});

function normalizeText(value) {
  return String(value ?? '').trim();
}

function formatSizeGb(value) {
  return formatHardwareCapacityGb(value);
}

function findIdentifier(details, typeCode) {
  const identifiers = details && Array.isArray(details.identifiers) ? details.identifiers : [];
  const identifier = identifiers.find((item) => normalizeText(item.typeCode).toLowerCase() === typeCode);
  return identifier ? normalizeText(identifier.value) : '';
}

function formatIssue(issue) {
  if (!issue) return '';

  const heading = [
    normalizeText(issue.issueLabel),
    normalizeText(issue.severityLabel),
    normalizeText(issue.locationLabel)
  ].filter(Boolean).join(' · ');
  const remark = normalizeText(issue.issueRemark);

  if (heading && remark) return `${heading}: ${remark}`;
  return remark || heading;
}

function combineRemarks(legacyRemarks, issues) {
  const values = [];
  const seen = new Set();

  [normalizeText(legacyRemarks), ...(Array.isArray(issues) ? issues.map(formatIssue) : [])]
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(key)) {
        seen.add(key);
        values.push(value);
      }
    });

  return values.join(' | ');
}


function findOptionLabel(options, selectedValue, { idKeys = ['id'], labelKeys = ['label', 'name'] } = {}) {
  const normalizedValue = String(selectedValue || '').trim();

  if (!normalizedValue) {
    return '';
  }

  const selected = (Array.isArray(options) ? options : []).find((option) => idKeys.some((key) => (
    option && option[key] !== null && option[key] !== undefined && String(option[key]) === normalizedValue
  )));

  if (!selected) {
    return normalizedValue;
  }

  for (const key of labelKeys) {
    const label = normalizeText(selected[key]);

    if (label) {
      return label;
    }
  }

  return normalizedValue;
}

function buildUnitExportScope(result = {}) {
  const filters = result.filters || {};
  const entries = [
    { label: 'Unit State', value: filters.unitState === 'parked' ? 'Parked Units' : 'Active Units' },
    { label: 'Sort', value: UNIT_SORT_LABELS[filters.sort] || normalizeText(filters.sort) || 'Newest Created First' }
  ];

  const activeFilters = [
    ['Search', normalizeText(filters.search)],
    ['Lot', findOptionLabel(result.lots, filters.lotId, { idKeys: ['lot_id', 'id'], labelKeys: ['name', 'lot_name', 'label'] })],
    ['Unit Type', findOptionLabel(result.unitCategories, filters.categoryId)],
    ['Cosmetic Grade', findOptionLabel(result.gradeFilterOptions, filters.gradeFilter, { idKeys: ['filterValue', 'id'], labelKeys: ['label'] })],
    ['Completion', filters.completionFilter === 'completed' ? 'Completed' : (filters.completionFilter === 'not_completed' ? 'Not Completed' : '')],
    ['QC Status', QC_REVIEW_FILTER_LABELS[filters.qcReviewFilter] || ''],
    ['Tech Name', findOptionLabel(result.techUserOptions, filters.techUserId)],
    ['Created Start Date', normalizeText(filters.createdStartDate)],
    ['Created End Date', normalizeText(filters.createdEndDate)],
    ['Created Window', filters.createdWindow === '24h' ? 'Last 24 Hours' : normalizeText(filters.createdWindow)]
  ];

  activeFilters.forEach(([label, value]) => {
    if (value) {
      entries.push({ label, value });
    }
  });

  if (entries.length === 2) {
    entries.push({ label: 'Filters', value: 'No additional filters' });
  }

  return entries;
}

function formatSpecsTestsRows(rows, formatter) {
  return (Array.isArray(rows) ? rows : []).map(formatter).filter(Boolean).join(' | ');
}

function getSpecsTestsLabel(specsTests, propertyName) {
  return normalizeText(specsTests && specsTests.labels ? specsTests.labels[propertyName] : '');
}

function buildUnitExportRow(unit, details = null) {
  const previousMemoryModules = details && Array.isArray(details.previousMemoryModules)
    ? details.previousMemoryModules
    : [];
  const memoryModules = details && Array.isArray(details.memoryModules)
    ? details.memoryModules
    : [];
  const previousStorageDevices = details && Array.isArray(details.previousStorageDevices)
    ? details.previousStorageDevices
    : [];
  const storageDevices = details && Array.isArray(details.storageDevices)
    ? details.storageDevices
    : [];
  const memoryTotalGb = memoryModules.length > 0
    ? Number(details.memoryTotalGb || 0)
    : Number(unit.ramGb || 0);
  const storageTotalGb = storageDevices.length > 0
    ? Number(details.storageTotalGb || 0)
    : Number(unit.storageGb || 0);
  const memoryComparisons = details && Array.isArray(details.memoryComparisons)
    ? details.memoryComparisons
    : buildHardwareComponentComparisons(previousMemoryModules, memoryModules, { kind: 'memory' });
  const storageComparisons = details && Array.isArray(details.storageComparisons)
    ? details.storageComparisons
    : buildHardwareComponentComparisons(previousStorageDevices, storageDevices, { kind: 'storage' });
  const latestTech = details && details.latestTech ? details.latestTech : null;
  const specsTests = details && details.specsTests ? details.specsTests : null;
  const specifications = details && details.specifications ? details.specifications : null;
  const techName = normalizeText(unit.assignedToName)
    || normalizeText(latestTech && (latestTech.fullName || latestTech.displayName || latestTech.name));
  const isApple = normalizeText(unit.manufacturerLabel).toLowerCase() === 'apple';

  return {
    assetTag: normalizeText(unit.assetTag),
    unitSerialNumber: findIdentifier(details, 'unit_serial_number'),
    biosSerialNumber: findIdentifier(details, 'bios_serial_number'),
    unitType: normalizeText(unit.categoryLabel).replace(/^Unknown$/, ''),
    manufacturer: normalizeText(unit.manufacturerLabel).replace(/^—$/, ''),
    model: normalizeText(unit.modelLabel).replace(/^—$/, ''),
    screenSize: normalizeText(unit.screenSizeLabel).replace(/^—$/, ''),
    modelYear: isApple && unit.modelYear ? String(unit.modelYear) : '',
    appleModelNumber: normalizeText(specsTests && specsTests.appleModelNumber),
    operatingSystem: normalizeText(unit.operatingSystemLabel).replace(/^—$/, ''),
    osBuild: normalizeText(specifications && specifications.osBuild),
    biosVersion: normalizeText(specifications && specifications.biosVersion),
    keyboardLanguage: normalizeText(specifications && specifications.keyboardLanguageLabel).replace(/^—$/, ''),
    wifiCardPresent: isApple ? '' : getSpecsTestsLabel(specsTests, 'wifiCardPresentConfigValueId'),
    chargerIncluded: getSpecsTestsLabel(specsTests, 'chargerIncludedConfigValueId'),
    displayType: getSpecsTestsLabel(specsTests, 'displayTypeConfigValueId'),
    nativeScreenResolution: isApple ? '' : getSpecsTestsLabel(specsTests, 'nativeScreenResolutionConfigValueId'),
    refreshRate: isApple ? '' : getSpecsTestsLabel(specsTests, 'refreshRateConfigValueId'),
    color: getSpecsTestsLabel(specsTests, 'colorConfigValueId'),
    cameras: formatSpecsTestsRows(specsTests && specsTests.cameras, (row) => [row.cameraTypeLabel, row.cameraLocationLabel, row.testResultLabel].filter(Boolean).join(' · ')),
    batteries: formatSpecsTestsRows(specsTests && specsTests.batteries, (row) => [row.healthPercent !== '' ? `${row.healthPercent}%` : '', isApple && row.cycleCount !== '' ? `${row.cycleCount} cycles` : ''].filter(Boolean).join(' · ')),
    biometrics: formatSpecsTestsRows(specsTests && specsTests.biometrics, (row) => [row.hardwareLabel, row.testResultLabel].filter(Boolean).join(' · ')),
    portsExpansion: formatSpecsTestsRows(specsTests && specsTests.ports, (row) => [row.portTypeLabel, row.portCount !== '' ? `x${row.portCount}` : ''].filter(Boolean).join(' ')),
    keyboardTest: getSpecsTestsLabel(specsTests, 'keyboardTestResultConfigValueId'),
    touchscreenTest: normalizeText(specifications && specifications.touchscreenStatusLabel).replace(/^—$/, ''),
    microphoneCheck: getSpecsTestsLabel(specsTests, 'microphoneCheckResultConfigValueId'),
    audioOutputCheck: getSpecsTestsLabel(specsTests, 'audioOutputCheckResultConfigValueId'),
    allScrewsPresent: getSpecsTestsLabel(specsTests, 'allScrewsPresentConfigValueId'),
    diagnosticsTest: normalizeText(specifications && specifications.completeDiagnosticsStatusLabel).replace(/^—$/, ''),
    threatProtectionScan: normalizeText(specifications && specifications.virusCheckStatusLabel).replace(/^—$/, ''),
    driverCheck: isApple ? '' : normalizeText(specifications && specifications.driverCheckStatusLabel).replace(/^—$/, ''),
    absoluteStatus: isApple ? '' : normalizeText(specifications && specifications.absoluteStatusLabel).replace(/^—$/, ''),
    biosLock: isApple ? '' : getSpecsTestsLabel(specsTests, 'biosLockConfigValueId'),
    efiLock: isApple ? getSpecsTestsLabel(specsTests, 'efiLockConfigValueId') : '',
    mdmLock: getSpecsTestsLabel(specsTests, 'mdmLockConfigValueId'),
    icloudActivationLock: isApple ? getSpecsTestsLabel(specsTests, 'icloudActivationLockConfigValueId') : '',
    ceCertification: isApple ? getSpecsTestsLabel(specsTests, 'ceCertificationConfigValueId') : '',
    openBoxStatus: isApple ? getSpecsTestsLabel(specsTests, 'openBoxStatusConfigValueId') : '',
    boxLanguage: isApple ? getSpecsTestsLabel(specsTests, 'boxLanguageConfigValueId') : '',
    cpu: normalizeText(unit.processorLabel).replace(/^—$/, ''),
    shortForm: normalizeText(unit.processorShortForm),
    previousMemorySize: formatSizeGb(unit.previousRamGb),
    currentMemorySize: formatSizeGb(memoryTotalGb),
    previousStorageSize: formatSizeGb(unit.previousStorageGb),
    currentStorageSize: formatSizeGb(storageTotalGb),
    previousMemoryModules: formatHardwareComponentList(previousMemoryModules, { kind: 'memory' }),
    currentMemoryModules: formatHardwareComponentList(memoryModules, { kind: 'memory' }),
    memoryModuleChanges: formatHardwareComparisonList(memoryComparisons),
    previousStorageDevices: formatHardwareComponentList(previousStorageDevices, { kind: 'storage' }),
    currentStorageDevices: formatHardwareComponentList(storageDevices, { kind: 'storage' }),
    storageDeviceChanges: formatHardwareComparisonList(storageComparisons),
    techName,
    batteryHealth: Number.isFinite(Number(unit.batteryHealthPercent)) && unit.batteryHealthPercent !== null
      ? `${Number(unit.batteryHealthPercent).toFixed(1)}%`
      : '',
    cosmeticGrade: normalizeText(details && details.currentGrade ? details.currentGrade.gradeLabel : '').replace(/^—$/, ''),
    passFail: normalizeText(details && details.currentOutcome ? details.currentOutcome.outcomeLabel : '').replace(/^—$/, ''),
    hardwareRemarks: combineRemarks(unit.hardwareNotes, details ? details.hardwareIssues : []),
    cosmeticRemarks: combineRemarks(unit.cosmeticNotes, details ? details.cosmeticIssues : [])
  };
}


function buildCapacityTotals(units = [], detailsByUnitId = new Map()) {
  const totals = {
    previousMemoryGb: 0,
    currentMemoryGb: 0,
    previousStorageGb: 0,
    currentStorageGb: 0,
    previousMemoryRecordedUnits: 0,
    currentMemoryRecordedUnits: 0,
    previousStorageRecordedUnits: 0,
    currentStorageRecordedUnits: 0
  };

  units.forEach((unit) => {
    const details = detailsByUnitId.get(Number(unit.unitId)) || null;
    const previousMemory = Number(unit.previousRamGb || 0);
    const currentMemoryRows = details && Array.isArray(details.memoryModules) ? details.memoryModules : [];
    const currentStorageRows = details && Array.isArray(details.storageDevices) ? details.storageDevices : [];
    const currentMemory = currentMemoryRows.length > 0
      ? Number(details.memoryTotalGb || 0)
      : Number(unit.ramGb || 0);
    const previousStorage = Number(unit.previousStorageGb || 0);
    const currentStorage = currentStorageRows.length > 0
      ? Number(details.storageTotalGb || 0)
      : Number(unit.storageGb || 0);

    if (previousMemory > 0) {
      totals.previousMemoryGb += previousMemory;
      totals.previousMemoryRecordedUnits += 1;
    }
    if (currentMemory > 0) {
      totals.currentMemoryGb += currentMemory;
      totals.currentMemoryRecordedUnits += 1;
    }
    if (previousStorage > 0) {
      totals.previousStorageGb += previousStorage;
      totals.previousStorageRecordedUnits += 1;
    }
    if (currentStorage > 0) {
      totals.currentStorageGb += currentStorage;
      totals.currentStorageRecordedUnits += 1;
    }
  });

  return Object.freeze(totals);
}

function applyUnitExportColumnSelection(dataset, value, { selectionProvided = false } = {}) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    const error = new Error('The filtered Unit export dataset is invalid.');
    error.code = 'BWT_UNIT_EXPORT_DATASET_INVALID';
    throw error;
  }

  const columns = resolveUnitExportColumns(value, { selectionProvided });
  const selectedLabels = columns.map((column) => column.label);
  const scope = Array.isArray(dataset.scope)
    ? dataset.scope.filter((entry) => entry && entry.label !== 'Selected Columns')
    : [];

  scope.push({
    label: 'Selected Columns',
    value: `${columns.length} of ${UNIT_EXPORT_COLUMNS.length}: ${selectedLabels.join(', ')}`
  });

  return {
    ...dataset,
    columns,
    scope
  };
}

async function loadExpandedDetails(unitIds, detailModel = null) {
  const resolvedDetailModel = detailModel || require('../models/unitExpandedDetailModel');
  const detailsByUnitId = new Map();

  for (let index = 0; index < unitIds.length; index += DETAIL_BATCH_SIZE) {
    const batch = unitIds.slice(index, index + DETAIL_BATCH_SIZE);
    const batchMap = await resolvedDetailModel.listExpandedDetailsForUnits(batch);
    batchMap.forEach((details, unitId) => detailsByUnitId.set(Number(unitId), details));
  }

  return detailsByUnitId;
}

async function buildUnitExportDatasetFromListResult(result, exportFilters, detailModel, scope) {
  if (!result || !result.supported) {
    const error = new Error(result && result.message ? result.message : 'Unit export is unavailable.');
    error.code = 'BWT_UNIT_EXPORT_UNAVAILABLE';
    throw error;
  }

  const units = Array.isArray(result.units) ? result.units : [];
  const expectedRows = Number(result.pagination && result.pagination.totalRows);

  if (Number.isFinite(expectedRows) && expectedRows !== units.length) {
    const error = new Error(`Unit export count mismatch: Unit query reported ${expectedRows}, but ${units.length} Unit record(s) were loaded.`);
    error.code = 'BWT_UNIT_EXPORT_COUNT_MISMATCH';
    throw error;
  }

  const unitIds = units
    .map((unit) => Number(unit.unitId))
    .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0);
  const detailsByUnitId = unitIds.length > 0
    ? await loadExpandedDetails(unitIds, detailModel)
    : new Map();
  const rows = units.map((unit) => buildUnitExportRow(
    unit,
    detailsByUnitId.get(Number(unit.unitId)) || null
  ));
  const capacityTotals = buildCapacityTotals(units, detailsByUnitId);

  return {
    columns: UNIT_EXPORT_COLUMNS,
    rows,
    totalRows: rows.length,
    filters: result.filters || exportFilters,
    browserTotalRows: Number.isFinite(expectedRows) ? expectedRows : rows.length,
    capacityTotals,
    scope: Array.isArray(scope) ? scope : buildUnitExportScope(result)
  };
}

async function buildFilteredUnitExportDataset(filters = {}, dependencies = {}) {
  const unitModel = dependencies.techUnitModel || require('../models/techUnitModel');
  const detailModel = dependencies.unitExpandedDetailModel || require('../models/unitExpandedDetailModel');
  const exportFilters = {
    ...filters,
    page: '1',
    perPage: 'all'
  };
  const result = await unitModel.listTechUnits(exportFilters);

  return buildUnitExportDatasetFromListResult(result, exportFilters, detailModel);
}

function buildLotUnitExportScope(lotScope = {}) {
  const selectedLot = lotScope.selectedLot || {};
  const includedLots = Array.isArray(lotScope.includedLots) ? lotScope.includedLots : [];
  const selectedLotName = normalizeText(selectedLot.lot_name || selectedLot.name) || 'Selected Lot';
  const includedNames = includedLots
    .map((lot) => normalizeText(lot && (lot.lot_name || lot.name)))
    .filter(Boolean);
  const isDescendantScope = lotScope.mode === 'descendants';
  const selectedScopeNames = Array.isArray(lotScope.selectedScopeLots)
    ? lotScope.selectedScopeLots
        .map((lot) => normalizeText(lot && (lot.lot_name || lot.name)))
        .filter(Boolean)
    : [];
  const lotScopeLabel = lotScope.mode === 'selected' && selectedScopeNames.length > 0
    ? selectedScopeNames.join(' + ')
    : (isDescendantScope ? `${selectedLotName} + descendants` : selectedLotName);

  return [
    { label: 'Unit State', value: 'Active Units' },
    {
      label: 'Lot Scope',
      value: lotScopeLabel
    },
    {
      label: 'Included Lots',
      value: includedNames.length > 0
        ? `${includedNames.length}: ${includedNames.join(', ')}`
        : 'No Lots'
    }
  ];
}

async function buildLotScopedUnitExportDataset(lotScope = {}, dependencies = {}) {
  const unitModel = dependencies.techUnitModel || require('../models/techUnitModel');
  const detailModel = dependencies.unitExpandedDetailModel || require('../models/unitExpandedDetailModel');
  const includedLotIds = Array.isArray(lotScope.includedLotIds)
    ? lotScope.includedLotIds
        .map((lotId) => Number(lotId))
        .filter((lotId) => Number.isSafeInteger(lotId) && lotId > 0)
    : [];

  if (includedLotIds.length === 0) {
    const error = new Error('The selected Lot does not have an exportable Unit scope.');
    error.code = 'BWT_LOT_EXPORT_SCOPE_EMPTY';
    throw error;
  }

  const exportFilters = {
    lotIds: includedLotIds,
    unitState: 'active',
    sort: 'date_desc',
    page: '1',
    perPage: 'all',
    restrictToCurrentAssignment: false,
    allowAnyLotFilter: true,
    canViewParkedUnits: true,
    canSearchParkedUnits: false
  };
  const result = await unitModel.listTechUnits(exportFilters);

  return buildUnitExportDatasetFromListResult(
    result,
    exportFilters,
    detailModel,
    buildLotUnitExportScope(lotScope)
  );
}

module.exports = {
  DETAIL_BATCH_SIZE,
  applyUnitExportColumnSelection,
  buildCapacityTotals,
  buildFilteredUnitExportDataset,
  buildLotScopedUnitExportDataset,
  buildLotUnitExportScope,
  buildUnitExportScope,
  buildUnitExportRow,
  combineRemarks,
  findOptionLabel,
  findIdentifier,
  formatIssue,
  formatSizeGb,
  loadExpandedDetails
};
