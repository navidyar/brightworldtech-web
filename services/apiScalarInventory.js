'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const { pool } = require('../models/db');
const techUnitModel = require('../models/techUnitModel');
const unitExpandedFormModel = require('../models/unitExpandedFormModel');
const unitAuditEventModel = require('../models/unitAuditEventModel');
const productionCycleModel = require('../models/productionCycleModel');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const { buildUnitFormAuditEvent } = require('./unitAuditSnapshot');
const { effectiveSourceCode } = require('./unitFieldAuthority');
const { resolveSystemConfigValue } = require('./apiConfigValueResolver');
const {
  SUPPORTED_SCALAR_FIELDS,
  normalizeScalarObservations,
  decideScalarApplication,
  assessFieldOwnership,
  extractAppliedToolValue,
  valuesEquivalent
} = require('./apiScalarInventoryPolicy');
const {
  resolveManufacturer,
  resolveModel,
  resolveProcessor,
  resolveOperatingSystem,
  storedResolutionValue
} = require('./apiCatalogInventory');
const {
  MEMORY_FIELD_KEY,
  normalizeMemoryObservation,
  resolveMemoryObservation,
  loadCurrentMemoryRows,
  buildMemoryPlan,
  applyMemoryPlan,
  syncMemorySummary,
  toFormMemoryModules,
  memorySpeedSummary
} = require('./apiMemoryInventory');
const {
  STORAGE_FIELD_KEY,
  normalizeStorageObservation,
  resolveStorageObservation,
  loadCurrentStorageRows,
  buildStoragePlan,
  applyStoragePlan,
  syncStorageSummary,
  toFormStorageDevices,
  storageDetailSummary
} = require('./apiStorageInventory');
const {
  GRAPHICS_FIELD_KEY,
  DISPLAY_FIELD_KEY,
  SCREEN_SIZE_FIELD_KEY,
  NATIVE_RESOLUTION_FIELD_KEY,
  normalizeGraphicsObservation,
  normalizeDisplayObservation,
  resolveGraphicsObservation,
  resolveDisplayObservation,
  loadCurrentGraphicsRows,
  loadCurrentDisplayState,
  loadLatestAppliedCompositeValue,
  buildGraphicsPlan,
  buildDisplayPlan,
  applyGraphicsPlan,
  applyDisplayPlan,
  graphicsSummary,
  displaySummary
} = require('./apiGraphicsDisplayInventory');
const {
  CONNECTIVITY_FIELD_KEY,
  SECURITY_FIELD_KEY,
  POWER_FIELD_KEY,
  WIFI_FORM_FIELD_KEY,
  ABSOLUTE_FORM_FIELD_KEY,
  normalizeConnectivityObservation,
  normalizeSecurityObservation,
  normalizePowerObservation,
  resolveConnectivitySecurityPowerObservation,
  loadCurrentConnectivitySecurityPowerState,
  buildConnectivitySecurityPowerPlan,
  applyConnectivitySecurityPowerPlan,
  currentToolSnapshot,
  sectionToolSnapshot,
  summary: connectivitySecurityPowerSummary
} = require('./apiConnectivitySecurityPowerInventory');
const {
  BATTERY_FIELD_KEY,
  BATTERY_HEALTH_FIELD_KEY,
  CAMERA_HARDWARE_FIELD_KEY,
  FINGERPRINT_HARDWARE_FIELD_KEY,
  DIAGNOSTICS_FIELD_KEY,
  KEYBOARD_TEST_FIELD_KEY,
  MICROPHONE_TEST_FIELD_KEY,
  AUDIO_TEST_FIELD_KEY,
  DRIVER_CHECK_FIELD_KEY,
  THREAT_PROTECTION_FIELD_KEY,
  CAMERA_TEST_FIELD_KEY,
  BIOMETRIC_HARDWARE_FIELD_KEY,
  BIOMETRICS_TEST_FIELD_KEY,
  TOUCHSCREEN_TEST_FIELD_KEY,
  COMPLETE_DIAGNOSTICS_FIELD_KEY,
  normalizeBatteryObservation,
  normalizeCameraHardwareObservation,
  normalizeFingerprintHardwareObservation,
  normalizeDiagnosticsObservation,
  loadCurrentHardwareDiagnosticsState,
  buildHardwareDiagnosticsPlan,
  applyHardwareDiagnosticsPlan,
  currentToolSnapshot: hardwareDiagnosticsToolSnapshot,
  sectionToolSnapshot: hardwareDiagnosticsSectionToolSnapshot,
  summary: hardwareDiagnosticsSummary
} = require('./apiHardwareDiagnosticsInventory');

class ApiScalarInventoryError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiScalarInventoryError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeIdentifierComparableValue(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

async function applyToolIdentityEnrichment(connection, unitId, body, resolvedSecurity) {
  const unitSerialNumber = normalizeText(body.unit_serial_number ?? body.unitSerialNumber ?? body.unit_serial, 120);
  const biosSerialNumber = normalizeText(body.bios_serial_number ?? body.biosSerialNumber ?? body.bios_serial, 120);
  const topLevelSystemUuid = normalizeText(body.system_uuid ?? body.systemUuid ?? body.uuid, 64);
  const legacySecurityUuid = resolvedSecurity?.state === 'known'
    ? normalizeText(resolvedSecurity.value?.system_uuid, 64)
    : '';

  if (topLevelSystemUuid && legacySecurityUuid
    && normalizeIdentifierComparableValue(topLevelSystemUuid) !== normalizeIdentifierComparableValue(legacySecurityUuid)) {
    throw new ApiScalarInventoryError(422, 'SYSTEM_UUID_PAYLOAD_CONFLICT', 'Top-level system_uuid conflicts with the legacy security.system_uuid value. Submit System UUID only at the top level.');
  }

  const submissions = [
    ['unit_serial_number', unitSerialNumber, () => techUnitModel.applyToolSerialIdentifier(connection, unitId, 'unit_serial_number', unitSerialNumber)],
    ['bios_serial_number', biosSerialNumber, () => techUnitModel.applyToolSerialIdentifier(connection, unitId, 'bios_serial_number', biosSerialNumber)],
    ['system_uuid', topLevelSystemUuid || legacySecurityUuid, () => techUnitModel.applyToolSystemUuidIdentifier(connection, unitId, topLevelSystemUuid || legacySecurityUuid)]
  ].filter(([, value]) => value);

  const results = [];
  for (const [fieldKey, value, apply] of submissions) {
    try {
      const result = await apply();
      if (result) results.push({ fieldKey, ...result });
    } catch (error) {
      const configErrors = new Set([
        'BWT_UNIT_SERIAL_IDENTIFIER_NOT_CONFIGURED',
        'BWT_BIOS_SERIAL_IDENTIFIER_NOT_CONFIGURED',
        'BWT_SYSTEM_UUID_IDENTIFIER_NOT_CONFIGURED'
      ]);
      if (configErrors.has(error?.code)) {
        throw new ApiScalarInventoryError(409, 'API_CONTRACT_MIGRATION_REQUIRED', error.message);
      }

      const conflictCodes = {
        BWT_UNIT_SERIAL_IDENTITY_CONFLICT: 'UNIT_SERIAL_IDENTITY_CONFLICT',
        BWT_BIOS_SERIAL_IDENTITY_CONFLICT: 'BIOS_SERIAL_IDENTITY_CONFLICT',
        BWT_SYSTEM_UUID_IDENTITY_CONFLICT: 'SYSTEM_UUID_IDENTITY_CONFLICT'
      };
      if (conflictCodes[error?.code]) {
        throw new ApiScalarInventoryError(409, conflictCodes[error.code], error.message, {
          field_key: fieldKey,
          submitted_value: error.submittedValue || value,
          current_value: error.currentValue || null,
          matched_unit_ids: error.matchedUnitIds || []
        });
      }
      throw error;
    }
  }
  return results;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiScalarInventoryError(422, 'INVALID_COLLECTED_AT', 'collected_at must be a valid date/time when supplied.');
  }
  return parsed;
}

async function tableColumnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.row_count || 0) === 1;
}

function keyboardLanguageAliases(value) {
  const submitted = String(value || '').trim();
  const normalized = submitted.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const usEnglishAliases = new Set([
    'usen', 'enus', 'usenglish', 'englishus', 'englishunitedstates', 'unitedstatesenglish'
  ]);
  return usEnglishAliases.has(normalized)
    ? ['US English', 'English US', 'English (US)', 'English (United States)', 'en-US']
    : [];
}

function parseStoredJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function jsonValue(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function serializeObservationRow(row) {
  return {
    field_key: row.field_key,
    state: row.observation_state,
    value: parseStoredJson(row.observed_value_json),
    application_status: row.application_status,
    application_reason: row.application_reason || ''
  };
}

async function findExistingRun(connection, toolSource, reportId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT tool_run_id, unit_id, tool_source, user_id, report_id, report_schema,
            tool_version, collected_at, received_at, completed_at, status, production_cycle_key
       FROM unit_tool_runs
      WHERE tool_source = ? AND report_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [toolSource, reportId]
  );
  return rows[0] || null;
}

async function loadRunObservations(connection, toolRunId) {
  const [rows] = await connection.query(
    `SELECT field_key, observation_state, observed_value_json,
            application_status, application_reason
       FROM unit_tool_observations
      WHERE tool_run_id = ?
      ORDER BY unit_tool_observation_id`,
    [toolRunId]
  );
  return rows.map(serializeObservationRow);
}

async function serializeExistingRun(connection, run, { replayed = true } = {}) {
  return {
    status: run.status === 'completed' ? 'COMPLETED' : String(run.status || '').toUpperCase(),
    replayed,
    tool_run_id: Number(run.tool_run_id),
    unit_id: Number(run.unit_id),
    report_id: run.report_id,
    tool_source: run.tool_source,
    submitted_by_user_id: Number(run.user_id) || null,
    production_cycle_key: run.production_cycle_key || null,
    observations: await loadRunObservations(connection, run.tool_run_id)
  };
}

async function loadManualSources(connection, unitId, fieldKeys) {
  if (!fieldKeys.length) return new Map();
  const placeholders = fieldKeys.map(() => '?').join(', ');
  const currentProductionCycleKey = await productionCycleModel.getCurrentProductionCycleKey(unitId, connection);
  const [rows] = await connection.query(
    `SELECT field_key, source_code, override_production_cycle_key
       FROM unit_field_sources
      WHERE unit_id = ? AND field_key IN (${placeholders})`,
    [unitId, ...fieldKeys]
  );
  return new Map(rows.map((row) => [
    String(row.field_key),
    effectiveSourceCode({
      sourceCode: row.source_code,
      overrideProductionCycleKey: row.override_production_cycle_key
    }, currentProductionCycleKey)
  ]));
}

async function loadLatestAppliedToolValues(connection, unitId, fieldKeys) {
  if (!fieldKeys.length) return new Map();
  const placeholders = fieldKeys.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT observation.field_key, observation.observed_value_json
       FROM unit_tool_observations observation
       INNER JOIN (
         SELECT field_key, MAX(unit_tool_observation_id) AS latest_id
           FROM unit_tool_observations
          WHERE unit_id = ?
            AND field_key IN (${placeholders})
            AND application_status IN ('applied', 'unchanged')
          GROUP BY field_key
       ) latest ON latest.latest_id = observation.unit_tool_observation_id`,
    [unitId, ...fieldKeys]
  );
  return new Map(rows.map((row) => {
    const fieldKey = String(row.field_key);
    const storedValue = parseStoredJson(row.observed_value_json);
    return [fieldKey, extractAppliedToolValue(fieldKey, storedValue)];
  }));
}

async function loadLatestAppliedCompositeToolObservation(connection, unitId, fieldKey, productionCycleKey) {
  const [rows] = await connection.query(
    `SELECT observation.observed_value_json, run.tool_source
       FROM unit_tool_observations observation
       JOIN unit_tool_runs run ON run.tool_run_id = observation.tool_run_id
      WHERE observation.unit_id = ?
        AND observation.field_key = ?
        AND observation.application_status IN ('applied', 'unchanged')
        AND run.production_cycle_key = ?
      ORDER BY observation.unit_tool_observation_id DESC
      LIMIT 1`,
    [unitId, fieldKey, productionCycleKey]
  );
  if (!rows.length) return { value: null, toolSource: '' };
  return {
    value: parseStoredJson(rows[0].observed_value_json),
    toolSource: String(rows[0].tool_source || '').trim().toLowerCase()
  };
}

async function lockUnitState(connection, unitId) {
  const [unitRows] = await connection.query(
    `SELECT u.unit_id, u.lot_id, u.assigned_to_user_id, u.is_parked, u.unit_category_config_value_id,
            u.manufacturer_id, u.unit_model_id, u.processor_model_id,
            u.processor_speed_ghz, u.operating_system_config_value_id,
            um.manufacturer_id AS unit_model_manufacturer_id
       FROM units u
       LEFT JOIN unit_models um ON um.unit_model_id = u.unit_model_id
      WHERE u.unit_id = ?
      LIMIT 1
      FOR UPDATE`,
    [unitId]
  );
  const unit = unitRows[0] || null;
  if (!unit) return null;

  const hasWindowsDisplayVersion = await tableColumnExists(connection, 'unit_specifications', 'windows_display_version');
  const windowsDisplayVersionSelect = hasWindowsDisplayVersion
    ? 'windows_display_version'
    : 'NULL AS windows_display_version';
  const [specRows] = await connection.query(
    `SELECT unit_id, bios_version, os_build, keyboard_language_config_value_id, ${windowsDisplayVersionSelect}
       FROM unit_specifications
      WHERE unit_id = ?
      LIMIT 1
      FOR UPDATE`,
    [unitId]
  );
  const specifications = specRows[0] || null;
  return {
    ...unit,
    specifications_unit_id: specifications ? specifications.unit_id : null,
    bios_version: specifications ? specifications.bios_version : null,
    os_build: specifications ? specifications.os_build : null,
    windows_display_version: specifications ? specifications.windows_display_version : null,
    keyboard_language_config_value_id: specifications ? specifications.keyboard_language_config_value_id : null,
    has_windows_display_version: hasWindowsDisplayVersion
  };
}


async function ensureUnitSpecificationsRow(connection, unitId, userId) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_specifications'
        AND COLUMN_NAME IN ('unit_id', 'created_by_user_id', 'updated_by_user_id')`
  );
  const columns = new Set(rows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
  if (!columns.has('unit_id')) {
    throw new ApiScalarInventoryError(409, 'UNIT_SPECIFICATIONS_MISSING', 'The Unit Specifications table is not available.');
  }

  const insertColumns = ['unit_id'];
  const values = [unitId];
  if (columns.has('created_by_user_id')) {
    insertColumns.push('created_by_user_id');
    values.push(userId);
  }
  if (columns.has('updated_by_user_id')) {
    insertColumns.push('updated_by_user_id');
    values.push(userId);
  }
  const placeholders = insertColumns.map(() => '?').join(', ');
  await connection.query(
    `INSERT INTO unit_specifications (${insertColumns.join(', ')})
     VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE unit_id = VALUES(unit_id)`,
    values
  );
}

function assertExpectedUnitState(unitState, expectedUnitState) {
  if (!expectedUnitState) return;
  const comparisons = [
    ['lot_id', Number(unitState.lot_id) || null, Number(expectedUnitState.lot_id) || null],
    ['assigned_to_user_id', Number(unitState.assigned_to_user_id) || null, Number(expectedUnitState.assigned_to_user_id) || null],
    ['is_parked', Number(unitState.is_parked || 0) === 1, Boolean(expectedUnitState.is_parked)]
  ];
  if (expectedUnitState.is_archived !== undefined) {
    comparisons.push(['is_archived', Number(unitState.is_archived || 0) === 1, Boolean(expectedUnitState.is_archived)]);
  }
  const changed = comparisons.filter(([, currentValue, expectedValue]) => currentValue !== expectedValue);
  if (changed.length > 0) {
    throw new ApiScalarInventoryError(409, 'UNIT_STATE_CHANGED', 'The Unit assignment, Lot, or operational state changed after Preflight. Run Resolve + Preflight again.', {
      changed_fields: changed.map(([fieldKey]) => fieldKey)
    });
  }
}

function getCurrentValue(unitState, fieldKey) {
  if (fieldKey === 'manufacturer') return unitState.manufacturer_id;
  if (fieldKey === 'unit_model') return unitState.unit_model_id;
  if (fieldKey === 'processor_model') return unitState.processor_model_id;
  if (fieldKey === 'processor_speed_ghz') return unitState.processor_speed_ghz;
  if (fieldKey === 'operating_system') return unitState.operating_system_config_value_id;
  if (fieldKey === 'bios_version') return unitState.bios_version;
  if (fieldKey === 'os_build') return unitState.os_build;
  if (fieldKey === 'windows_display_version') return unitState.windows_display_version;
  if (fieldKey === 'keyboard_language') return unitState.keyboard_language_config_value_id;
  return null;
}

async function applyCurrentValue(connection, unitId, fieldKey, value) {
  const unitColumns = {
    manufacturer: 'manufacturer_id',
    unit_model: 'unit_model_id',
    processor_model: 'processor_model_id',
    processor_speed_ghz: 'processor_speed_ghz',
    operating_system: 'operating_system_config_value_id'
  };
  if (unitColumns[fieldKey]) {
    await connection.query(`UPDATE units SET ${unitColumns[fieldKey]} = ? WHERE unit_id = ?`, [value, unitId]);
    return;
  }
  if (fieldKey === 'bios_version') {
    await connection.query('UPDATE unit_specifications SET bios_version = ? WHERE unit_id = ?', [value, unitId]);
    return;
  }
  if (fieldKey === 'os_build') {
    await connection.query('UPDATE unit_specifications SET os_build = ? WHERE unit_id = ?', [value, unitId]);
    return;
  }
  if (fieldKey === 'windows_display_version') {
    await connection.query('UPDATE unit_specifications SET windows_display_version = ? WHERE unit_id = ?', [value, unitId]);
    return;
  }
  if (fieldKey === 'keyboard_language') {
    await connection.query('UPDATE unit_specifications SET keyboard_language_config_value_id = ? WHERE unit_id = ?', [value, unitId]);
  }
}

function setAuditFormValue(formData, fieldKey, value) {
  const definition = SUPPORTED_SCALAR_FIELDS[fieldKey];
  if (!definition || !definition.formProperty) return;
  formData[definition.formProperty] = value === null || value === undefined ? '' : String(value);
}

function ownershipFor(fieldKey, unitState, manualSources, latestToolValues) {
  const hasLatestTool = latestToolValues.has(fieldKey);
  return assessFieldOwnership({
    currentValue: getCurrentValue(unitState, fieldKey),
    sourceCode: manualSources.get(fieldKey) || '',
    hasLatestAppliedToolObservation: hasLatestTool,
    latestAppliedToolValue: hasLatestTool ? latestToolValues.get(fieldKey) : null
  });
}

function scalarPlan(observation, unitState, manualSources, latestToolValues) {
  const currentValue = getCurrentValue(unitState, observation.fieldKey);
  const hasLatestTool = latestToolValues.has(observation.fieldKey);
  return {
    observation,
    currentValue,
    storedValue: observation.value,
    decision: decideScalarApplication({
      observation,
      currentValue,
      sourceCode: manualSources.get(observation.fieldKey) || '',
      hasLatestAppliedToolObservation: hasLatestTool,
      latestAppliedToolValue: hasLatestTool ? latestToolValues.get(observation.fieldKey) : null
    })
  };
}

function catalogPlan(observation, resolution, unitState, manualSources, latestToolValues) {
  const currentValue = getCurrentValue(unitState, observation.fieldKey);
  const storedValue = storedResolutionValue(resolution);

  if (observation.state === 'unknown' || observation.state === 'confirmed_absent') {
    const hasLatestTool = latestToolValues.has(observation.fieldKey);
    return {
      observation,
      resolution,
      currentValue,
      storedValue: observation.value,
      decision: decideScalarApplication({
        observation,
        currentValue,
        sourceCode: manualSources.get(observation.fieldKey) || '',
        hasLatestAppliedToolObservation: hasLatestTool,
        latestAppliedToolValue: hasLatestTool ? latestToolValues.get(observation.fieldKey) : null
      })
    };
  }

  if (resolution.status !== 'resolved') {
    return {
      observation,
      resolution,
      currentValue,
      storedValue,
      decision: {
        status: 'ignored_unknown',
        reason: resolution.status === 'ambiguous' ? 'catalog_value_ambiguous' : (resolution.reason || 'catalog_value_unmapped'),
        desiredValue: currentValue
      }
    };
  }

  const resolvedObservation = { ...observation, value: resolution.resolvedId };
  const hasLatestTool = latestToolValues.has(observation.fieldKey);
  return {
    observation,
    resolution,
    currentValue,
    storedValue,
    decision: decideScalarApplication({
      observation: resolvedObservation,
      currentValue,
      sourceCode: manualSources.get(observation.fieldKey) || '',
      hasLatestAppliedToolObservation: hasLatestTool,
      latestAppliedToolValue: hasLatestTool ? latestToolValues.get(observation.fieldKey) : null
    })
  };
}

function effectiveValue(plan) {
  if (!plan) return null;
  return plan.decision.status === 'applied' || plan.decision.status === 'unchanged'
    ? plan.decision.desiredValue
    : plan.currentValue;
}

function blockPlan(plan, reason) {
  if (!plan || plan.decision.status !== 'applied') return;
  plan.decision = { status: 'blocked_manual', reason, desiredValue: plan.currentValue };
}

function ignorePlan(plan, reason) {
  if (!plan || ['blocked_manual', 'ignored_unknown'].includes(plan.decision.status)) return;
  plan.decision = { status: 'ignored_unknown', reason, desiredValue: plan.currentValue };
}


function assertModelProcessorCatalogResolved(plans, unitState) {
  const modelPlan = plans.get('unit_model');
  if (modelPlan?.observation?.state === 'known' && modelPlan.resolution?.status !== 'resolved') {
    const manufacturerPlan = plans.get('manufacturer');
    const manufacturerId = normalizePositiveInteger(manufacturerPlan ? effectiveValue(manufacturerPlan) : unitState.manufacturer_id);
    const unitCategoryConfigValueId = normalizePositiveInteger(unitState.unit_category_config_value_id);
    const ambiguous = modelPlan.resolution?.status === 'ambiguous';
    throw new ApiScalarInventoryError(
      409,
      ambiguous ? 'MODEL_CATALOG_VALUE_AMBIGUOUS' : 'MODEL_CATALOG_REQUEST_REQUIRED',
      ambiguous
        ? 'The observed Unit Model matches more than one BWTDallas catalog value. Resolve the catalog ambiguity before continuing.'
        : 'The observed Unit Model is not available in BWTDallas. Submit a Model Catalog request and wait for approval before continuing.',
      {
        field_key: 'unit_model',
        submitted_value: modelPlan.observation.value,
        manufacturer_id: manufacturerId,
        unit_category_config_value_id: unitCategoryConfigValueId,
        request_supported: Boolean(!ambiguous && manufacturerId && unitCategoryConfigValueId),
        request_endpoint: '/api/v1/units/catalog-requests/model',
        candidates: modelPlan.resolution?.candidates || []
      }
    );
  }

  const processorPlan = plans.get('processor_model');
  if (processorPlan?.observation?.state === 'known' && processorPlan.resolution?.status !== 'resolved') {
    const modelPlanValue = plans.get('unit_model');
    const unitModelId = normalizePositiveInteger(modelPlanValue ? effectiveValue(modelPlanValue) : unitState.unit_model_id);
    const ambiguous = processorPlan.resolution?.status === 'ambiguous';
    const contextMissing = processorPlan.resolution?.reason === 'processor_context_missing' || !unitModelId;
    throw new ApiScalarInventoryError(
      409,
      ambiguous ? 'PROCESSOR_CATALOG_VALUE_AMBIGUOUS' : contextMissing ? 'PROCESSOR_CONTEXT_UNRESOLVED' : 'PROCESSOR_CATALOG_REQUEST_REQUIRED',
      ambiguous
        ? 'The observed Processor matches more than one BWTDallas catalog value. Resolve the catalog ambiguity before continuing.'
        : contextMissing
          ? 'The observed Processor cannot be resolved until the Unit Model is available in BWTDallas.'
          : 'The observed Processor is not available for this Unit Model in BWTDallas. Submit a Processor Catalog request and wait for approval before continuing.',
      {
        field_key: 'processor_model',
        submitted_value: processorPlan.observation.value,
        unit_model_id: unitModelId,
        request_supported: Boolean(!ambiguous && !contextMissing && unitModelId),
        request_endpoint: '/api/v1/units/catalog-requests/processor',
        candidates: processorPlan.resolution?.candidates || []
      }
    );
  }
}

async function buildApplicationPlans(connection, observations, unitState, manualSources, latestToolValues) {
  const byKey = new Map(observations.map((observation) => [observation.fieldKey, observation]));
  const plans = new Map();

  const manufacturerObservation = byKey.get('manufacturer');
  if (manufacturerObservation) {
    const resolution = manufacturerObservation.state === 'known'
      ? await resolveManufacturer(connection, manufacturerObservation.value)
      : { status: 'not_required', submitted: null };
    plans.set('manufacturer', catalogPlan(manufacturerObservation, resolution, unitState, manualSources, latestToolValues));
  }
  const effectiveManufacturerId = plans.has('manufacturer') ? effectiveValue(plans.get('manufacturer')) : unitState.manufacturer_id;

  const modelObservation = byKey.get('unit_model');
  if (modelObservation) {
    const resolution = modelObservation.state === 'known'
      ? await resolveModel(connection, modelObservation.value, {
        manufacturerId: normalizePositiveInteger(effectiveManufacturerId),
        unitCategoryConfigValueId: normalizePositiveInteger(unitState.unit_category_config_value_id)
      })
      : { status: 'not_required', submitted: null };
    plans.set('unit_model', catalogPlan(modelObservation, resolution, unitState, manualSources, latestToolValues));
  }

  const manufacturerPlan = plans.get('manufacturer');
  const modelPlan = plans.get('unit_model');
  if (manufacturerPlan?.decision.status === 'applied'
    && Number(manufacturerPlan.decision.desiredValue) !== Number(unitState.manufacturer_id)
    && unitState.unit_model_id) {
    const modelIsReplaced = modelPlan
      && ['applied', 'unchanged'].includes(modelPlan.decision.status)
      && Number(effectiveValue(modelPlan)) > 0;
    const currentModelAlreadyMatches = Number(unitState.unit_model_manufacturer_id) === Number(manufacturerPlan.decision.desiredValue);
    if (!modelIsReplaced && !currentModelAlreadyMatches) {
      blockPlan(manufacturerPlan, 'dependent_unit_model_conflict');
    }
  }

  const effectiveModelId = plans.has('unit_model') ? effectiveValue(plans.get('unit_model')) : unitState.unit_model_id;
  const processorObservation = byKey.get('processor_model');
  if (processorObservation) {
    const resolution = processorObservation.state === 'known'
      ? await resolveProcessor(connection, processorObservation.value, { unitModelId: normalizePositiveInteger(effectiveModelId) })
      : { status: 'not_required', submitted: null };
    plans.set('processor_model', catalogPlan(processorObservation, resolution, unitState, manualSources, latestToolValues));
  }

  const operatingSystemObservation = byKey.get('operating_system');
  if (operatingSystemObservation) {
    const resolution = operatingSystemObservation.state === 'known'
      ? await resolveOperatingSystem(connection, operatingSystemObservation.value)
      : { status: 'not_required', submitted: null };
    plans.set('operating_system', catalogPlan(operatingSystemObservation, resolution, unitState, manualSources, latestToolValues));
  }

  const keyboardLanguageObservation = byKey.get('keyboard_language');
  if (keyboardLanguageObservation) {
    const resolution = keyboardLanguageObservation.state === 'known'
      ? await resolveSystemConfigValue(connection, {
        systemConfigCategoryId: SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES,
        submitted: keyboardLanguageObservation.value,
        candidates: keyboardLanguageAliases(keyboardLanguageObservation.value)
      })
      : { status: 'not_required', submitted: null };
    plans.set('keyboard_language', catalogPlan(keyboardLanguageObservation, resolution, unitState, manualSources, latestToolValues));
  }

  for (const observation of observations) {
    if (!plans.has(observation.fieldKey)) plans.set(observation.fieldKey, scalarPlan(observation, unitState, manualSources, latestToolValues));
  }

  const invalidations = [];
  const processorPlan = plans.get('processor_model');
  const speedPlan = plans.get('processor_speed_ghz');
  if (processorPlan?.observation.state === 'known' && processorPlan.resolution?.status !== 'resolved') {
    if (speedPlan) ignorePlan(speedPlan, 'processor_context_unresolved');
  }
  if (processorPlan?.resolution?.status === 'resolved'
    && !valuesEquivalent(effectiveValue(processorPlan), processorPlan.resolution.resolvedId)) {
    if (speedPlan) ignorePlan(speedPlan, 'processor_context_conflict');
  }
  if (processorPlan?.decision.status === 'applied'
    && !valuesEquivalent(processorPlan.currentValue, processorPlan.decision.desiredValue)) {
    const speedHasUsableObservation = speedPlan
      && speedPlan.observation.state !== 'unknown'
      && speedPlan.decision.status !== 'ignored_unknown';
    if (speedHasUsableObservation && speedPlan.decision.status === 'blocked_manual' && getCurrentValue(unitState, 'processor_speed_ghz') !== null) {
      blockPlan(processorPlan, 'dependent_processor_speed_manual_override');
    } else if (!speedHasUsableObservation) {
      const ownership = ownershipFor('processor_speed_ghz', unitState, manualSources, latestToolValues);
      const currentSpeed = getCurrentValue(unitState, 'processor_speed_ghz');
      if (currentSpeed !== null && currentSpeed !== undefined && currentSpeed !== '') {
        if (ownership === 'tool') {
          invalidations.push({
            fieldKey: 'processor_speed_ghz',
            previousValue: currentSpeed,
            desiredValue: null,
            reason: 'processor_model_changed'
          });
        } else {
          blockPlan(processorPlan, 'dependent_processor_speed_protected');
        }
      }
    }
  }

  const osPlan = plans.get('operating_system');
  const osDependents = [
    ['os_build', plans.get('os_build')],
    ['windows_display_version', plans.get('windows_display_version')]
  ];
  if (osPlan?.observation.state === 'known' && osPlan.resolution?.status !== 'resolved') {
    for (const [, dependentPlan] of osDependents) {
      if (dependentPlan) ignorePlan(dependentPlan, 'operating_system_context_unresolved');
    }
  }
  if (osPlan?.resolution?.status === 'resolved'
    && !valuesEquivalent(effectiveValue(osPlan), osPlan.resolution.resolvedId)) {
    for (const [, dependentPlan] of osDependents) {
      if (dependentPlan) ignorePlan(dependentPlan, 'operating_system_context_conflict');
    }
  }
  if (osPlan?.decision.status === 'applied' && !valuesEquivalent(osPlan.currentValue, osPlan.decision.desiredValue)) {
    for (const [fieldKey, dependentPlan] of osDependents) {
      const currentValue = getCurrentValue(unitState, fieldKey);
      const hasUsableObservation = dependentPlan
        && dependentPlan.observation.state !== 'unknown'
        && dependentPlan.decision.status !== 'ignored_unknown';

      if (hasUsableObservation && dependentPlan.decision.status === 'blocked_manual'
        && currentValue !== null && currentValue !== undefined && currentValue !== '') {
        blockPlan(osPlan, fieldKey === 'os_build' ? 'dependent_os_build_manual_override' : 'dependent_windows_display_version_manual_override');
        continue;
      }

      if (!hasUsableObservation && currentValue !== null && currentValue !== undefined && currentValue !== '') {
        const ownership = ownershipFor(fieldKey, unitState, manualSources, latestToolValues);
        if (ownership === 'tool') {
          invalidations.push({
            fieldKey,
            previousValue: currentValue,
            desiredValue: null,
            reason: 'operating_system_changed'
          });
        } else {
          blockPlan(osPlan, fieldKey === 'os_build' ? 'dependent_os_build_protected' : 'dependent_windows_display_version_protected');
        }
      }
    }
  }

  return { plans, invalidations };
}

async function ingestScalarInventory({
  unitId,
  reportId,
  body = {},
  userId,
  toolSource,
  connection: externalConnection = null,
  beforeFormData: suppliedBeforeFormData = null,
  formOptions: suppliedFormOptions = null,
  ensureSpecificationsRow = false,
  expectedUnitState = null
}) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) throw new ApiScalarInventoryError(400, 'INVALID_UNIT_ID', 'The Unit ID is invalid.');

  const safeReportId = normalizeText(reportId, 191);
  if (!safeReportId) throw new ApiScalarInventoryError(400, 'REPORT_ID_REQUIRED', 'A report ID is required for idempotency.');

  let observations;
  let memoryObservation;
  let storageObservation;
  let graphicsObservation;
  let displayObservation;
  let connectivityObservation;
  let securityObservation;
  let powerObservation;
  let batteryObservation;
  let cameraHardwareObservation;
  let fingerprintHardwareObservation;
  let diagnosticsObservation;
  try {
    observations = normalizeScalarObservations(body.fields || {});
    memoryObservation = normalizeMemoryObservation(body.memory);
    storageObservation = normalizeStorageObservation(body.storage);
    graphicsObservation = normalizeGraphicsObservation(body.graphics);
    displayObservation = normalizeDisplayObservation(body.display);
    connectivityObservation = normalizeConnectivityObservation(body.connectivity);
    securityObservation = normalizeSecurityObservation(body.security);
    powerObservation = normalizePowerObservation(body.power);
    batteryObservation = normalizeBatteryObservation(body.battery);
    cameraHardwareObservation = normalizeCameraHardwareObservation(body.camera_hardware ?? body.cameraHardware ?? body.cameras);
    fingerprintHardwareObservation = normalizeFingerprintHardwareObservation(body.fingerprint_hardware ?? body.fingerprintHardware ?? body.fingerprint);
    diagnosticsObservation = normalizeDiagnosticsObservation(body.diagnostics);
  } catch (error) {
    throw new ApiScalarInventoryError(422, 'INVALID_INVENTORY_FIELD', error.message);
  }
  if (!observations.length && !memoryObservation && !storageObservation && !graphicsObservation && !displayObservation
    && !connectivityObservation && !securityObservation && !powerObservation
    && !batteryObservation && !cameraHardwareObservation && !fingerprintHardwareObservation && !diagnosticsObservation) {
    throw new ApiScalarInventoryError(
      422,
      'NO_SUPPORTED_FIELDS',
      'This stage accepts supported scalar fields plus memory, storage, graphics, display, connectivity, security, power, battery, camera/fingerprint hardware, and diagnostics objects.'
    );
  }

  const reportSchema = normalizeText(body.report_schema ?? body.schema, 100) || null;
  const toolVersion = normalizeText(body.tool_version, 100) || null;
  const collectedAt = normalizeDate(body.collected_at);
  const beforeFormData = suppliedBeforeFormData || await techUnitModel.getUnitFormDataById(safeUnitId);
  if (!beforeFormData) throw new ApiScalarInventoryError(404, 'UNIT_NOT_FOUND', 'The selected Unit was not found.');

  let formOptions = suppliedFormOptions;
  if (!formOptions) {
    const [baseFormOptions, expandedFormOptions] = await Promise.all([
      techUnitModel.getTechUnitFormOptions({
        includeCurrentLotId: normalizePositiveInteger(beforeFormData.lotId),
        includeCurrentUnitModelId: normalizePositiveInteger(beforeFormData.unitModelId)
      }),
      unitExpandedFormModel.getExpandedFormOptions()
    ]);
    formOptions = { ...baseFormOptions, ...expandedFormOptions };
  }

  const connection = externalConnection || await pool.getConnection();
  const managesTransaction = !externalConnection;
  try {
    if (managesTransaction) {
      await connection.beginTransaction();
    }

    const existingRun = await findExistingRun(connection, toolSource, safeReportId, { lock: true });
    if (existingRun) {
      if (Number(existingRun.unit_id) !== safeUnitId) {
        throw new ApiScalarInventoryError(409, 'REPORT_ID_UNIT_CONFLICT', 'This report ID is already associated with a different Unit.');
      }
      if (existingRun.status !== 'completed') {
        throw new ApiScalarInventoryError(409, 'REPORT_ID_IN_PROGRESS', 'This report ID already exists but is not completed.');
      }
      const replay = await serializeExistingRun(connection, existingRun);
      if (managesTransaction) {
        await connection.commit();
      }
      return replay;
    }

    if (ensureSpecificationsRow) {
      await ensureUnitSpecificationsRow(connection, safeUnitId, userId);
    }

    const unitState = await lockUnitState(connection, safeUnitId);
    if (!unitState) throw new ApiScalarInventoryError(404, 'UNIT_NOT_FOUND', 'The selected Unit was not found.');
    assertExpectedUnitState(unitState, expectedUnitState);

    const productionCycleKey = await productionCycleModel.getCurrentProductionCycleKey(safeUnitId, connection);

    if (observations.some((entry) => SUPPORTED_SCALAR_FIELDS[entry.fieldKey].storage === 'unit_specifications')
      && !unitState.specifications_unit_id) {
      throw new ApiScalarInventoryError(
        409,
        'UNIT_SPECIFICATIONS_MISSING',
        'This Unit does not have its expected Specifications row. BWTDallas did not create one implicitly through the API.'
      );
    }

    if (observations.some((entry) => entry.fieldKey === 'windows_display_version')
      && !unitState.has_windows_display_version) {
      throw new ApiScalarInventoryError(
        409,
        'API_CONTRACT_MIGRATION_REQUIRED',
        'Windows Release storage is not ready yet. Apply the Stage 10W79K1 API Contract Completion migration.'
      );
    }

    if (displayObservation && !unitState.specifications_unit_id) {
      throw new ApiScalarInventoryError(
        409,
        'UNIT_SPECIFICATIONS_MISSING',
        'This Unit does not have its expected Specifications row. BWTDallas did not create one implicitly through the API.'
      );
    }

    if ((connectivityObservation || securityObservation || powerObservation) && !unitState.specifications_unit_id) {
      throw new ApiScalarInventoryError(
        409,
        'UNIT_SPECIFICATIONS_MISSING',
        'This Unit does not have its expected Specifications row. BWTDallas did not create one implicitly through the API.'
      );
    }

    const touchscreenHardwareAbsenceObserved = displayObservation?.state === 'known'
      && displayObservation.value?.touchscreen_hardware_state_code === 'absent';

    if ((batteryObservation || cameraHardwareObservation || fingerprintHardwareObservation || diagnosticsObservation || touchscreenHardwareAbsenceObserved) && !unitState.specifications_unit_id) {
      throw new ApiScalarInventoryError(
        409,
        'UNIT_SPECIFICATIONS_MISSING',
        'This Unit does not have its expected Specifications row. BWTDallas did not create one implicitly through the API.'
      );
    }

    const fieldKeys = observations.map((entry) => entry.fieldKey);
    const dependencyFieldKeys = ['processor_speed_ghz', 'os_build', 'windows_display_version'];
    const sourceFieldKeys = [...new Set([
      ...fieldKeys,
      ...dependencyFieldKeys,
      ...(memoryObservation ? [MEMORY_FIELD_KEY] : []),
      ...(storageObservation ? [STORAGE_FIELD_KEY] : []),
      ...(graphicsObservation ? [GRAPHICS_FIELD_KEY] : []),
      ...(displayObservation ? [DISPLAY_FIELD_KEY, SCREEN_SIZE_FIELD_KEY, NATIVE_RESOLUTION_FIELD_KEY, TOUCHSCREEN_TEST_FIELD_KEY] : []),
      ...((connectivityObservation || securityObservation || powerObservation)
        ? [CONNECTIVITY_FIELD_KEY, SECURITY_FIELD_KEY, POWER_FIELD_KEY, WIFI_FORM_FIELD_KEY, ABSOLUTE_FORM_FIELD_KEY]
        : []),
      ...((batteryObservation || cameraHardwareObservation || fingerprintHardwareObservation || diagnosticsObservation)
        ? [BATTERY_FIELD_KEY, BATTERY_HEALTH_FIELD_KEY, CAMERA_HARDWARE_FIELD_KEY, FINGERPRINT_HARDWARE_FIELD_KEY, DIAGNOSTICS_FIELD_KEY,
          KEYBOARD_TEST_FIELD_KEY, MICROPHONE_TEST_FIELD_KEY, AUDIO_TEST_FIELD_KEY, DRIVER_CHECK_FIELD_KEY, THREAT_PROTECTION_FIELD_KEY,
          CAMERA_TEST_FIELD_KEY, BIOMETRIC_HARDWARE_FIELD_KEY, BIOMETRICS_TEST_FIELD_KEY, TOUCHSCREEN_TEST_FIELD_KEY, COMPLETE_DIAGNOSTICS_FIELD_KEY]
        : [])
    ])];
    const manualSources = await loadManualSources(connection, safeUnitId, sourceFieldKeys);
    const latestToolValues = await loadLatestAppliedToolValues(connection, safeUnitId, sourceFieldKeys);
    const { plans, invalidations } = await buildApplicationPlans(
      connection,
      observations,
      unitState,
      manualSources,
      latestToolValues
    );
    assertModelProcessorCatalogResolved(plans, unitState);

    let resolvedMemoryObservation = null;
    let currentMemoryRows = [];
    let memoryPlan = null;
    if (memoryObservation) {
      currentMemoryRows = await loadCurrentMemoryRows(connection, safeUnitId, { lock: true });
      resolvedMemoryObservation = await resolveMemoryObservation(connection, memoryObservation);
      const latestMemory = await loadLatestAppliedCompositeToolObservation(
        connection, safeUnitId, MEMORY_FIELD_KEY, productionCycleKey
      );
      memoryPlan = buildMemoryPlan({
        observation: resolvedMemoryObservation,
        currentRows: currentMemoryRows,
        sourceCode: manualSources.get(MEMORY_FIELD_KEY) || '',
        latestAppliedValue: latestMemory.value,
        latestAppliedToolSource: latestMemory.toolSource,
        incomingToolSource: toolSource
      });
    }

    let resolvedStorageObservation = null;
    let currentStorageRows = [];
    let storagePlan = null;
    if (storageObservation) {
      currentStorageRows = await loadCurrentStorageRows(connection, safeUnitId, { lock: true });
      resolvedStorageObservation = await resolveStorageObservation(connection, storageObservation);
      const latestStorage = await loadLatestAppliedCompositeToolObservation(
        connection, safeUnitId, STORAGE_FIELD_KEY, productionCycleKey
      );
      storagePlan = buildStoragePlan({
        observation: resolvedStorageObservation,
        currentRows: currentStorageRows,
        sourceCode: manualSources.get(STORAGE_FIELD_KEY) || '',
        latestAppliedValue: latestStorage.value,
        latestAppliedToolSource: latestStorage.toolSource,
        incomingToolSource: toolSource
      });
    }

    let resolvedGraphicsObservation = null;
    let currentGraphicsRows = [];
    let graphicsPlan = null;
    if (graphicsObservation) {
      currentGraphicsRows = await loadCurrentGraphicsRows(connection, safeUnitId, { lock: true });
      resolvedGraphicsObservation = await resolveGraphicsObservation(connection, graphicsObservation);
      graphicsPlan = buildGraphicsPlan({ observation: resolvedGraphicsObservation, currentRows: currentGraphicsRows });
    }

    let resolvedDisplayObservation = null;
    let currentDisplayState = null;
    let displayPlan = null;
    if (displayObservation) {
      currentDisplayState = await loadCurrentDisplayState(connection, safeUnitId, { lock: true });
      resolvedDisplayObservation = await resolveDisplayObservation(connection, displayObservation);
      const latestDisplayValue = await loadLatestAppliedCompositeValue(connection, safeUnitId, DISPLAY_FIELD_KEY);
      displayPlan = buildDisplayPlan({
        observation: resolvedDisplayObservation,
        currentState: currentDisplayState,
        manualSources,
        latestAppliedValue: latestDisplayValue
      });
    }

    let resolvedConnectivitySecurityPower = null;
    let currentConnectivitySecurityPowerState = null;
    let connectivitySecurityPowerPlan = null;
    if (connectivityObservation || securityObservation || powerObservation) {
      currentConnectivitySecurityPowerState = await loadCurrentConnectivitySecurityPowerState(connection, safeUnitId, { lock: true });
      resolvedConnectivitySecurityPower = await resolveConnectivitySecurityPowerObservation(connection, {
        connectivity: connectivityObservation,
        security: securityObservation,
        power: powerObservation
      });
      connectivitySecurityPowerPlan = buildConnectivitySecurityPowerPlan({
        resolved: resolvedConnectivitySecurityPower,
        currentState: currentConnectivitySecurityPowerState,
        manualSources,
        latestToolValues
      });
    }

    const identityEnrichments = await applyToolIdentityEnrichment(
      connection,
      safeUnitId,
      body,
      resolvedConnectivitySecurityPower?.security || null
    );

    let currentHardwareDiagnosticsState = null;
    let hardwareDiagnosticsPlan = null;
    if (batteryObservation || cameraHardwareObservation || fingerprintHardwareObservation || diagnosticsObservation || touchscreenHardwareAbsenceObserved) {
      currentHardwareDiagnosticsState = await loadCurrentHardwareDiagnosticsState(connection, safeUnitId, { lock: true });
      if (!currentHardwareDiagnosticsState) {
        throw new ApiScalarInventoryError(409, 'UNIT_SPECIFICATIONS_MISSING', 'This Unit does not have its expected Specifications row.');
      }
      hardwareDiagnosticsPlan = await buildHardwareDiagnosticsPlan(connection, {
        battery: batteryObservation,
        camera: cameraHardwareObservation,
        fingerprint: fingerprintHardwareObservation,
        diagnostics: diagnosticsObservation,
        display: resolvedDisplayObservation || displayObservation,
        currentState: currentHardwareDiagnosticsState,
        manualSources,
        latestToolValues
      });
    }

    const auditFieldKeys = [...new Set([...fieldKeys, ...invalidations.map((entry) => entry.fieldKey)])];
    const auditBeforeFormData = { ...beforeFormData };
    for (const fieldKey of auditFieldKeys) {
      setAuditFormValue(auditBeforeFormData, fieldKey, getCurrentValue(unitState, fieldKey));
    }

    const [runResult] = await connection.query(
      `INSERT INTO unit_tool_runs (
         unit_id, tool_source, user_id, report_id, report_schema,
         tool_version, collected_at, production_cycle_key, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')`,
      [safeUnitId, toolSource, userId, safeReportId, reportSchema, toolVersion, collectedAt, productionCycleKey]
    );
    const toolRunId = Number(runResult.insertId);
    const afterFormData = { ...auditBeforeFormData };
    if (memoryObservation) {
      auditBeforeFormData.memoryModules = toFormMemoryModules(currentMemoryRows);
      afterFormData.memoryModules = toFormMemoryModules(currentMemoryRows);
    }
    if (storageObservation) {
      auditBeforeFormData.storageDevices = toFormStorageDevices(currentStorageRows);
      afterFormData.storageDevices = toFormStorageDevices(currentStorageRows);
    }
    const resultRows = [];
    let changedCount = 0;

    const auditPropertyByIdentityField = {
      unit_serial_number: 'unitSerialNumber',
      bios_serial_number: 'biosSerialNumber',
      system_uuid: 'systemUuid'
    };
    for (const identityResult of identityEnrichments) {
      const applicationStatus = identityResult.status;
      const applicationReason = applicationStatus === 'applied'
        ? 'latest_valid_tool_identity_observation'
        : 'already_current';
      if (applicationStatus === 'applied') {
        const auditProperty = auditPropertyByIdentityField[identityResult.fieldKey];
        if (auditProperty) afterFormData[auditProperty] = identityResult.value;
        changedCount += 1;
      }
      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state, observed_value_json,
           application_status, application_reason, previous_value_json
         ) VALUES (?, ?, ?, 'known', ?, ?, ?, ?)`,
        [toolRunId, safeUnitId, identityResult.fieldKey, jsonValue(identityResult.value), applicationStatus, applicationReason, jsonValue(identityResult.previousValue)]
      );
      resultRows.push({
        field_key: identityResult.fieldKey,
        state: 'known',
        value: identityResult.value,
        application_status: applicationStatus,
        application_reason: applicationReason
      });
    }

    for (const observation of observations) {
      const plan = plans.get(observation.fieldKey);
      if (!plan) continue;

      if (plan.decision.status === 'applied') {
        await applyCurrentValue(connection, safeUnitId, observation.fieldKey, plan.decision.desiredValue);
        setAuditFormValue(afterFormData, observation.fieldKey, plan.decision.desiredValue);
        changedCount += 1;
      }

      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state,
           observed_value_json, application_status, application_reason,
           previous_value_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toolRunId,
          safeUnitId,
          observation.fieldKey,
          observation.state,
          jsonValue(plan.storedValue),
          plan.decision.status,
          plan.decision.reason,
          jsonValue(plan.currentValue)
        ]
      );

      resultRows.push({
        field_key: observation.fieldKey,
        state: observation.state,
        value: plan.storedValue,
        application_status: plan.decision.status,
        application_reason: plan.decision.reason
      });
    }

    let memoryResult = null;
    let memoryAuditChange = null;
    if (resolvedMemoryObservation && memoryPlan) {
      const beforeSpeedText = memorySpeedSummary(currentMemoryRows);
      const memoryChanged = await applyMemoryPlan(connection, safeUnitId, memoryPlan);
      const afterMemoryRows = memoryChanged
        ? await loadCurrentMemoryRows(connection, safeUnitId)
        : currentMemoryRows;
      const memorySummary = memoryPlan.status === 'ignored_unknown'
        ? { totalGb: null, ramTypeConfigValueId: null, changed: false }
        : await syncMemorySummary(connection, safeUnitId, afterMemoryRows);
      if (memoryChanged || memorySummary.changed) {
        changedCount += 1;
        afterFormData.memoryModules = toFormMemoryModules(afterMemoryRows);
        afterFormData.ramGb = memorySummary.totalGb === null ? '' : String(memorySummary.totalGb);
        afterFormData.ramTypeConfigValueId = memorySummary.ramTypeConfigValueId ? String(memorySummary.ramTypeConfigValueId) : '';
        const afterSpeedText = memorySpeedSummary(afterMemoryRows);
        if (beforeSpeedText !== afterSpeedText) {
          memoryAuditChange = {
            fieldKey: 'memory_speed',
            fieldLabel: 'Memory Speed',
            changeType: 'changed',
            oldValueText: beforeSpeedText,
            newValueText: afterSpeedText,
            sortOrder: 325
          };
        }
      }

      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state,
           observed_value_json, application_status, application_reason,
           previous_value_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toolRunId,
          safeUnitId,
          resolvedMemoryObservation.fieldKey,
          resolvedMemoryObservation.state,
          jsonValue(resolvedMemoryObservation.value),
          memoryPlan.status,
          memoryPlan.reason,
          jsonValue(currentMemoryRows)
        ]
      );

      memoryResult = {
        field_key: resolvedMemoryObservation.fieldKey,
        state: resolvedMemoryObservation.state,
        value: resolvedMemoryObservation.value,
        application_status: memoryPlan.status,
        application_reason: memoryPlan.reason
      };
      resultRows.push(memoryResult);
    }

    let storageResult = null;
    let storageAuditChange = null;
    if (resolvedStorageObservation && storagePlan) {
      const beforeStorageDetailText = storageDetailSummary(currentStorageRows);
      const storageChanged = await applyStoragePlan(connection, safeUnitId, storagePlan);
      const afterStorageRows = storageChanged
        ? await loadCurrentStorageRows(connection, safeUnitId)
        : currentStorageRows;
      const storageSummary = storagePlan.status === 'ignored_unknown'
        ? { totalGb: null, storageTypeConfigValueId: null, changed: false }
        : await syncStorageSummary(connection, safeUnitId, afterStorageRows, {
          emptyTotalGb: resolvedStorageObservation.state === 'confirmed_absent' ? 0 : null
        });
      if (storageChanged || storageSummary.changed) {
        changedCount += 1;
        afterFormData.storageDevices = toFormStorageDevices(afterStorageRows);
        afterFormData.storageGb = storageSummary.totalGb === null ? '' : String(storageSummary.totalGb);
        afterFormData.storageTypeConfigValueId = storageSummary.storageTypeConfigValueId ? String(storageSummary.storageTypeConfigValueId) : '';
        const afterStorageDetailText = storageDetailSummary(afterStorageRows);
        if (beforeStorageDetailText !== afterStorageDetailText) {
          storageAuditChange = {
            fieldKey: 'storage_tool_details',
            fieldLabel: 'Storage Details',
            changeType: 'changed',
            oldValueText: beforeStorageDetailText,
            newValueText: afterStorageDetailText,
            sortOrder: 335
          };
        }
      }

      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state,
           observed_value_json, application_status, application_reason,
           previous_value_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          toolRunId,
          safeUnitId,
          resolvedStorageObservation.fieldKey,
          resolvedStorageObservation.state,
          jsonValue(resolvedStorageObservation.value),
          storagePlan.status,
          storagePlan.reason,
          jsonValue(currentStorageRows)
        ]
      );

      storageResult = {
        field_key: resolvedStorageObservation.fieldKey,
        state: resolvedStorageObservation.state,
        value: resolvedStorageObservation.value,
        application_status: storagePlan.status,
        application_reason: storagePlan.reason
      };
      resultRows.push(storageResult);
    }

    let graphicsResult = null;
    let graphicsAuditChange = null;
    if (resolvedGraphicsObservation && graphicsPlan) {
      const beforeGraphicsText = graphicsSummary(currentGraphicsRows);
      const graphicsChanged = await applyGraphicsPlan(connection, safeUnitId, graphicsPlan);
      if (graphicsChanged) {
        changedCount += 1;
        const afterGraphicsRows = await loadCurrentGraphicsRows(connection, safeUnitId);
        const afterGraphicsText = graphicsSummary(afterGraphicsRows);
        if (beforeGraphicsText !== afterGraphicsText) {
          graphicsAuditChange = {
            fieldKey: 'graphics_adapters',
            fieldLabel: 'Graphics Adapters',
            changeType: 'changed',
            oldValueText: beforeGraphicsText,
            newValueText: afterGraphicsText,
            sortOrder: 340
          };
        }
      }
      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state,
           observed_value_json, application_status, application_reason, previous_value_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [toolRunId, safeUnitId, resolvedGraphicsObservation.fieldKey, resolvedGraphicsObservation.state,
          jsonValue(resolvedGraphicsObservation.value), graphicsPlan.status, graphicsPlan.reason, jsonValue(currentGraphicsRows)]
      );
      graphicsResult = {
        field_key: resolvedGraphicsObservation.fieldKey,
        state: resolvedGraphicsObservation.state,
        value: resolvedGraphicsObservation.value,
        application_status: graphicsPlan.status,
        application_reason: graphicsPlan.reason
      };
      resultRows.push(graphicsResult);
    }

    let displayResult = null;
    let displayAuditChange = null;
    if (resolvedDisplayObservation && displayPlan) {
      const beforeDisplayText = displaySummary(currentDisplayState || {});
      const displayChanged = await applyDisplayPlan(connection, safeUnitId, displayPlan);
      if (displayChanged) {
        changedCount += 1;
        const afterDisplayState = await loadCurrentDisplayState(connection, safeUnitId);
        const afterDisplayText = displaySummary(afterDisplayState);
        if (beforeDisplayText !== afterDisplayText) {
          displayAuditChange = {
            fieldKey: 'display_hardware',
            fieldLabel: 'Built-In Display Hardware',
            changeType: 'changed',
            oldValueText: beforeDisplayText,
            newValueText: afterDisplayText,
            sortOrder: 345
          };
        }
      }
      await connection.query(
        `INSERT INTO unit_tool_observations (
           tool_run_id, unit_id, field_key, observation_state,
           observed_value_json, application_status, application_reason, previous_value_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [toolRunId, safeUnitId, resolvedDisplayObservation.fieldKey, resolvedDisplayObservation.state,
          jsonValue(resolvedDisplayObservation.value), displayPlan.status, displayPlan.reason, jsonValue(currentDisplayState)]
      );
      displayResult = {
        field_key: resolvedDisplayObservation.fieldKey,
        state: resolvedDisplayObservation.state,
        value: resolvedDisplayObservation.value,
        application_status: displayPlan.status,
        application_reason: displayPlan.reason
      };
      resultRows.push(displayResult);
    }

    let connectivitySecurityPowerResult = null;
    let connectivitySecurityPowerAuditChange = null;
    if (resolvedConnectivitySecurityPower && connectivitySecurityPowerPlan) {
      const beforeToolState = currentToolSnapshot(currentConnectivitySecurityPowerState);
      const beforeSummary = connectivitySecurityPowerSummary(currentConnectivitySecurityPowerState);
      await applyConnectivitySecurityPowerPlan(connection, safeUnitId, connectivitySecurityPowerPlan);
      const afterConnectivitySecurityPowerState = await loadCurrentConnectivitySecurityPowerState(connection, safeUnitId);
      const afterToolState = currentToolSnapshot(afterConnectivitySecurityPowerState);
      const toolStateChanged = JSON.stringify(beforeToolState) !== JSON.stringify(afterToolState);
      const formChanged = [connectivitySecurityPowerPlan.wifiPlan, connectivitySecurityPowerPlan.absolutePlan]
        .some((entry) => entry?.status === 'applied');
      if (toolStateChanged || formChanged) {
        changedCount += 1;
        const afterSummary = connectivitySecurityPowerSummary(afterConnectivitySecurityPowerState);
        if (beforeSummary !== afterSummary) {
          connectivitySecurityPowerAuditChange = {
            fieldKey: 'connectivity_security_power',
            fieldLabel: 'Connectivity / Security / Power',
            changeType: 'changed',
            oldValueText: beforeSummary,
            newValueText: afterSummary,
            sortOrder: 350
          };
        }
      }

      const sectionEntries = [
        [CONNECTIVITY_FIELD_KEY, resolvedConnectivitySecurityPower.connectivity],
        [SECURITY_FIELD_KEY, resolvedConnectivitySecurityPower.security],
        [POWER_FIELD_KEY, resolvedConnectivitySecurityPower.power]
      ].filter(([, entry]) => entry);
      for (const [fieldKey, entry] of sectionEntries) {
        const sectionChanged = JSON.stringify(sectionToolSnapshot(currentConnectivitySecurityPowerState, fieldKey))
          !== JSON.stringify(sectionToolSnapshot(afterConnectivitySecurityPowerState, fieldKey));
        const status = entry.state === 'unknown'
          ? 'ignored_unknown'
          : (sectionChanged ? 'applied' : 'unchanged');
        const reason = entry.state === 'unknown' ? 'unknown_does_not_overwrite' : (sectionChanged ? 'latest_valid_tool_observation' : 'already_current');
        await connection.query(
          `INSERT INTO unit_tool_observations (
             tool_run_id, unit_id, field_key, observation_state, observed_value_json,
             application_status, application_reason, previous_value_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [toolRunId, safeUnitId, fieldKey, entry.state, jsonValue(entry.value), status, reason, jsonValue(beforeToolState)]
        );
        resultRows.push({ field_key: fieldKey, state: entry.state, value: entry.value, application_status: status, application_reason: reason });
      }

      for (const fieldPlan of [connectivitySecurityPowerPlan.wifiPlan, connectivitySecurityPowerPlan.absolutePlan].filter(Boolean)) {
        await connection.query(
          `INSERT INTO unit_tool_observations (
             tool_run_id, unit_id, field_key, observation_state, observed_value_json,
             application_status, application_reason, previous_value_json
           ) VALUES (?, ?, ?, 'known', ?, ?, ?, ?)`,
          [toolRunId, safeUnitId, fieldPlan.fieldKey, jsonValue({
            submitted: fieldPlan.storedValue.submitted,
            resolved_id: fieldPlan.storedValue.resolvedId || null,
            resolved_label: fieldPlan.storedValue.resolvedLabel || null
          }), fieldPlan.status, fieldPlan.reason, jsonValue(fieldPlan.currentValue)]
        );
        resultRows.push({
          field_key: fieldPlan.fieldKey, state: 'known', value: fieldPlan.storedValue,
          application_status: fieldPlan.status, application_reason: fieldPlan.reason
        });
      }

      if (connectivitySecurityPowerPlan.wifiPlan?.status === 'applied') {
        afterFormData.wifiCardPresentConfigValueId = String(connectivitySecurityPowerPlan.wifiPlan.desiredValue);
      }
      if (connectivitySecurityPowerPlan.absolutePlan?.status === 'applied') {
        afterFormData.absoluteStatusConfigValueId = String(connectivitySecurityPowerPlan.absolutePlan.desiredValue);
      }
      connectivitySecurityPowerResult = {
        connectivity: resolvedConnectivitySecurityPower.connectivity,
        security: resolvedConnectivitySecurityPower.security,
        power: resolvedConnectivitySecurityPower.power,
        wifi: connectivitySecurityPowerPlan.wifiPlan,
        absolute: connectivitySecurityPowerPlan.absolutePlan
      };
    }

    let hardwareDiagnosticsResult = null;
    let hardwareDiagnosticsAuditChange = null;
    if (hardwareDiagnosticsPlan && currentHardwareDiagnosticsState) {
      const beforeToolState = hardwareDiagnosticsToolSnapshot(currentHardwareDiagnosticsState);
      const beforeSummary = hardwareDiagnosticsSummary(currentHardwareDiagnosticsState);
      await applyHardwareDiagnosticsPlan(connection, safeUnitId, hardwareDiagnosticsPlan);
      const afterHardwareDiagnosticsState = await loadCurrentHardwareDiagnosticsState(connection, safeUnitId);
      const afterToolState = hardwareDiagnosticsToolSnapshot(afterHardwareDiagnosticsState);
      const appliedFormPlans = [
        ...hardwareDiagnosticsPlan.formPlans,
        hardwareDiagnosticsPlan.batteryHealthPlan,
        hardwareDiagnosticsPlan.cameraTestPlan,
        hardwareDiagnosticsPlan.fingerprintHardwarePlan,
        hardwareDiagnosticsPlan.fingerprintTestPlan
      ].filter((entry) => entry?.status === 'applied');
      const toolStateChanged = JSON.stringify(beforeToolState) !== JSON.stringify(afterToolState);
      const diagnosticsRecorded = diagnosticsObservation?.state === 'known';
      if (toolStateChanged || appliedFormPlans.length || diagnosticsRecorded) {
        changedCount += 1;
        const afterSummary = hardwareDiagnosticsSummary(afterHardwareDiagnosticsState);
        const diagnosticSummary = diagnosticsObservation?.state === 'known'
          ? diagnosticsObservation.value.items.map((item) => `${item.title || item.key}: ${item.state}`).join('; ')
          : '';
        hardwareDiagnosticsAuditChange = {
          fieldKey: 'hardware_diagnostics',
          fieldLabel: 'Battery / Camera / Biometrics / Diagnostics',
          changeType: 'changed',
          oldValueText: beforeSummary,
          newValueText: [afterSummary, diagnosticSummary].filter(Boolean).join('; ') || 'Unknown',
          sortOrder: 360
        };
      }

      const sections = [
        [BATTERY_FIELD_KEY, batteryObservation],
        [CAMERA_HARDWARE_FIELD_KEY, cameraHardwareObservation],
        [FINGERPRINT_HARDWARE_FIELD_KEY, fingerprintHardwareObservation],
        [DIAGNOSTICS_FIELD_KEY, diagnosticsObservation]
      ].filter(([, entry]) => entry);
      for (const [fieldKey, entry] of sections) {
        let status = entry.state === 'unknown' ? 'ignored_unknown' : 'unchanged';
        let reason = entry.state === 'unknown' ? 'unknown_does_not_overwrite' : 'already_current';
        if (fieldKey === DIAGNOSTICS_FIELD_KEY && entry.state === 'known') {
          status = 'applied'; reason = 'diagnostic_result_recorded';
        } else if (entry.state === 'known') {
          const beforeSection = hardwareDiagnosticsSectionToolSnapshot(currentHardwareDiagnosticsState, fieldKey);
          const afterSection = hardwareDiagnosticsSectionToolSnapshot(afterHardwareDiagnosticsState, fieldKey);
          if (JSON.stringify(beforeSection) !== JSON.stringify(afterSection)) {
            status = 'applied'; reason = 'latest_valid_tool_observation';
          }
        }
        await connection.query(
          `INSERT INTO unit_tool_observations (
             tool_run_id, unit_id, field_key, observation_state, observed_value_json,
             application_status, application_reason, previous_value_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [toolRunId, safeUnitId, fieldKey, entry.state, jsonValue(entry.value), status, reason, jsonValue(beforeToolState)]
        );
        resultRows.push({ field_key: fieldKey, state: entry.state, value: entry.value, application_status: status, application_reason: reason });
      }

      const formObservationPlans = [
        ...hardwareDiagnosticsPlan.formPlans,
        hardwareDiagnosticsPlan.batteryHealthPlan ? { ...hardwareDiagnosticsPlan.batteryHealthPlan, fieldKey: BATTERY_HEALTH_FIELD_KEY, storedValue: hardwareDiagnosticsPlan.batteryHealthPlan.desiredValue } : null,
        hardwareDiagnosticsPlan.fingerprintHardwarePlan?.resolution ? { ...hardwareDiagnosticsPlan.fingerprintHardwarePlan, fieldKey: BIOMETRIC_HARDWARE_FIELD_KEY, storedValue: hardwareDiagnosticsPlan.fingerprintHardwarePlan.resolution } : null,
        hardwareDiagnosticsPlan.cameraTestPlan ? { ...hardwareDiagnosticsPlan.cameraTestPlan, fieldKey: CAMERA_TEST_FIELD_KEY, storedValue: hardwareDiagnosticsPlan.cameraTestPlan.storedValue || null } : null,
        hardwareDiagnosticsPlan.fingerprintTestPlan ? { ...hardwareDiagnosticsPlan.fingerprintTestPlan, fieldKey: BIOMETRICS_TEST_FIELD_KEY, storedValue: hardwareDiagnosticsPlan.fingerprintTestPlan.storedValue || null } : null
      ].filter(Boolean);
      for (const fieldPlan of formObservationPlans) {
        const stored = fieldPlan.storedValue && typeof fieldPlan.storedValue === 'object'
          ? { submitted: fieldPlan.storedValue.submitted ?? null, resolved_id: fieldPlan.storedValue.resolvedId ?? null, resolved_label: fieldPlan.storedValue.resolvedLabel ?? null }
          : fieldPlan.storedValue;
        await connection.query(
          `INSERT INTO unit_tool_observations (
             tool_run_id, unit_id, field_key, observation_state, observed_value_json,
             application_status, application_reason, previous_value_json
           ) VALUES (?, ?, ?, 'known', ?, ?, ?, ?)`,
          [toolRunId, safeUnitId, fieldPlan.fieldKey, jsonValue(stored), fieldPlan.status, fieldPlan.reason, jsonValue(fieldPlan.currentValue ?? null)]
        );
        resultRows.push({ field_key: fieldPlan.fieldKey, state: 'known', value: stored, application_status: fieldPlan.status, application_reason: fieldPlan.reason });
      }

      hardwareDiagnosticsResult = {
        battery: batteryObservation,
        camera: cameraHardwareObservation,
        fingerprint: fingerprintHardwareObservation,
        diagnostics: diagnosticsObservation,
        form_results: formObservationPlans.map((entry) => ({ field_key: entry.fieldKey, status: entry.status, reason: entry.reason }))
      };
    }

    const appliedInvalidations = [];
    for (const invalidation of invalidations) {
      const parentStillApplied = invalidation.fieldKey === 'processor_speed_ghz'
        ? plans.get('processor_model')?.decision.status === 'applied'
        : plans.get('operating_system')?.decision.status === 'applied';
      if (!parentStillApplied) continue;
      await applyCurrentValue(connection, safeUnitId, invalidation.fieldKey, invalidation.desiredValue);
      setAuditFormValue(afterFormData, invalidation.fieldKey, invalidation.desiredValue);
      changedCount += 1;
      appliedInvalidations.push({
        field_key: invalidation.fieldKey,
        previous_value: invalidation.previousValue,
        current_value: invalidation.desiredValue,
        reason: invalidation.reason
      });
    }

    const windowsReleasePlan = plans.get('windows_display_version');
    let finalWindowsRelease = unitState.windows_display_version;
    if (windowsReleasePlan?.decision.status === 'applied') {
      finalWindowsRelease = windowsReleasePlan.decision.desiredValue;
    }
    if (appliedInvalidations.some((entry) => entry.field_key === 'windows_display_version')) {
      finalWindowsRelease = null;
    }
    const windowsReleaseAuditChange = valuesEquivalent(unitState.windows_display_version, finalWindowsRelease)
      ? null
      : {
        fieldKey: 'windows_display_version',
        fieldLabel: 'Windows Release',
        changeType: 'changed',
        oldValueText: unitState.windows_display_version || 'Unknown',
        newValueText: finalWindowsRelease || 'Unknown',
        sortOrder: 309
      };

    await connection.query(
      `UPDATE unit_tool_runs
          SET status = 'completed', completed_at = NOW()
        WHERE tool_run_id = ?`,
      [toolRunId]
    );

    if (changedCount > 0) {
      const event = buildUnitFormAuditEvent({
        mode: 'edit',
        unitId: safeUnitId,
        actorUserId: userId,
        beforeFormData: auditBeforeFormData,
        afterFormData,
        formOptions,
        source: `api_${toolSource}`
      });
      if (windowsReleaseAuditChange && Array.isArray(event.changes)) event.changes.push(windowsReleaseAuditChange);
      if (memoryAuditChange && Array.isArray(event.changes)) event.changes.push(memoryAuditChange);
      if (storageAuditChange && Array.isArray(event.changes)) event.changes.push(storageAuditChange);
      if (graphicsAuditChange && Array.isArray(event.changes)) event.changes.push(graphicsAuditChange);
      if (displayAuditChange && Array.isArray(event.changes)) event.changes.push(displayAuditChange);
      if (connectivitySecurityPowerAuditChange && Array.isArray(event.changes)) event.changes.push(connectivitySecurityPowerAuditChange);
      if (hardwareDiagnosticsAuditChange && Array.isArray(event.changes)) event.changes.push(hardwareDiagnosticsAuditChange);
      if (Array.isArray(event.changes) && connectivitySecurityPowerPlan?.wifiPlan?.status === 'applied'
        && !event.changes.some((change) => change.fieldKey === WIFI_FORM_FIELD_KEY)) {
        event.changes.push({
          fieldKey: WIFI_FORM_FIELD_KEY, fieldLabel: 'Wi-Fi Card Present', changeType: 'changed',
          oldValueText: connectivitySecurityPowerPlan.wifiPlan.currentValue ? `Config Value #${connectivitySecurityPowerPlan.wifiPlan.currentValue}` : 'Unknown',
          newValueText: connectivitySecurityPowerPlan.wifiPlan.storedValue.resolvedLabel || connectivitySecurityPowerPlan.wifiPlan.storedValue.submitted || 'Unknown', sortOrder: 351
        });
      }
      if (Array.isArray(event.changes) && connectivitySecurityPowerPlan?.absolutePlan?.status === 'applied'
        && !event.changes.some((change) => change.fieldKey === ABSOLUTE_FORM_FIELD_KEY)) {
        event.changes.push({
          fieldKey: ABSOLUTE_FORM_FIELD_KEY, fieldLabel: 'Absolute Status', changeType: 'changed',
          oldValueText: connectivitySecurityPowerPlan.absolutePlan.currentValue ? `Config Value #${connectivitySecurityPowerPlan.absolutePlan.currentValue}` : 'Unknown',
          newValueText: connectivitySecurityPowerPlan.absolutePlan.storedValue.resolvedLabel || connectivitySecurityPowerPlan.absolutePlan.storedValue.submitted || 'Unknown', sortOrder: 352
        });
      }
      event.metadata = {
        ...(event.metadata || {}),
        apiVersion: 'v1',
        toolSource,
        toolRunId,
        reportId: safeReportId,
        invalidatedFields: appliedInvalidations,
        memoryObservation: memoryResult,
        storageObservation: storageResult,
        graphicsObservation: graphicsResult,
        displayObservation: displayResult,
        connectivitySecurityPowerObservation: connectivitySecurityPowerResult,
        hardwareDiagnosticsObservation: hardwareDiagnosticsResult
      };
      await unitAuditEventModel.createUnitAuditEvent(event, connection);
    }

    if (managesTransaction) {
      await connection.commit();
    }
    return {
      status: 'COMPLETED',
      replayed: false,
      tool_run_id: toolRunId,
      unit_id: safeUnitId,
      report_id: safeReportId,
      tool_source: toolSource,
      observations: resultRows,
      invalidated_fields: appliedInvalidations
    };
  } catch (error) {
    if (managesTransaction) {
      await connection.rollback();

      if (error && error.code === 'ER_DUP_ENTRY') {
        const existingRun = await findExistingRun(pool, toolSource, safeReportId);
        if (existingRun && Number(existingRun.unit_id) === safeUnitId && existingRun.status === 'completed') {
          return serializeExistingRun(pool, existingRun);
        }
      }
    }
    throw error;
  } finally {
    if (managesTransaction) {
      connection.release();
    }
  }
}

async function getSubmissionById({ toolSource, reportId }) {
  const safeReportId = normalizeText(reportId, 191);
  if (!safeReportId) return null;
  const run = await findExistingRun(pool, toolSource, safeReportId);
  return run ? serializeExistingRun(pool, run) : null;
}

module.exports = {
  ApiScalarInventoryError,
  ingestScalarInventory,
  getSubmissionById
};
