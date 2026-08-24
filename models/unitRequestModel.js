const { pool } = require('./db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const lotModel = require('./lotModel');
const techUnitModel = require('./techUnitModel');
const unitIssueEntryModel = require('./unitIssueEntryModel');
const unitExpandedFormModel = require('./unitExpandedFormModel');
const unitLotDestinationValidationModel = require('./unitLotDestinationValidationModel');
const processorFamilyModel = require('./processorFamilyModel');
const processorCatalogModel = require('./processorCatalogModel');
const unitQcCheckModel = require('./unitQcCheckModel');
const unitAuditEventModel = require('./unitAuditEventModel');

const UNIT_REQUESTS_TABLE = 'unit_requests';
const UNIT_DUPLICATE_REQUESTS_TABLE = 'unit_duplicate_requests';
const UNIT_REQUEST_EVENTS_TABLE = 'unit_request_events';
const UNIT_MODEL_CATALOG_REQUESTS_TABLE = 'unit_model_catalog_requests';
const UNIT_PROCESSOR_CATALOG_REQUESTS_TABLE = 'unit_processor_catalog_requests';
const UNIT_QC_REVERSION_REQUESTS_TABLE = 'unit_qc_reversion_requests';

const INTENTIONAL_DUPLICATE_REQUEST_TYPE = 'intentional_duplicate';
const MODEL_CATALOG_REQUEST_TYPE = 'model_catalog_addition';
const PROCESSOR_CATALOG_REQUEST_TYPE = 'processor_catalog_addition';
const QC_REVERSION_REQUEST_TYPE = 'qc_reversion';
const CATALOG_REQUEST_TYPES = new Set([
  MODEL_CATALOG_REQUEST_TYPE,
  PROCESSOR_CATALOG_REQUEST_TYPE
]);
const ARCHIVED_STATUS_FILTER = 'archived';
const UNIT_REQUEST_ARCHIVE_RETENTION_DAYS = 30;
const VALID_STATUS_FILTERS = new Set(['pending', 'approved', 'rejected', 'withdrawn', 'all', ARCHIVED_STATUS_FILTER]);
const VALID_REQUEST_TYPE_FILTERS = new Set([
  'all',
  INTENTIONAL_DUPLICATE_REQUEST_TYPE,
  MODEL_CATALOG_REQUEST_TYPE,
  PROCESSOR_CATALOG_REQUEST_TYPE,
  QC_REVERSION_REQUEST_TYPE
]);
const MAX_REQUEST_SEARCH_LENGTH = 150;
const REQUEST_SCHEMA_CAPABILITY_CACHE_MS = 60000;
let requestSchemaCapabilityCache = null;

function normalizePositiveInteger(value) {
  const parsed = Number(String(value || '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = 1000) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : '';
}

function normalizeStatusFilter(value) {
  const normalized = String(value || 'pending').trim().toLowerCase();
  return VALID_STATUS_FILTERS.has(normalized) ? normalized : 'pending';
}

function normalizeRequestTypeFilter(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return VALID_REQUEST_TYPE_FILTERS.has(normalized) ? normalized : 'all';
}

function normalizeRequestSearch(value) {
  return normalizeText(value, MAX_REQUEST_SEARCH_LENGTH);
}

function normalizeOptionalDecimal(value) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 99.99
    ? Number(parsed.toFixed(2))
    : null;
}

function parseJsonValue(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function getPersonName(row, prefix) {
  const firstName = String(row[`${prefix}_first_name`] || '').trim();
  const lastName = String(row[`${prefix}_last_name`] || '').trim();
  const email = String(row[`${prefix}_email`] || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || email || 'Unknown user';
}

async function tableExists(tableName, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0]?.table_count || 0) > 0;
}

async function columnExists(tableName, columnName, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS column_count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0]?.column_count || 0) > 0;
}

async function getRequestSchemaCapabilities(connection = pool) {
  const canUseCache = connection === pool;
  const now = Date.now();

  if (canUseCache && requestSchemaCapabilityCache && requestSchemaCapabilityCache.expiresAt > now) {
    return requestSchemaCapabilityCache.value;
  }

  const requiredTables = [
    UNIT_REQUESTS_TABLE,
    UNIT_DUPLICATE_REQUESTS_TABLE,
    UNIT_REQUEST_EVENTS_TABLE,
    UNIT_MODEL_CATALOG_REQUESTS_TABLE,
    UNIT_PROCESSOR_CATALOG_REQUESTS_TABLE,
    UNIT_QC_REVERSION_REQUESTS_TABLE
  ];
  const [rows] = await connection.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${requiredTables.map(() => '?').join(', ')})
    `,
    requiredTables
  );
  const availableTables = new Set(rows.map((row) => String(row.TABLE_NAME || row.table_name || '')));
  const value = {
    baseSupported: [UNIT_REQUESTS_TABLE, UNIT_DUPLICATE_REQUESTS_TABLE, UNIT_REQUEST_EVENTS_TABLE, UNIT_QC_REVERSION_REQUESTS_TABLE]
      .every((tableName) => availableTables.has(tableName)),
    catalogSupported: [UNIT_MODEL_CATALOG_REQUESTS_TABLE, UNIT_PROCESSOR_CATALOG_REQUESTS_TABLE]
      .every((tableName) => availableTables.has(tableName))
  };

  if (canUseCache) {
    requestSchemaCapabilityCache = {
      expiresAt: now + REQUEST_SCHEMA_CAPABILITY_CACHE_MS,
      value
    };
  }

  return value;
}

async function requestTablesSupported(connection = pool) {
  return (await getRequestSchemaCapabilities(connection)).baseSupported;
}

async function catalogRequestTablesSupported(connection = pool) {
  return (await getRequestSchemaCapabilities(connection)).catalogSupported;
}

async function requestArchiveSupported(connection = pool) {
  return columnExists(UNIT_REQUESTS_TABLE, 'archived_at', connection);
}

function getStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'withdrawn') return 'Withdrawn';
  return 'Pending Review';
}

function getStatusClass(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'success';
  if (normalized === 'rejected') return 'danger';
  if (normalized === 'withdrawn') return 'slate';
  return 'warn';
}

function getRequestTypeLabel(requestType) {
  if (requestType === INTENTIONAL_DUPLICATE_REQUEST_TYPE) return 'Intentional Duplicate';
  if (requestType === MODEL_CATALOG_REQUEST_TYPE) return 'Model Catalog Addition';
  if (requestType === PROCESSOR_CATALOG_REQUEST_TYPE) return 'Processor Catalog Addition';
  if (requestType === QC_REVERSION_REQUEST_TYPE) return 'QC Decision Reversion';
  return 'Unit Request';
}

function getAssetTagLabel(assetNumber) {
  return assetNumber ? techUnitModel.getDisplayAssetTag(assetNumber) : 'Unit without asset tag';
}

function getLotName(lotMap, lotId) {
  const lot = lotMap.get(Number(lotId));
  return lot ? lot.lot_name : 'Lot name not available';
}

function normalizeFormDataSnapshot(snapshot) {
  const formData = snapshot && snapshot.formData && typeof snapshot.formData === 'object'
    ? { ...snapshot.formData }
    : null;

  if (!formData) return null;

  formData.assetTag = '';
  formData.canOverrideProductionWeight = false;
  formData.productionWeightOverride = '';
  formData.productionWeightNotes = '';
  formData.graphicsAdapters = [];
  return formData;
}

function buildCatalogContext(row) {
  if (row.request_type === MODEL_CATALOG_REQUEST_TYPE) {
    const manufacturerName = row.model_request_manufacturer_name || 'Manufacturer not available';
    const categoryLabel = row.model_request_category_label || 'Category not available';
    const requestedModelName = row.requested_model_name || 'Model name not available';

    return {
      kind: 'model',
      manufacturerId: row.model_request_manufacturer_id ? Number(row.model_request_manufacturer_id) : null,
      manufacturerName,
      unitCategoryConfigValueId: row.model_request_category_id ? Number(row.model_request_category_id) : null,
      unitCategoryLabel: categoryLabel,
      requestedModelName,
      approvedModelName: row.approved_model_name || '',
      approvedUnitModelId: row.approved_unit_model_id ? Number(row.approved_unit_model_id) : null,
      approvedUnitModelLabel: row.approved_unit_model_label || '',
      summary: `${manufacturerName} · ${categoryLabel} · ${requestedModelName}`,
      detailLabel: requestedModelName
    };
  }

  if (row.request_type === PROCESSOR_CATALOG_REQUEST_TYPE) {
    const manufacturerName = row.processor_request_manufacturer_name || 'Manufacturer not available';
    const unitModelName = row.processor_request_unit_model_name || 'Unit Model not available';
    const categoryLabel = row.processor_request_category_label || 'Category not available';
    const requestedProcessorType = row.requested_processor_type || 'Processor Type not provided';
    const requestedProcessorName = row.requested_processor_name || 'Processor not provided';
    const requestedProcessorSpeedGhz = row.requested_processor_speed_ghz !== null && row.requested_processor_speed_ghz !== undefined
      ? Number(row.requested_processor_speed_ghz).toFixed(2)
      : '';
    const approvedProcessorBaseSpeedGhz = row.approved_processor_base_speed_ghz !== null && row.approved_processor_base_speed_ghz !== undefined
      ? Number(row.approved_processor_base_speed_ghz).toFixed(2)
      : '';

    return {
      kind: 'processor',
      unitModelId: row.processor_request_unit_model_id ? Number(row.processor_request_unit_model_id) : null,
      manufacturerName,
      unitModelName,
      unitCategoryLabel: categoryLabel,
      requestedProcessorType,
      requestedProcessorName,
      requestedProcessorSpeedGhz,
      approvedProcessorBrandId: row.approved_processor_brand_id ? Number(row.approved_processor_brand_id) : null,
      approvedProcessorBrandName: row.approved_processor_brand_name || '',
      approvedProcessorModelId: row.approved_processor_model_id ? Number(row.approved_processor_model_id) : null,
      approvedProcessorModelLabel: row.approved_processor_model_label || '',
      approvedProcessorBaseSpeedGhz,
      summary: `${manufacturerName} · ${unitModelName}`,
      detailLabel: `${requestedProcessorType} · ${requestedProcessorName}${requestedProcessorSpeedGhz ? ` @ ${requestedProcessorSpeedGhz} GHz` : ''}`
    };
  }

  return null;
}

function buildQcReversionContext(row) {
  if (row.request_type !== QC_REVERSION_REQUEST_TYPE || !row.qc_reversion_qc_check_id) return null;

  const decisionCode = String(row.qc_reversion_decision_code || '').trim().toLowerCase();
  const decisionLabelValue = decisionCode === 'accepted' ? 'Accepted' : decisionCode === 'rejected' ? 'Rejected' : 'Unknown';
  const unitLabel = row.qc_reversion_asset_number ? getAssetTagLabel(row.qc_reversion_asset_number) : 'Unit';

  return {
    unitId: Number(row.qc_reversion_unit_id) || null,
    unitLabel,
    unitWorkCompletionId: Number(row.qc_reversion_completion_id) || null,
    qcCheckId: Number(row.qc_reversion_qc_check_id) || null,
    decisionCode,
    decisionLabel: decisionLabelValue,
    qcReviewedByUserId: Number(row.qc_reversion_reviewed_by_user_id) || null,
    qcReviewedByName: String(row.qc_reversion_reviewed_by_name || '').trim(),
    qcReviewedAt: row.qc_reversion_reviewed_at || null,
    qcReviewNotes: String(row.qc_reversion_review_notes || '').trim(),
    summary: unitLabel,
    detailLabel: `QC ${decisionLabelValue} decision #${Number(row.qc_reversion_qc_check_id)}`
  };
}

function mapRequest(row, lotMap = new Map()) {
  const intakeSnapshot = parseJsonValue(row.intake_snapshot_json, {});
  const matchedUnitSnapshot = parseJsonValue(row.matched_unit_snapshot_json, {});
  const destinationLotId = Number(row.requested_destination_lot_id || 0) || null;
  const matchedLotId = Number(row.current_matched_lot_id || 0) || null;
  const createdLotId = Number(row.created_unit_lot_id || 0) || null;
  const catalogContext = buildCatalogContext(row);
  const qcReversionContext = buildQcReversionContext(row);
  const isDuplicateRequest = row.request_type === INTENTIONAL_DUPLICATE_REQUEST_TYPE;

  return {
    unitRequestId: Number(row.unit_request_id),
    requestType: row.request_type,
    requestTypeLabel: getRequestTypeLabel(row.request_type),
    isIntentionalDuplicateRequest: isDuplicateRequest,
    isCatalogRequest: CATALOG_REQUEST_TYPES.has(row.request_type),
    isQcReversionRequest: row.request_type === QC_REVERSION_REQUEST_TYPE,
    catalogContext,
    qcReversionContext,
    status: row.status,
    statusLabel: getStatusLabel(row.status),
    statusClass: getStatusClass(row.status),
    isPending: row.status === 'pending',
    isArchived: Boolean(row.archived_at),
    archivedAt: row.archived_at || null,
    requestedByUserId: Number(row.requested_by_user_id),
    requestedByName: getPersonName(row, 'requested_by'),
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedByName: row.reviewed_by_user_id ? getPersonName(row, 'reviewed_by') : '',
    requesterNote: row.requester_note || '',
    reviewerNote: row.reviewer_note || '',
    submittedAt: row.submitted_at || null,
    reviewedAt: row.reviewed_at || null,
    matchedUnitId: isDuplicateRequest && row.matched_unit_id ? Number(row.matched_unit_id) : null,
    matchedUnitLabel: isDuplicateRequest ? getAssetTagLabel(row.matched_unit_asset_number) : '',
    matchedUnitCurrentLotId: isDuplicateRequest ? matchedLotId : null,
    matchedUnitCurrentLotName: isDuplicateRequest ? (matchedLotId ? (row.current_matched_lot_name || getLotName(lotMap, matchedLotId)) : 'No current lot') : '',
    requestedDestinationLotId: isDuplicateRequest ? destinationLotId : null,
    requestedDestinationLotName: isDuplicateRequest ? (destinationLotId ? (row.requested_destination_lot_name || getLotName(lotMap, destinationLotId)) : 'No lot selected') : '',
    createdUnitId: isDuplicateRequest && row.created_unit_id ? Number(row.created_unit_id) : null,
    createdUnitLabel: isDuplicateRequest && row.created_unit_asset_number ? getAssetTagLabel(row.created_unit_asset_number) : '',
    createdUnitLotId: isDuplicateRequest ? createdLotId : null,
    createdUnitLotName: isDuplicateRequest && createdLotId ? (row.created_unit_lot_name || getLotName(lotMap, createdLotId)) : '',
    intakeSnapshot,
    matchedUnitSnapshot,
    snapshotDisplay: intakeSnapshot.display && typeof intakeSnapshot.display === 'object'
      ? intakeSnapshot.display
      : {},
    serialSummary: intakeSnapshot.display?.serialSummary || 'Serial values recorded in the intake snapshot.',
    listContextPrimary: isDuplicateRequest
      ? getAssetTagLabel(row.matched_unit_asset_number)
      : (catalogContext ? catalogContext.summary : qcReversionContext ? qcReversionContext.summary : 'Request details unavailable'),
    listContextSecondary: isDuplicateRequest
      ? (destinationLotId ? (row.requested_destination_lot_name || getLotName(lotMap, destinationLotId)) : 'No lot selected')
      : (catalogContext ? catalogContext.detailLabel : qcReversionContext ? qcReversionContext.detailLabel : '')
  };
}

function getBaseRequestWhere({
  statusFilter,
  requestTypeFilter,
  searchTerm,
  requestedByUserId,
  requestId,
  catalogSupported,
  includeArchived = false
}) {
  const where = [];
  const values = [];
  const normalizedStatus = normalizeStatusFilter(statusFilter);
  const normalizedRequestType = normalizeRequestTypeFilter(requestTypeFilter);
  const normalizedSearchTerm = normalizeRequestSearch(searchTerm);
  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  const safeRequestId = normalizePositiveInteger(requestId);

  if (normalizedStatus === ARCHIVED_STATUS_FILTER) {
    where.push('ur.archived_at IS NOT NULL');
  } else if (!includeArchived) {
    where.push('ur.archived_at IS NULL');
  }

  if (normalizedStatus !== 'all' && normalizedStatus !== ARCHIVED_STATUS_FILTER) {
    where.push('ur.status = ?');
    values.push(normalizedStatus);
  }

  if (normalizedRequestType !== 'all') {
    where.push('ur.request_type = ?');
    values.push(normalizedRequestType);
  }

  if (safeRequesterUserId) {
    where.push('ur.requested_by_user_id = ?');
    values.push(safeRequesterUserId);
  }

  if (safeRequestId) {
    where.push('ur.unit_request_id = ?');
    values.push(safeRequestId);
  }

  if (normalizedSearchTerm) {
    const searchLike = `%${normalizedSearchTerm}%`;
    const searchConditions = [
      'CAST(ur.unit_request_id AS CHAR) LIKE ?',
      "CONCAT_WS(' ', requested_by.first_name, requested_by.last_name) LIKE ?",
      'requested_by.email LIKE ?',
      'CAST(matched_unit.asset_number AS CHAR) LIKE ?',
      'CAST(udr.intake_snapshot_json AS CHAR) LIKE ?',
      'CAST(udr.matched_unit_snapshot_json AS CHAR) LIKE ?',
      'requested_destination_lot.name LIKE ?',
      'CAST(qrr.unit_qc_check_id AS CHAR) LIKE ?',
      'CAST(qc_reversion_unit.asset_number AS CHAR) LIKE ?',
      'qrr.decision_code LIKE ?',
      'CAST(ur.requester_note AS CHAR) LIKE ?'
    ];
    const searchValues = Array(searchConditions.length).fill(searchLike);
    const matchingAssetNumber = techUnitModel.normalizeAssetTagInput(normalizedSearchTerm);

    if (matchingAssetNumber) {
      searchConditions.push('matched_unit.asset_number = ?');
      searchValues.push(matchingAssetNumber);
    }

    if (catalogSupported) {
      const catalogSearchConditions = [
        'umcr.requested_model_name LIKE ?',
        'model_request_manufacturer.name LIKE ?',
        'processor_request_model.model_name LIKE ?',
        'processor_request_manufacturer.name LIKE ?',
        'upcr.requested_processor_type LIKE ?',
        'upcr.requested_processor_name LIKE ?',
        'CAST(upcr.requested_processor_speed_ghz AS CHAR) LIKE ?'
      ];

      searchConditions.push(...catalogSearchConditions);
      searchValues.push(...Array(catalogSearchConditions.length).fill(searchLike));
    }

    where.push(`(${searchConditions.join(' OR ')})`);
    values.push(...searchValues);
  }

  return {
    normalizedStatus,
    normalizedRequestType,
    normalizedSearchTerm,
    where,
    values
  };
}

function getRequestSelectSql({ includeCatalogTables }) {
  const catalogJoinSql = includeCatalogTables
    ? `
        LEFT JOIN unit_model_catalog_requests umcr
          ON umcr.unit_request_id = ur.unit_request_id
        LEFT JOIN manufacturers model_request_manufacturer
          ON model_request_manufacturer.manufacturer_id = umcr.manufacturer_id
        LEFT JOIN config_values model_request_category
          ON model_request_category.config_value_id = umcr.unit_category_config_value_id
        LEFT JOIN unit_models approved_model
          ON approved_model.unit_model_id = umcr.approved_unit_model_id
        LEFT JOIN unit_processor_catalog_requests upcr
          ON upcr.unit_request_id = ur.unit_request_id
        LEFT JOIN unit_models processor_request_model
          ON processor_request_model.unit_model_id = upcr.unit_model_id
        LEFT JOIN manufacturers processor_request_manufacturer
          ON processor_request_manufacturer.manufacturer_id = processor_request_model.manufacturer_id
        LEFT JOIN config_values processor_request_category
          ON processor_request_category.config_value_id = processor_request_model.unit_category_config_value_id
        LEFT JOIN processor_brands approved_processor_brand
          ON approved_processor_brand.processor_brand_id = upcr.approved_processor_brand_id
        LEFT JOIN processor_models approved_processor_model
          ON approved_processor_model.processor_model_id = upcr.approved_processor_model_id
      `
    : '';

  const catalogFields = includeCatalogTables
    ? `
          umcr.manufacturer_id AS model_request_manufacturer_id,
          umcr.unit_category_config_value_id AS model_request_category_id,
          umcr.requested_model_name,
          umcr.approved_model_name,
          umcr.approved_unit_model_id,
          model_request_manufacturer.name AS model_request_manufacturer_name,
          COALESCE(model_request_category.label, model_request_category.value) AS model_request_category_label,
          approved_model.model_name AS approved_unit_model_label,
          upcr.unit_model_id AS processor_request_unit_model_id,
          upcr.requested_processor_type,
          upcr.requested_processor_name,
          upcr.requested_processor_speed_ghz,
          upcr.approved_processor_brand_id,
          upcr.approved_processor_model_id,
          processor_request_manufacturer.name AS processor_request_manufacturer_name,
          processor_request_model.model_name AS processor_request_unit_model_name,
          COALESCE(processor_request_category.label, processor_request_category.value) AS processor_request_category_label,
          approved_processor_brand.name AS approved_processor_brand_name,
          approved_processor_model.model_code AS approved_processor_model_label,
          approved_processor_model.base_speed_ghz AS approved_processor_base_speed_ghz,
      `
    : '';

  return `
    SELECT
      ur.unit_request_id,
      ur.request_type,
      ur.status,
      ur.requested_by_user_id,
      ur.reviewed_by_user_id,
      ur.requester_note,
      ur.reviewer_note,
      ur.submitted_at,
      ur.reviewed_at,
      ur.archived_at,
      qrr.unit_id AS qc_reversion_unit_id,
      qrr.unit_work_completion_id AS qc_reversion_completion_id,
      qrr.unit_qc_check_id AS qc_reversion_qc_check_id,
      qrr.decision_code AS qc_reversion_decision_code,
      qrr.qc_reviewed_by_user_id AS qc_reversion_reviewed_by_user_id,
      qrr.qc_reviewed_at AS qc_reversion_reviewed_at,
      qrr.qc_review_notes AS qc_reversion_review_notes,
      CONCAT_WS(' ', qc_reversion_reviewer.first_name, qc_reversion_reviewer.last_name) AS qc_reversion_reviewed_by_name,
      qc_reversion_unit.asset_number AS qc_reversion_asset_number,
      udr.matched_unit_id,
      udr.requested_destination_lot_id,
      udr.created_unit_id,
      udr.intake_snapshot_json,
      udr.matched_unit_snapshot_json,
      matched_unit.asset_number AS matched_unit_asset_number,
      matched_unit.lot_id AS current_matched_lot_id,
      matched_current_lot.name AS current_matched_lot_name,
      created_unit.asset_number AS created_unit_asset_number,
      created_unit.lot_id AS created_unit_lot_id,
      created_current_lot.name AS created_unit_lot_name,
      requested_destination_lot.name AS requested_destination_lot_name,
      requested_by.first_name AS requested_by_first_name,
      requested_by.last_name AS requested_by_last_name,
      requested_by.email AS requested_by_email,
      reviewed_by.first_name AS reviewed_by_first_name,
      reviewed_by.last_name AS reviewed_by_last_name,
      reviewed_by.email AS reviewed_by_email,
      ${catalogFields}
      NULL AS _catalog_placeholder
    FROM unit_requests ur
    LEFT JOIN unit_duplicate_requests udr
      ON udr.unit_request_id = ur.unit_request_id
    LEFT JOIN unit_qc_reversion_requests qrr
      ON qrr.unit_request_id = ur.unit_request_id
    LEFT JOIN units qc_reversion_unit
      ON qc_reversion_unit.unit_id = qrr.unit_id
    LEFT JOIN users qc_reversion_reviewer
      ON qc_reversion_reviewer.user_id = qrr.qc_reviewed_by_user_id
    INNER JOIN users requested_by
      ON requested_by.user_id = ur.requested_by_user_id
    LEFT JOIN users reviewed_by
      ON reviewed_by.user_id = ur.reviewed_by_user_id
    LEFT JOIN units matched_unit
      ON matched_unit.unit_id = udr.matched_unit_id
    LEFT JOIN units created_unit
      ON created_unit.unit_id = udr.created_unit_id
    LEFT JOIN lots matched_current_lot
      ON matched_current_lot.lot_id = matched_unit.lot_id
    LEFT JOIN lots created_current_lot
      ON created_current_lot.lot_id = created_unit.lot_id
    LEFT JOIN lots requested_destination_lot
      ON requested_destination_lot.lot_id = udr.requested_destination_lot_id
    ${catalogJoinSql}
  `;
}


function mapRequestSummary(row) {
  const destinationLotId = Number(row.requested_destination_lot_id || 0) || null;
  const matchedLotId = Number(row.current_matched_lot_id || 0) || null;
  const createdLotId = Number(row.created_unit_lot_id || 0) || null;
  const catalogContext = buildCatalogContext(row);
  const qcReversionContext = buildQcReversionContext(row);
  const isDuplicateRequest = row.request_type === INTENTIONAL_DUPLICATE_REQUEST_TYPE;
  const serialSummary = String(row.queue_serial_summary || '').trim();
  const matchedSerialSummary = String(row.queue_matched_serial_summary || '').trim();

  return {
    unitRequestId: Number(row.unit_request_id),
    requestType: row.request_type,
    requestTypeLabel: getRequestTypeLabel(row.request_type),
    isIntentionalDuplicateRequest: isDuplicateRequest,
    isCatalogRequest: CATALOG_REQUEST_TYPES.has(row.request_type),
    isQcReversionRequest: row.request_type === QC_REVERSION_REQUEST_TYPE,
    catalogContext,
    qcReversionContext,
    status: row.status,
    statusLabel: getStatusLabel(row.status),
    statusClass: getStatusClass(row.status),
    isPending: row.status === 'pending',
    isArchived: Boolean(row.archived_at),
    archivedAt: row.archived_at || null,
    requestedByUserId: Number(row.requested_by_user_id),
    requestedByName: getPersonName(row, 'requested_by'),
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedByName: row.reviewed_by_user_id ? getPersonName(row, 'reviewed_by') : '',
    requesterNote: '',
    reviewerNote: '',
    submittedAt: row.submitted_at || null,
    reviewedAt: row.reviewed_at || null,
    matchedUnitId: isDuplicateRequest && row.matched_unit_id ? Number(row.matched_unit_id) : null,
    matchedUnitLabel: isDuplicateRequest ? getAssetTagLabel(row.matched_unit_asset_number) : '',
    matchedUnitCurrentLotId: isDuplicateRequest ? matchedLotId : null,
    matchedUnitCurrentLotName: isDuplicateRequest
      ? (matchedLotId ? (row.current_matched_lot_name || 'Lot name not available') : 'No current lot')
      : '',
    requestedDestinationLotId: isDuplicateRequest ? destinationLotId : null,
    requestedDestinationLotName: isDuplicateRequest
      ? (destinationLotId ? (row.requested_destination_lot_name || 'Lot name not available') : 'No lot selected')
      : '',
    createdUnitId: isDuplicateRequest && row.created_unit_id ? Number(row.created_unit_id) : null,
    createdUnitLabel: isDuplicateRequest && row.created_unit_asset_number ? getAssetTagLabel(row.created_unit_asset_number) : '',
    createdUnitLotId: isDuplicateRequest ? createdLotId : null,
    createdUnitLotName: isDuplicateRequest && createdLotId ? (row.created_unit_lot_name || 'Lot name not available') : '',
    intakeSnapshot: {},
    matchedUnitSnapshot: matchedSerialSummary ? { display: { serialSummary: matchedSerialSummary } } : {},
    snapshotDisplay: {},
    serialSummary: serialSummary || 'Serial values recorded in the intake snapshot.',
    listContextPrimary: isDuplicateRequest
      ? getAssetTagLabel(row.matched_unit_asset_number)
      : (catalogContext ? catalogContext.summary : qcReversionContext ? qcReversionContext.summary : 'Request details unavailable'),
    listContextSecondary: isDuplicateRequest
      ? (destinationLotId ? (row.requested_destination_lot_name || 'Lot name not available') : 'No lot selected')
      : (catalogContext ? catalogContext.detailLabel : qcReversionContext ? qcReversionContext.detailLabel : '')
  };
}

function getRequestSummarySelectSql({ includeCatalogTables }) {
  const catalogJoinSql = includeCatalogTables
    ? `
        LEFT JOIN unit_model_catalog_requests umcr
          ON umcr.unit_request_id = ur.unit_request_id
        LEFT JOIN manufacturers model_request_manufacturer
          ON model_request_manufacturer.manufacturer_id = umcr.manufacturer_id
        LEFT JOIN config_values model_request_category
          ON model_request_category.config_value_id = umcr.unit_category_config_value_id
        LEFT JOIN unit_models approved_model
          ON approved_model.unit_model_id = umcr.approved_unit_model_id
        LEFT JOIN unit_processor_catalog_requests upcr
          ON upcr.unit_request_id = ur.unit_request_id
        LEFT JOIN unit_models processor_request_model
          ON processor_request_model.unit_model_id = upcr.unit_model_id
        LEFT JOIN manufacturers processor_request_manufacturer
          ON processor_request_manufacturer.manufacturer_id = processor_request_model.manufacturer_id
        LEFT JOIN config_values processor_request_category
          ON processor_request_category.config_value_id = processor_request_model.unit_category_config_value_id
        LEFT JOIN processor_brands approved_processor_brand
          ON approved_processor_brand.processor_brand_id = upcr.approved_processor_brand_id
        LEFT JOIN processor_models approved_processor_model
          ON approved_processor_model.processor_model_id = upcr.approved_processor_model_id
      `
    : '';

  const catalogFields = includeCatalogTables
    ? `
          umcr.manufacturer_id AS model_request_manufacturer_id,
          umcr.unit_category_config_value_id AS model_request_category_id,
          umcr.requested_model_name,
          umcr.approved_model_name,
          umcr.approved_unit_model_id,
          model_request_manufacturer.name AS model_request_manufacturer_name,
          COALESCE(model_request_category.label, model_request_category.value) AS model_request_category_label,
          approved_model.model_name AS approved_unit_model_label,
          upcr.unit_model_id AS processor_request_unit_model_id,
          upcr.requested_processor_type,
          upcr.requested_processor_name,
          upcr.requested_processor_speed_ghz,
          upcr.approved_processor_brand_id,
          upcr.approved_processor_model_id,
          processor_request_manufacturer.name AS processor_request_manufacturer_name,
          processor_request_model.model_name AS processor_request_unit_model_name,
          COALESCE(processor_request_category.label, processor_request_category.value) AS processor_request_category_label,
          approved_processor_brand.name AS approved_processor_brand_name,
          approved_processor_model.model_code AS approved_processor_model_label,
          approved_processor_model.base_speed_ghz AS approved_processor_base_speed_ghz,
      `
    : '';

  return `
    SELECT
      ur.unit_request_id,
      ur.request_type,
      ur.status,
      ur.requested_by_user_id,
      ur.reviewed_by_user_id,
      ur.submitted_at,
      ur.reviewed_at,
      ur.archived_at,
      qrr.unit_id AS qc_reversion_unit_id,
      qrr.unit_work_completion_id AS qc_reversion_completion_id,
      qrr.unit_qc_check_id AS qc_reversion_qc_check_id,
      qrr.decision_code AS qc_reversion_decision_code,
      qrr.qc_reviewed_by_user_id AS qc_reversion_reviewed_by_user_id,
      qrr.qc_reviewed_at AS qc_reversion_reviewed_at,
      qrr.qc_review_notes AS qc_reversion_review_notes,
      CONCAT_WS(' ', qc_reversion_reviewer.first_name, qc_reversion_reviewer.last_name) AS qc_reversion_reviewed_by_name,
      qc_reversion_unit.asset_number AS qc_reversion_asset_number,
      udr.matched_unit_id,
      udr.requested_destination_lot_id,
      udr.created_unit_id,
      JSON_UNQUOTE(JSON_EXTRACT(udr.intake_snapshot_json, '$.display.serialSummary')) AS queue_serial_summary,
      JSON_UNQUOTE(JSON_EXTRACT(udr.matched_unit_snapshot_json, '$.display.serialSummary')) AS queue_matched_serial_summary,
      matched_unit.asset_number AS matched_unit_asset_number,
      matched_unit.lot_id AS current_matched_lot_id,
      matched_current_lot.name AS current_matched_lot_name,
      created_unit.asset_number AS created_unit_asset_number,
      created_unit.lot_id AS created_unit_lot_id,
      created_current_lot.name AS created_unit_lot_name,
      requested_destination_lot.name AS requested_destination_lot_name,
      requested_by.first_name AS requested_by_first_name,
      requested_by.last_name AS requested_by_last_name,
      requested_by.email AS requested_by_email,
      reviewed_by.first_name AS reviewed_by_first_name,
      reviewed_by.last_name AS reviewed_by_last_name,
      reviewed_by.email AS reviewed_by_email,
      ${catalogFields}
      NULL AS _catalog_placeholder
    FROM unit_requests ur
    LEFT JOIN unit_duplicate_requests udr
      ON udr.unit_request_id = ur.unit_request_id
    LEFT JOIN unit_qc_reversion_requests qrr
      ON qrr.unit_request_id = ur.unit_request_id
    LEFT JOIN units qc_reversion_unit
      ON qc_reversion_unit.unit_id = qrr.unit_id
    LEFT JOIN users qc_reversion_reviewer
      ON qc_reversion_reviewer.user_id = qrr.qc_reviewed_by_user_id
    INNER JOIN users requested_by
      ON requested_by.user_id = ur.requested_by_user_id
    LEFT JOIN users reviewed_by
      ON reviewed_by.user_id = ur.reviewed_by_user_id
    LEFT JOIN units matched_unit
      ON matched_unit.unit_id = udr.matched_unit_id
    LEFT JOIN units created_unit
      ON created_unit.unit_id = udr.created_unit_id
    LEFT JOIN lots matched_current_lot
      ON matched_current_lot.lot_id = matched_unit.lot_id
    LEFT JOIN lots created_current_lot
      ON created_current_lot.lot_id = created_unit.lot_id
    LEFT JOIN lots requested_destination_lot
      ON requested_destination_lot.lot_id = udr.requested_destination_lot_id
    ${catalogJoinSql}
  `;
}

async function listUnitRequestSummaries({
  statusFilter = 'pending',
  requestTypeFilter = 'all',
  searchTerm = '',
  requestedByUserId = null,
  includeArchived = false
} = {}) {
  const capabilities = await getRequestSchemaCapabilities();
  const baseSupported = capabilities.baseSupported;
  const catalogSupported = baseSupported && capabilities.catalogSupported;
  const {
    normalizedStatus,
    normalizedRequestType,
    normalizedSearchTerm,
    where,
    values
  } = getBaseRequestWhere({
    statusFilter,
    requestTypeFilter,
    searchTerm,
    requestedByUserId,
    catalogSupported,
    includeArchived
  });

  if (!baseSupported) {
    return {
      supported: false,
      message: 'Unit Requests tables are not available yet. Run the Step 7e.3 database migration.',
      statusFilter: normalizedStatus,
      requestTypeFilter: normalizedRequestType,
      searchTerm: normalizedSearchTerm,
      requests: []
    };
  }

  const [rowsResult] = await pool.query(
    `
      ${getRequestSummarySelectSql({ includeCatalogTables: catalogSupported })}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    `,
    values
  );

  return {
    supported: true,
    catalogSupported,
    message: catalogSupported ? '' : 'Catalog Exception requests are unavailable until the Step 7f database migration is complete.',
    statusFilter: normalizedStatus,
    requestTypeFilter: normalizedRequestType,
    searchTerm: normalizedSearchTerm,
    requests: rowsResult.map((row) => mapRequestSummary(row))
  };
}

async function listUnitRequests({
  statusFilter = 'pending',
  requestTypeFilter = 'all',
  searchTerm = '',
  requestedByUserId = null,
  requestId = null,
  includeArchived = false
} = {}) {
  const baseSupported = await requestTablesSupported();
  const catalogSupported = baseSupported ? await catalogRequestTablesSupported() : false;
  const {
    normalizedStatus,
    normalizedRequestType,
    normalizedSearchTerm,
    where,
    values
  } = getBaseRequestWhere({
    statusFilter,
    requestTypeFilter,
    searchTerm,
    requestedByUserId,
    requestId,
    catalogSupported,
    includeArchived
  });

  if (!baseSupported) {
    return {
      supported: false,
      message: 'Unit Requests tables are not available yet. Run the Step 7e.3 database migration.',
      statusFilter: normalizedStatus,
      requestTypeFilter: normalizedRequestType,
      searchTerm: normalizedSearchTerm,
      requests: []
    };
  }

  const orderBySql = normalizedStatus === ARCHIVED_STATUS_FILTER
    ? 'ORDER BY ur.archived_at DESC, ur.unit_request_id DESC'
    : 'ORDER BY ur.submitted_at ASC, ur.unit_request_id ASC';

  const [rowsResult] = await pool.query(
    `
      ${getRequestSelectSql({ includeCatalogTables: catalogSupported })}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ${orderBySql}
    `,
    values
  );

  return {
    supported: true,
    catalogSupported,
    message: catalogSupported ? '' : 'Catalog Exception requests are unavailable until the Step 7f database migration is complete.',
    statusFilter: normalizedStatus,
    requestTypeFilter: normalizedRequestType,
    searchTerm: normalizedSearchTerm,
    requests: rowsResult.map((row) => mapRequest(row))
  };
}

async function archiveResolvedUnitRequests() {
  if (!await requestArchiveSupported()) {
    return { supported: false, archivedCount: 0 };
  }

  const [result] = await pool.query(
    `
      UPDATE unit_requests
      SET archived_at = NOW()
      WHERE archived_at IS NULL
        AND status IN ('approved', 'rejected', 'withdrawn')
        AND reviewed_at IS NOT NULL
        AND reviewed_at <= DATE_SUB(NOW(), INTERVAL ${UNIT_REQUEST_ARCHIVE_RETENTION_DAYS} DAY)
    `
  );

  return {
    supported: true,
    archivedCount: Number(result.affectedRows || 0)
  };
}

async function listActiveProcessorBrands() {
  const [rows] = await pool.query(
    `
      SELECT processor_brand_id, name
      FROM processor_brands
      WHERE is_active = 1
      ORDER BY name
    `
  );

  return rows.map((row) => ({
    id: Number(row.processor_brand_id),
    label: row.name
  }));
}

async function getUnitRequestById(unitRequestId) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  if (!safeRequestId) return null;

  const requestPromise = listUnitRequests({
    statusFilter: 'all',
    requestId: safeRequestId,
    includeArchived: true
  });
  const eventsPromise = pool.query(
    `
      SELECT
        ure.unit_request_event_id,
        ure.event_type,
        ure.event_note,
        ure.event_details_json,
        ure.occurred_at,
        actor.first_name AS actor_first_name,
        actor.last_name AS actor_last_name,
        actor.email AS actor_email
      FROM unit_request_events ure
      INNER JOIN users actor
        ON actor.user_id = ure.performed_by_user_id
      WHERE ure.unit_request_id = ?
      ORDER BY ure.occurred_at ASC, ure.unit_request_event_id ASC
    `,
    [safeRequestId]
  );

  const [result, [eventRows]] = await Promise.all([requestPromise, eventsPromise]);
  const request = result.requests[0] || null;
  if (!request) return null;

  request.events = eventRows.map((row) => ({
    unitRequestEventId: Number(row.unit_request_event_id),
    eventType: row.event_type,
    eventNote: row.event_note || '',
    eventDetails: parseJsonValue(row.event_details_json, {}),
    occurredAt: row.occurred_at || null,
    performedByName: getPersonName(row, 'actor')
  }));

  return request;
}

async function recordRequestEvent(connection, {
  unitRequestId,
  eventType,
  performedByUserId,
  eventNote = null,
  eventDetails = null
}) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeUserId = normalizePositiveInteger(performedByUserId);

  if (!safeRequestId || !safeUserId) {
    throw new Error('A valid Unit Request and user are required to record request history.');
  }

  await connection.query(
    `
      INSERT INTO unit_request_events (
        unit_request_id,
        event_type,
        performed_by_user_id,
        event_note,
        event_details_json
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [
      safeRequestId,
      normalizeText(eventType, 100),
      safeUserId,
      normalizeText(eventNote, 1000) || null,
      eventDetails ? JSON.stringify(eventDetails) : null
    ]
  );
}

async function insertBaseRequest(connection, { requestType, requestedByUserId, requesterNote }) {
  const [requestResult] = await connection.query(
    `
      INSERT INTO unit_requests (
        request_type,
        status,
        requested_by_user_id,
        requester_note
      ) VALUES (?, 'pending', ?, ?)
    `,
    [requestType, requestedByUserId, requesterNote]
  );

  return Number(requestResult.insertId);
}

function assertRequesterNote(requesterNote, minimumLength = 10) {
  const safeRequesterNote = normalizeText(requesterNote, 1000);

  if (safeRequesterNote.length < minimumLength) {
    const error = new Error(`Enter at least ${minimumLength} characters explaining the catalog request.`);
    error.code = 'BWT_UNIT_REQUEST_REASON_REQUIRED';
    throw error;
  }

  return safeRequesterNote;
}

async function createIntentionalDuplicateRequest({
  requestedByUserId,
  matchedUnitId,
  requestedDestinationLotId,
  requesterNote,
  intakeSnapshot,
  matchedUnitSnapshot
}) {
  if (!await requestTablesSupported()) {
    const error = new Error('Unit Requests are not ready. Run the Step 7e.3 database migration first.');
    error.code = 'BWT_UNIT_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  const safeMatchedUnitId = normalizePositiveInteger(matchedUnitId);
  const safeDestinationLotId = normalizePositiveInteger(requestedDestinationLotId);
  const safeRequesterNote = assertRequesterNote(requesterNote);

  if (!safeRequesterUserId || !safeMatchedUnitId || !safeDestinationLotId) {
    const error = new Error('Select a matching existing unit and an eligible destination lot before submitting this request.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  if (!intakeSnapshot || typeof intakeSnapshot !== 'object' || !intakeSnapshot.formData) {
    const error = new Error('The intended unit intake details could not be verified. Return to Create Unit and reopen the request.');
    error.code = 'BWT_UNIT_REQUEST_SNAPSHOT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `
        SELECT ur.unit_request_id
        FROM unit_requests ur
        INNER JOIN unit_duplicate_requests udr
          ON udr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = ?
          AND ur.status = 'pending'
          AND ur.requested_by_user_id = ?
          AND udr.matched_unit_id = ?
          AND udr.requested_destination_lot_id = ?
        ORDER BY ur.unit_request_id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [INTENTIONAL_DUPLICATE_REQUEST_TYPE, safeRequesterUserId, safeMatchedUnitId, safeDestinationLotId]
    );

    if (existingRows[0]) {
      const error = new Error(`Intentional Duplicate request #${existingRows[0].unit_request_id} is already pending for this matching unit and destination lot.`);
      error.code = 'BWT_UNIT_REQUEST_ALREADY_PENDING';
      error.unitRequestId = Number(existingRows[0].unit_request_id);
      throw error;
    }

    const unitRequestId = await insertBaseRequest(connection, {
      requestType: INTENTIONAL_DUPLICATE_REQUEST_TYPE,
      requestedByUserId: safeRequesterUserId,
      requesterNote: safeRequesterNote
    });

    await connection.query(
      `
        INSERT INTO unit_duplicate_requests (
          unit_request_id,
          matched_unit_id,
          requested_destination_lot_id,
          intake_snapshot_json,
          matched_unit_snapshot_json
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        unitRequestId,
        safeMatchedUnitId,
        safeDestinationLotId,
        JSON.stringify(intakeSnapshot),
        JSON.stringify(matchedUnitSnapshot || {})
      ]
    );

    await recordRequestEvent(connection, {
      unitRequestId,
      eventType: 'submitted',
      performedByUserId: safeRequesterUserId,
      eventNote: safeRequesterNote,
      eventDetails: { matchedUnitId: safeMatchedUnitId, requestedDestinationLotId: safeDestinationLotId }
    });

    await connection.commit();
    return { unitRequestId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertActiveModelRequestContext(connection, manufacturerId, unitCategoryConfigValueId) {
  const safeManufacturerId = normalizePositiveInteger(manufacturerId);
  const safeCategoryId = normalizePositiveInteger(unitCategoryConfigValueId);

  if (!safeManufacturerId || !safeCategoryId) {
    const error = new Error('Select a valid manufacturer and Unit Category before requesting a model.');
    error.code = 'BWT_CATALOG_REQUEST_INPUT_INVALID';
    throw error;
  }

  const [[manufacturerRows], [categoryRows]] = await Promise.all([
    connection.query('SELECT manufacturer_id FROM manufacturers WHERE manufacturer_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1', [safeManufacturerId]),
    connection.query(`
      SELECT cv.config_value_id
      FROM config_values cv
      INNER JOIN system_config_categories scc
        ON scc.config_category_id = cv.config_category_id
      WHERE cv.config_value_id = ?
        AND scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      LIMIT 1
    `, [safeCategoryId, SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES])
  ]);

  if (!manufacturerRows[0] || !categoryRows[0]) {
    const error = new Error('The selected manufacturer or Unit Category is no longer available for new model requests.');
    error.code = 'BWT_CATALOG_REQUEST_CONTEXT_INVALID';
    throw error;
  }

  return { manufacturerId: safeManufacturerId, unitCategoryConfigValueId: safeCategoryId };
}

async function createModelCatalogRequest({
  requestedByUserId,
  manufacturerId,
  unitCategoryConfigValueId,
  requestedModelName,
  requesterNote
}) {
  if (!await requestTablesSupported() || !await catalogRequestTablesSupported()) {
    const error = new Error('Catalog requests are not ready. Run the Step 7f database migration first.');
    error.code = 'BWT_CATALOG_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  const safeRequestedModelName = normalizeText(requestedModelName, 150);
  const safeRequesterNote = assertRequesterNote(requesterNote);

  if (!safeRequesterUserId || safeRequestedModelName.length < 2) {
    const error = new Error('Enter the exact observed Unit Model name before submitting a catalog request.');
    error.code = 'BWT_CATALOG_REQUEST_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const context = await assertActiveModelRequestContext(connection, manufacturerId, unitCategoryConfigValueId);

    const [activeModelRows] = await connection.query(
      `
        SELECT unit_model_id
        FROM unit_models
        WHERE manufacturer_id = ?
          AND unit_category_config_value_id = ?
          AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
          AND is_active = 1
        LIMIT 1
        FOR UPDATE
      `,
      [context.manufacturerId, context.unitCategoryConfigValueId, safeRequestedModelName]
    );

    if (activeModelRows[0]) {
      const error = new Error('That Unit Model already exists in the active catalog. Select it from Unit Model instead of submitting a request.');
      error.code = 'BWT_CATALOG_REQUEST_ALREADY_ACTIVE';
      throw error;
    }

    const [pendingRows] = await connection.query(
      `
        SELECT ur.unit_request_id
        FROM unit_requests ur
        INNER JOIN unit_model_catalog_requests umcr
          ON umcr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = ?
          AND ur.status = 'pending'
          AND ur.requested_by_user_id = ?
          AND umcr.manufacturer_id = ?
          AND umcr.unit_category_config_value_id = ?
          AND LOWER(TRIM(umcr.requested_model_name)) = LOWER(TRIM(?))
        LIMIT 1
        FOR UPDATE
      `,
      [MODEL_CATALOG_REQUEST_TYPE, safeRequesterUserId, context.manufacturerId, context.unitCategoryConfigValueId, safeRequestedModelName]
    );

    if (pendingRows[0]) {
      const error = new Error(`Model Catalog request #${pendingRows[0].unit_request_id} is already pending for this model.`);
      error.code = 'BWT_CATALOG_REQUEST_ALREADY_PENDING';
      error.unitRequestId = Number(pendingRows[0].unit_request_id);
      throw error;
    }

    const unitRequestId = await insertBaseRequest(connection, {
      requestType: MODEL_CATALOG_REQUEST_TYPE,
      requestedByUserId: safeRequesterUserId,
      requesterNote: safeRequesterNote
    });

    await connection.query(
      `
        INSERT INTO unit_model_catalog_requests (
          unit_request_id,
          manufacturer_id,
          unit_category_config_value_id,
          requested_model_name
        ) VALUES (?, ?, ?, ?)
      `,
      [unitRequestId, context.manufacturerId, context.unitCategoryConfigValueId, safeRequestedModelName]
    );

    await recordRequestEvent(connection, {
      unitRequestId,
      eventType: 'submitted',
      performedByUserId: safeRequesterUserId,
      eventNote: safeRequesterNote,
      eventDetails: {
        manufacturerId: context.manufacturerId,
        unitCategoryConfigValueId: context.unitCategoryConfigValueId,
        requestedModelName: safeRequestedModelName
      }
    });

    await connection.commit();
    return { unitRequestId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertActiveUnitModel(connection, unitModelId) {
  const safeUnitModelId = normalizePositiveInteger(unitModelId);

  if (!safeUnitModelId) {
    const error = new Error('Select a managed Unit Model before requesting processor compatibility.');
    error.code = 'BWT_CATALOG_REQUEST_INPUT_INVALID';
    throw error;
  }

  const [rows] = await connection.query(
    `
      SELECT um.unit_model_id
      FROM unit_models um
      INNER JOIN manufacturers m
        ON m.manufacturer_id = um.manufacturer_id
      WHERE um.unit_model_id = ?
        AND um.is_active = 1
        AND COALESCE(m.is_active, 1) = 1
      LIMIT 1
    `,
    [safeUnitModelId]
  );

  if (!rows[0]) {
    const error = new Error('The selected Unit Model is not currently available for a processor compatibility request.');
    error.code = 'BWT_CATALOG_REQUEST_CONTEXT_INVALID';
    throw error;
  }

  return safeUnitModelId;
}

async function createProcessorCatalogRequest({
  requestedByUserId,
  unitModelId,
  requestedProcessorType,
  requestedProcessorName,
  requestedProcessorSpeedGhz,
  requesterNote
}) {
  if (!await requestTablesSupported() || !await catalogRequestTablesSupported()) {
    const error = new Error('Catalog requests are not ready. Run the Step 7f database migration first.');
    error.code = 'BWT_CATALOG_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  const safeRequestedProcessorType = normalizeText(requestedProcessorType, 100);
  const safeRequestedProcessorName = normalizeText(requestedProcessorName, 150);
  const safeRequestedProcessorSpeedGhz = normalizeOptionalDecimal(requestedProcessorSpeedGhz);
  const safeRequesterNote = assertRequesterNote(requesterNote);

  if (!safeRequesterUserId || safeRequestedProcessorType.length < 2 || safeRequestedProcessorName.length < 2 || safeRequestedProcessorSpeedGhz === null || safeRequestedProcessorSpeedGhz < 0.01) {
    const error = new Error('Enter the observed Processor Type, exact Processor value, and Processor Speed before submitting this request.');
    error.code = 'BWT_CATALOG_REQUEST_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const safeUnitModelId = await assertActiveUnitModel(connection, unitModelId);

    const [pendingRows] = await connection.query(
      `
        SELECT ur.unit_request_id
        FROM unit_requests ur
        INNER JOIN unit_processor_catalog_requests upcr
          ON upcr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = ?
          AND ur.status = 'pending'
          AND ur.requested_by_user_id = ?
          AND upcr.unit_model_id = ?
          AND LOWER(TRIM(upcr.requested_processor_type)) = LOWER(TRIM(?))
          AND LOWER(TRIM(upcr.requested_processor_name)) = LOWER(TRIM(?))
        LIMIT 1
        FOR UPDATE
      `,
      [PROCESSOR_CATALOG_REQUEST_TYPE, safeRequesterUserId, safeUnitModelId, safeRequestedProcessorType, safeRequestedProcessorName]
    );

    if (pendingRows[0]) {
      const error = new Error(`Processor Catalog request #${pendingRows[0].unit_request_id} is already pending for this model and processor.`);
      error.code = 'BWT_CATALOG_REQUEST_ALREADY_PENDING';
      error.unitRequestId = Number(pendingRows[0].unit_request_id);
      throw error;
    }

    const unitRequestId = await insertBaseRequest(connection, {
      requestType: PROCESSOR_CATALOG_REQUEST_TYPE,
      requestedByUserId: safeRequesterUserId,
      requesterNote: safeRequesterNote
    });

    await connection.query(
      `
        INSERT INTO unit_processor_catalog_requests (
          unit_request_id,
          unit_model_id,
          requested_processor_type,
          requested_processor_name,
          requested_processor_speed_ghz
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [unitRequestId, safeUnitModelId, safeRequestedProcessorType, safeRequestedProcessorName, safeRequestedProcessorSpeedGhz]
    );

    await recordRequestEvent(connection, {
      unitRequestId,
      eventType: 'submitted',
      performedByUserId: safeRequesterUserId,
      eventNote: safeRequesterNote,
      eventDetails: {
        unitModelId: safeUnitModelId,
        requestedProcessorType: safeRequestedProcessorType,
        requestedProcessorName: safeRequestedProcessorName,
        requestedProcessorSpeedGhz: safeRequestedProcessorSpeedGhz
      }
    });

    await connection.commit();
    return { unitRequestId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function withdrawUnitRequest({ unitRequestId, requestedByUserId, withdrawalNote = '' }) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);

  if (!safeRequestId || !safeRequesterUserId) {
    const error = new Error('The Unit Request could not be verified.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT unit_request_id, requested_by_user_id, status
        FROM unit_requests
        WHERE unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );

    const request = rows[0] || null;
    if (!request || Number(request.requested_by_user_id) !== safeRequesterUserId) {
      const error = new Error('You can withdraw only your own Unit Requests.');
      error.code = 'BWT_UNIT_REQUEST_NOT_OWNER';
      throw error;
    }

    if (request.status !== 'pending') {
      const error = new Error('Only pending Unit Requests can be withdrawn.');
      error.code = 'BWT_UNIT_REQUEST_NOT_PENDING';
      throw error;
    }

    const note = normalizeText(withdrawalNote, 1000) || 'Withdrawn by requester.';
    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'withdrawn', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeRequesterUserId, note, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'withdrawn',
      performedByUserId: safeRequesterUserId,
      eventNote: note
    });

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertRequestedDestinationLotIsAssignable(destinationLotId) {
  const safeDestinationLotId = normalizePositiveInteger(destinationLotId);
  const lots = await lotModel.listLots({ includeHidden: true });
  const lot = lots.find((candidate) => Number(candidate.lot_id) === safeDestinationLotId) || null;
  const activeLots = lots.filter((candidate) => Number(candidate.is_active) === 1);
  const hasActiveChild = activeLots.some((candidate) => Number(candidate.parent_lot_id) === safeDestinationLotId);
  const isAssignable = lot && lot.is_assignable !== null && lot.is_assignable !== undefined
    ? Number(lot.is_assignable) === 1
    : !hasActiveChild;

  if (!lot || Number(lot.is_active) !== 1 || Number(lot.is_closed) === 1 || !isAssignable) {
    const error = new Error('The originally requested destination lot is no longer open, visible, and assignable. Choose a valid lot through a new request instead of changing this request during review.');
    error.code = 'BWT_UNIT_REQUEST_DESTINATION_INVALID';
    throw error;
  }
}

async function approveIntentionalDuplicateRequest({ unitRequestId, reviewedByUserId, reviewerNote = '' }) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeReviewerUserId = normalizePositiveInteger(reviewedByUserId);

  if (!safeRequestId || !safeReviewerUserId) {
    const error = new Error('The Unit Request could not be verified.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  if (!await requestTablesSupported()) {
    const error = new Error('Unit Requests are not ready. Run the Step 7e.3 database migration first.');
    error.code = 'BWT_UNIT_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT
          ur.unit_request_id,
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          udr.matched_unit_id,
          udr.requested_destination_lot_id,
          udr.intake_snapshot_json
        FROM unit_requests ur
        INNER JOIN unit_duplicate_requests udr
          ON udr.unit_request_id = ur.unit_request_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );

    const request = rows[0] || null;
    if (!request || request.request_type !== INTENTIONAL_DUPLICATE_REQUEST_TYPE) {
      const error = new Error('The selected Intentional Duplicate request could not be found.');
      error.code = 'BWT_UNIT_REQUEST_NOT_FOUND';
      throw error;
    }

    if (request.status !== 'pending') {
      return { approved: false, unitRequestId: safeRequestId, createdUnitId: null };
    }

    if (Number(request.requested_by_user_id) === safeReviewerUserId) {
      const error = new Error('A requester cannot approve their own Unit Request.');
      error.code = 'BWT_UNIT_REQUEST_SELF_REVIEW';
      throw error;
    }

    const intakeSnapshot = parseJsonValue(request.intake_snapshot_json, {});
    const formData = normalizeFormDataSnapshot(intakeSnapshot);
    if (!formData) {
      const error = new Error('The saved intake snapshot is incomplete. Reject this request and have the Tech submit a new one.');
      error.code = 'BWT_UNIT_REQUEST_SNAPSHOT_INVALID';
      throw error;
    }

    await assertRequestedDestinationLotIsAssignable(request.requested_destination_lot_id);
    const creationFormData = {
      ...formData,
      lotId: String(request.requested_destination_lot_id)
    };
    const destinationValidation = await unitLotDestinationValidationModel.assertSubmittedUnitDestination({
      formData: creationFormData,
      destinationLotId: request.requested_destination_lot_id
    });

    const creation = await techUnitModel.createIntentionalDuplicateTechUnitWithConnection(
      connection,
      creationFormData,
      Number(request.requested_by_user_id)
    );

    await unitIssueEntryModel.saveIssueDetailsForUnitWithConnection(connection, {
      unitId: creation.unitId,
      formData: creationFormData,
      currentUserId: Number(request.requested_by_user_id)
    });

    await unitExpandedFormModel.saveExpandedDetailsForUnitWithConnection(connection, {
      unitId: creation.unitId,
      formData: creationFormData,
      currentUserId: Number(request.requested_by_user_id)
    });

    await connection.query(
      'UPDATE unit_duplicate_requests SET created_unit_id = ? WHERE unit_request_id = ? LIMIT 1',
      [creation.unitId, safeRequestId]
    );

    const validationWarningNote = destinationValidation.warningMessages.length > 0
      ? destinationValidation.warningMessages.join(' ')
      : '';
    const note = [
      normalizeText(reviewerNote, 1000),
      validationWarningNote
    ].filter(Boolean).join('\n') || null;
    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeReviewerUserId, note, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'approved',
      performedByUserId: safeReviewerUserId,
      eventNote: note,
      eventDetails: {
        createdUnitId: creation.unitId,
        createdAssetTag: techUnitModel.getDisplayAssetTag(creation.assetNumber)
      }
    });

    await connection.commit();
    return {
      approved: true,
      unitRequestId: safeRequestId,
      createdUnitId: creation.unitId,
      createdAssetTag: techUnitModel.getDisplayAssetTag(creation.assetNumber),
      resultLabel: techUnitModel.getDisplayAssetTag(creation.assetNumber)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveModelCatalogRequest({ unitRequestId, reviewedByUserId, reviewerNote = '', approvedModelName, reviewerIsAdmin = false }) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeReviewerUserId = normalizePositiveInteger(reviewedByUserId);
  const safeApprovedModelName = normalizeText(approvedModelName, 150);

  if (!safeRequestId || !safeReviewerUserId || safeApprovedModelName.length < 2) {
    const error = new Error('Enter a canonical Unit Model name before approving this request.');
    error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
    throw error;
  }

  if (!reviewerIsAdmin) {
    const error = new Error('Only Admin can approve Model Catalog requests.');
    error.code = 'BWT_CATALOG_ADMIN_REQUIRED';
    throw error;
  }

  if (!await catalogRequestTablesSupported()) {
    const error = new Error('Catalog requests are not ready. Run the Step 7f database migration first.');
    error.code = 'BWT_CATALOG_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT
          ur.unit_request_id,
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          umcr.manufacturer_id,
          umcr.unit_category_config_value_id
        FROM unit_requests ur
        INNER JOIN unit_model_catalog_requests umcr
          ON umcr.unit_request_id = ur.unit_request_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );

    const request = rows[0] || null;
    if (!request || request.request_type !== MODEL_CATALOG_REQUEST_TYPE) {
      const error = new Error('The selected Model Catalog request could not be found.');
      error.code = 'BWT_UNIT_REQUEST_NOT_FOUND';
      throw error;
    }

    if (request.status !== 'pending') return { approved: false, unitRequestId: safeRequestId };

    const isSelfReview = Number(request.requested_by_user_id) === safeReviewerUserId;

    const context = await assertActiveModelRequestContext(connection, request.manufacturer_id, request.unit_category_config_value_id);
    const [existingRows] = await connection.query(
      `
        SELECT unit_model_id, is_active
        FROM unit_models
        WHERE manufacturer_id = ?
          AND unit_category_config_value_id = ?
          AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
        ORDER BY unit_model_id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [context.manufacturerId, context.unitCategoryConfigValueId, safeApprovedModelName]
    );

    const existingModel = existingRows[0] || null;
    let approvedUnitModelId;
    let actionLabel;

    if (existingModel) {
      approvedUnitModelId = Number(existingModel.unit_model_id);
      await connection.query('UPDATE unit_models SET is_active = 1 WHERE unit_model_id = ? LIMIT 1', [approvedUnitModelId]);
      actionLabel = Number(existingModel.is_active) === 1 ? 'Existing model mapped' : 'Inactive model reactivated';
    } else {
      const [insertResult] = await connection.query(
        `
          INSERT INTO unit_models (
            manufacturer_id,
            unit_category_config_value_id,
            model_name,
            sort_order,
            is_active
          ) VALUES (?, ?, ?, 0, 1)
        `,
        [context.manufacturerId, context.unitCategoryConfigValueId, safeApprovedModelName]
      );
      approvedUnitModelId = Number(insertResult.insertId);
      actionLabel = 'New model added';
    }

    const note = normalizeText(reviewerNote, 1000) || null;
    await connection.query(
      `
        UPDATE unit_model_catalog_requests
        SET approved_model_name = ?, approved_unit_model_id = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeApprovedModelName, approvedUnitModelId, safeRequestId]
    );

    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeReviewerUserId, note, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'approved',
      performedByUserId: safeReviewerUserId,
      eventNote: note,
      eventDetails: {
        approvedUnitModelId,
        approvedModelName: safeApprovedModelName,
        selfReviewedByAdmin: isSelfReview,
        reviewAuthority: 'admin',
        action: actionLabel
      }
    });

    await connection.commit();
    return {
      approved: true,
      unitRequestId: safeRequestId,
      resultLabel: safeApprovedModelName,
      catalogAction: actionLabel
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeProcessorBrandCode(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 65);

  return normalized || 'processor-type';
}

async function assertActiveProcessorBrand(connection, processorBrandId) {
  const safeBrandId = normalizePositiveInteger(processorBrandId);
  if (!safeBrandId) {
    const error = new Error('Select an existing canonical Processor Type or enter a new Processor Type name.');
    error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
    throw error;
  }

  const [rows] = await connection.query(
    'SELECT processor_brand_id, name FROM processor_brands WHERE processor_brand_id = ? AND is_active = 1 LIMIT 1',
    [safeBrandId]
  );

  if (!rows[0]) {
    const error = new Error('The selected canonical Processor Type is not active.');
    error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
    throw error;
  }

  return { id: Number(rows[0].processor_brand_id), name: rows[0].name, action: 'Existing processor type selected' };
}

async function resolveProcessorBrandForApproval(connection, { processorBrandId, processorBrandName }) {
  const safeBrandId = normalizePositiveInteger(processorBrandId);
  if (safeBrandId) return assertActiveProcessorBrand(connection, safeBrandId);

  const safeBrandName = normalizeText(processorBrandName, 100);
  if (safeBrandName.length < 2) {
    const error = new Error('Select an existing canonical Processor Type or enter a new Processor Type name.');
    error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
    throw error;
  }

  const [matchingRows] = await connection.query(
    `SELECT processor_brand_id, name, is_active
       FROM processor_brands
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      ORDER BY processor_brand_id ASC
      LIMIT 1
      FOR UPDATE`,
    [safeBrandName]
  );

  if (matchingRows[0]) {
    const processorBrandIdValue = Number(matchingRows[0].processor_brand_id);
    await connection.query(
      'UPDATE processor_brands SET is_active = 1 WHERE processor_brand_id = ? LIMIT 1',
      [processorBrandIdValue]
    );
    return {
      id: processorBrandIdValue,
      name: matchingRows[0].name,
      action: Number(matchingRows[0].is_active) === 1 ? 'Existing processor type reused' : 'Inactive processor type reactivated'
    };
  }

  const baseCode = normalizeProcessorBrandCode(safeBrandName);
  let candidateCode = baseCode;
  let suffix = 2;

  while (true) {
    const [codeRows] = await connection.query(
      'SELECT processor_brand_id FROM processor_brands WHERE code = ? LIMIT 1 FOR UPDATE',
      [candidateCode]
    );
    if (!codeRows[0]) break;
    const suffixText = `-${suffix}`;
    candidateCode = `${baseCode.slice(0, Math.max(1, 75 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  const [insertResult] = await connection.query(
    'INSERT INTO processor_brands (code, name, is_active) VALUES (?, ?, 1)',
    [candidateCode, safeBrandName]
  );

  return {
    id: Number(insertResult.insertId),
    name: safeBrandName,
    action: 'New processor type added'
  };
}

async function approveProcessorCatalogRequest({
  unitRequestId,
  reviewedByUserId,
  reviewerNote = '',
  approvedExistingProcessorModelId = null,
  approvedProcessorBrandId,
  approvedProcessorBrandName = '',
  approvedProcessorModelCode,
  approvedProcessorFamily = '',
  approvedProcessorGeneration = '',
  approvedProcessorBaseSpeedGhz = '',
  reviewerIsAdmin = false,
  connection: providedConnection = null
}) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeReviewerUserId = normalizePositiveInteger(reviewedByUserId);
  const safeExistingProcessorModelId = normalizePositiveInteger(approvedExistingProcessorModelId);
  const requestedModelCode = normalizeText(approvedProcessorModelCode, 150);
  const safeFamily = normalizeText(approvedProcessorFamily, 100);
  const safeGeneration = normalizeText(approvedProcessorGeneration, 80);
  const requestedBrandName = normalizeText(approvedProcessorBrandName, 100);

  if (!safeRequestId || !safeReviewerUserId || (!safeExistingProcessorModelId && (requestedModelCode.length < 2 || (!normalizePositiveInteger(approvedProcessorBrandId) && requestedBrandName.length < 2)))) {
    const error = new Error('Choose an existing Processor or complete the canonical Processor Type and Processor values before approving this request.');
    error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
    throw error;
  }

  if (!reviewerIsAdmin) {
    const error = new Error('Only Admin can approve Processor Catalog requests.');
    error.code = 'BWT_CATALOG_ADMIN_REQUIRED';
    throw error;
  }

  const queryTarget = providedConnection || pool;
  if (!await catalogRequestTablesSupported(queryTarget)) {
    const error = new Error('Catalog requests are not ready. Run the Step 7f database migration first.');
    error.code = 'BWT_CATALOG_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const connection = providedConnection || await pool.getConnection();
  const ownsConnection = !providedConnection;

  try {
    if (ownsConnection) await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT
          ur.unit_request_id,
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          upcr.unit_model_id,
          upcr.requested_processor_speed_ghz
        FROM unit_requests ur
        INNER JOIN unit_processor_catalog_requests upcr
          ON upcr.unit_request_id = ur.unit_request_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );

    const request = rows[0] || null;
    if (!request || request.request_type !== PROCESSOR_CATALOG_REQUEST_TYPE) {
      const error = new Error('The selected Processor Catalog request could not be found.');
      error.code = 'BWT_UNIT_REQUEST_NOT_FOUND';
      throw error;
    }

    if (request.status !== 'pending') {
      if (ownsConnection) await connection.rollback();
      return { approved: false, unitRequestId: safeRequestId };
    }

    const isSelfReview = Number(request.requested_by_user_id) === safeReviewerUserId;

    const safeUnitModelId = await assertActiveUnitModel(connection, request.unit_model_id);
    let processorBrand;
    let approvedProcessorModelId;
    let canonicalModelCode;
    let safeBaseSpeed;
    let actionLabel;

    if (safeExistingProcessorModelId) {
      const [existingRows] = await connection.query(
        `
          SELECT
            pm.processor_model_id,
            pm.processor_brand_id,
            pm.model_code,
            pm.base_speed_ghz,
            pm.is_active,
            pb.name AS brand_name,
            pb.is_active AS brand_is_active
          FROM processor_models pm
          INNER JOIN processor_brands pb
            ON pb.processor_brand_id = pm.processor_brand_id
          WHERE pm.processor_model_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [safeExistingProcessorModelId]
      );
      const existingProcessor = existingRows[0] || null;
      if (!existingProcessor || Number(existingProcessor.is_active) !== 1 || Number(existingProcessor.brand_is_active) !== 1) {
        const error = new Error('The selected existing Processor is no longer active. Choose another existing Processor or approve canonical values instead.');
        error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
        throw error;
      }

      approvedProcessorModelId = Number(existingProcessor.processor_model_id);
      canonicalModelCode = existingProcessor.model_code;
      safeBaseSpeed = normalizeOptionalDecimal(existingProcessor.base_speed_ghz);
      processorBrand = {
        id: Number(existingProcessor.processor_brand_id),
        name: existingProcessor.brand_name,
        action: 'Existing processor type reused'
      };
      actionLabel = 'Existing processor mapped';
    } else {
      processorBrand = await resolveProcessorBrandForApproval(connection, {
        processorBrandId: approvedProcessorBrandId,
        processorBrandName: requestedBrandName
      });
      const submittedSpeed = normalizeOptionalDecimal(request.requested_processor_speed_ghz);
      const reviewerSpeed = normalizeOptionalDecimal(approvedProcessorBaseSpeedGhz);
      safeBaseSpeed = reviewerSpeed !== null ? reviewerSpeed : submittedSpeed;

      if (safeBaseSpeed === null || safeBaseSpeed < 0.01 || safeBaseSpeed > 99.99) {
        const error = new Error('Confirm a Processor Base Speed from 0.01 through 99.99 GHz before approving a new canonical Processor.');
        error.code = 'BWT_CATALOG_REQUEST_APPROVAL_INPUT_REQUIRED';
        throw error;
      }

      canonicalModelCode = requestedModelCode;
      const canonicalNameErrors = processorCatalogModel.getCanonicalProcessorNameErrors({
        brandName: processorBrand.name,
        modelCode: canonicalModelCode
      });
      if (canonicalNameErrors.length > 0) {
        const error = new Error(canonicalNameErrors.join(' '));
        error.code = 'BWT_CATALOG_PROCESSOR_CANONICAL_FORMAT';
        throw error;
      }

      const likelyMatches = await processorCatalogModel.findLikelyProcessorMatches({
        processorBrandId: processorBrand.id,
        brandName: processorBrand.name,
        modelCode: canonicalModelCode,
        includeInactive: true,
        limit: 8
      }, connection);
      const duplicateMatch = likelyMatches.find((processor) => processor.identityMatch) || null;
      if (duplicateMatch) {
        const state = duplicateMatch.isActive ? 'active' : 'inactive';
        const error = new Error(`${duplicateMatch.displayLabel} already exists globally as Processor #${duplicateMatch.id} (${state}). Use that canonical Processor and associate it with this Unit Model instead of creating another processor record.`);
        error.code = 'BWT_CATALOG_PROCESSOR_DUPLICATE';
        error.processorModelId = duplicateMatch.id;
        throw error;
      }

      // Re-check the exact canonical name under row-level locking to protect against
      // two reviewers creating the same Processor at nearly the same time.
      const [processorRows] = await connection.query(
        `
          SELECT processor_model_id, is_active
          FROM processor_models
          WHERE processor_brand_id = ?
            AND LOWER(TRIM(model_code)) = LOWER(TRIM(?))
          ORDER BY processor_model_id ASC
          LIMIT 1
          FOR UPDATE
        `,
        [processorBrand.id, canonicalModelCode]
      );
      if (processorRows[0]) {
        const error = new Error(`Processor #${Number(processorRows[0].processor_model_id)} already exists with this canonical Processor Type and Processor name. Select the existing Processor instead.`);
        error.code = 'BWT_CATALOG_PROCESSOR_DUPLICATE';
        error.processorModelId = Number(processorRows[0].processor_model_id);
        throw error;
      }

      const [insertResult] = await connection.query(
        `
          INSERT INTO processor_models (
            processor_brand_id,
            processor_family,
            model_code,
            base_speed_ghz,
            generation,
            is_active
          ) VALUES (?, ?, ?, ?, ?, 1)
        `,
        [processorBrand.id, safeFamily || null, canonicalModelCode, safeBaseSpeed, safeGeneration || null]
      );
      approvedProcessorModelId = Number(insertResult.insertId);
      actionLabel = 'New processor added and mapped';
    }

    const assignedProcessorFamilies = await processorFamilyModel.autoAssignProcessorFamilyMembershipWithConnection(connection, {
      processorModelId: approvedProcessorModelId,
      processorBrandName: processorBrand.name,
      modelCode: canonicalModelCode,
      currentUserId: safeReviewerUserId
    });

    await connection.query(
      `
        INSERT INTO unit_model_processor_options (
          unit_model_id,
          processor_model_id,
          is_active
        ) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE is_active = 1
      `,
      [safeUnitModelId, approvedProcessorModelId]
    );

    const note = normalizeText(reviewerNote, 1000) || null;
    await connection.query(
      `
        UPDATE unit_processor_catalog_requests
        SET approved_processor_brand_id = ?, approved_processor_model_id = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [processorBrand.id, approvedProcessorModelId, safeRequestId]
    );

    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeReviewerUserId, note, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'approved',
      performedByUserId: safeReviewerUserId,
      eventNote: note,
      eventDetails: {
        unitModelId: safeUnitModelId,
        approvedProcessorBrandId: processorBrand.id,
        approvedProcessorBrandName: processorBrand.name,
        approvedProcessorModelId,
        approvedProcessorModelCode: canonicalModelCode,
        approvedProcessorBaseSpeedGhz: safeBaseSpeed,
        reusedExistingProcessor: Boolean(safeExistingProcessorModelId),
        selfReviewedByAdmin: isSelfReview,
        reviewAuthority: 'admin',
        processorBrandAction: processorBrand.action,
        assignedProcessorFamilyCodes: assignedProcessorFamilies.map((family) => family.code),
        action: actionLabel
      }
    });

    if (ownsConnection) await connection.commit();
    return {
      approved: true,
      unitRequestId: safeRequestId,
      resultLabel: `${processorBrand.name} ${canonicalModelCode}`,
      catalogAction: actionLabel,
      processorBrandAction: processorBrand.action,
      approvedProcessorBrandId: processorBrand.id,
      approvedProcessorModelId,
      approvedProcessorBaseSpeedGhz: safeBaseSpeed,
      unitModelId: safeUnitModelId
    };
  } catch (error) {
    if (ownsConnection) await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}


async function revertQcReviewDirectlyWithRequestGuard({ unitId, qcCheckId, revertedByUserId, reversionReason }) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeQcCheckId = normalizePositiveInteger(qcCheckId);
  const safeRevertedByUserId = normalizePositiveInteger(revertedByUserId);

  if (!safeUnitId || !safeQcCheckId || !safeRevertedByUserId) {
    const error = new Error('The QC decision could not be verified for direct reversion.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  if (!await requestTablesSupported()) {
    const error = new Error('QC reversion request coordination is not ready. Apply the Stage 10W70D migration first.');
    error.code = 'BWT_UNIT_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await unitQcCheckModel.lockQcReviewReversionTargetWithConnection(connection, {
      unitId: safeUnitId,
      qcCheckId: safeQcCheckId
    });

    const [pendingRows] = await connection.query(
      `
        SELECT ur.unit_request_id
        FROM unit_requests ur
        INNER JOIN unit_qc_reversion_requests qrr
          ON qrr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = ?
          AND ur.status = 'pending'
          AND qrr.unit_qc_check_id = ?
        ORDER BY ur.unit_request_id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [QC_REVERSION_REQUEST_TYPE, safeQcCheckId]
    );

    if (pendingRows[0]) {
      const error = new Error(`QC Reversion Request #${pendingRows[0].unit_request_id} is pending for this decision. Review that request instead of bypassing it with a direct reversion.`);
      error.code = 'BWT_QC_REVERSION_PENDING_REQUEST';
      error.unitRequestId = Number(pendingRows[0].unit_request_id);
      throw error;
    }

    const result = await unitQcCheckModel.revertQcReviewWithConnection(connection, {
      unitId: safeUnitId,
      qcCheckId: safeQcCheckId,
      revertedByUserId: safeRevertedByUserId,
      reversionReason
    });

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPendingQcReversionRequestForQcCheck({ qcCheckId, requestedByUserId = null } = {}) {
  const safeQcCheckId = normalizePositiveInteger(qcCheckId);
  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  if (!safeQcCheckId || !await requestTablesSupported()) return null;

  const values = [QC_REVERSION_REQUEST_TYPE, safeQcCheckId];
  const requesterSql = safeRequesterUserId ? 'AND ur.requested_by_user_id = ?' : '';
  if (safeRequesterUserId) values.push(safeRequesterUserId);

  const [rows] = await pool.query(
    `
      SELECT ur.unit_request_id, ur.requested_by_user_id, ur.requester_note, ur.submitted_at
      FROM unit_requests ur
      INNER JOIN unit_qc_reversion_requests qrr
        ON qrr.unit_request_id = ur.unit_request_id
      WHERE ur.request_type = ?
        AND ur.status = 'pending'
        AND qrr.unit_qc_check_id = ?
        ${requesterSql}
      ORDER BY ur.unit_request_id DESC
      LIMIT 1
    `,
    values
  );

  return rows[0] ? {
    unitRequestId: Number(rows[0].unit_request_id),
    requestedByUserId: Number(rows[0].requested_by_user_id),
    requesterNote: String(rows[0].requester_note || ''),
    submittedAt: rows[0].submitted_at || null
  } : null;
}

async function createQcReversionRequest({ unitId, qcCheckId, requestedByUserId, requesterNote }) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeQcCheckId = normalizePositiveInteger(qcCheckId);
  const safeRequesterUserId = normalizePositiveInteger(requestedByUserId);
  const safeRequesterNote = normalizeText(requesterNote, 1000);

  if (!safeUnitId || !safeQcCheckId || !safeRequesterUserId) {
    const error = new Error('The QC reversion request could not be verified.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  if (safeRequesterNote.length < 3) {
    const error = new Error('Enter a reason for requesting QC decision reversion.');
    error.code = 'BWT_UNIT_REQUEST_REASON_REQUIRED';
    throw error;
  }

  if (!await requestTablesSupported()) {
    const error = new Error('QC reversion requests are not ready. Apply the Stage 10W70D migration first.');
    error.code = 'BWT_UNIT_REQUEST_SCHEMA_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const state = await unitQcCheckModel.lockQcReviewReversionTargetWithConnection(connection, {
      unitId: safeUnitId,
      qcCheckId: safeQcCheckId
    });

    if (Number(state.reviewed_by_user_id) !== safeRequesterUserId) {
      const error = new Error('Only the QC user who recorded this current decision can request its reversion.');
      error.code = 'BWT_QC_REVERSION_REQUEST_OWNER_REQUIRED';
      throw error;
    }

    const [pendingRows] = await connection.query(
      `
        SELECT ur.unit_request_id
        FROM unit_requests ur
        INNER JOIN unit_qc_reversion_requests qrr
          ON qrr.unit_request_id = ur.unit_request_id
        WHERE ur.request_type = ?
          AND ur.status = 'pending'
          AND qrr.unit_qc_check_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [QC_REVERSION_REQUEST_TYPE, safeQcCheckId]
    );
    if (pendingRows[0]) {
      const error = new Error(`QC reversion request #${pendingRows[0].unit_request_id} is already pending for this decision.`);
      error.code = 'BWT_UNIT_REQUEST_ALREADY_PENDING';
      error.unitRequestId = Number(pendingRows[0].unit_request_id);
      throw error;
    }

    const unitRequestId = await insertBaseRequest(connection, {
      requestType: QC_REVERSION_REQUEST_TYPE,
      requestedByUserId: safeRequesterUserId,
      requesterNote: safeRequesterNote
    });

    const [snapshotResult] = await connection.query(
      `
        INSERT INTO unit_qc_reversion_requests (
          unit_request_id,
          unit_id,
          unit_work_completion_id,
          unit_qc_check_id,
          decision_code,
          qc_reviewed_by_user_id,
          qc_reviewed_at,
          qc_review_notes
        )
        SELECT
          ?,
          qc.unit_id,
          qc.unit_work_completion_id,
          qc.unit_qc_check_id,
          qc.decision_code,
          qc.reviewed_by_user_id,
          qc.reviewed_at,
          qc.review_notes
        FROM unit_qc_checks qc
        WHERE qc.unit_qc_check_id = ?
          AND qc.unit_id = ?
        LIMIT 1
      `,
      [unitRequestId, safeQcCheckId, safeUnitId]
    );

    if (Number(snapshotResult.affectedRows || 0) !== 1) {
      const error = new Error('The exact Quality Control decision could not be snapshotted for this request.');
      error.code = 'BWT_QC_REVERSION_REQUEST_SNAPSHOT_FAILED';
      throw error;
    }

    await recordRequestEvent(connection, {
      unitRequestId,
      eventType: 'submitted',
      performedByUserId: safeRequesterUserId,
      eventNote: safeRequesterNote,
      eventDetails: {
        unitId: safeUnitId,
        unitWorkCompletionId: Number(state.unit_work_completion_id),
        qcCheckId: safeQcCheckId,
        decisionCode: String(state.decision_code || '')
      }
    });

    await connection.commit();
    return { unitRequestId, unitId: safeUnitId, qcCheckId: safeQcCheckId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function sameQcReversionRequestTarget(preview, locked) {
  return Number(preview && preview.unit_id) === Number(locked && locked.unit_id)
    && Number(preview && preview.unit_work_completion_id) === Number(locked && locked.unit_work_completion_id)
    && Number(preview && preview.unit_qc_check_id) === Number(locked && locked.unit_qc_check_id)
    && Number(preview && preview.requested_by_user_id) === Number(locked && locked.requested_by_user_id);
}

async function approveQcReversionRequest({ unitRequestId, reviewedByUserId, reviewerNote = '' }) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeReviewerUserId = normalizePositiveInteger(reviewedByUserId);
  const safeReviewerNote = normalizeText(reviewerNote, 1000);

  if (!safeRequestId || !safeReviewerUserId) {
    const error = new Error('The QC reversion request could not be verified.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [previewRows] = await connection.query(
      `
        SELECT
          ur.unit_request_id,
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          ur.requester_note,
          qrr.unit_id,
          qrr.unit_work_completion_id,
          qrr.unit_qc_check_id
        FROM unit_requests ur
        INNER JOIN unit_qc_reversion_requests qrr
          ON qrr.unit_request_id = ur.unit_request_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
      `,
      [safeRequestId]
    );
    const preview = previewRows[0] || null;

    if (!preview || preview.request_type !== QC_REVERSION_REQUEST_TYPE) {
      const error = new Error('The selected QC reversion request could not be found.');
      error.code = 'BWT_UNIT_REQUEST_NOT_FOUND';
      throw error;
    }
    if (preview.status !== 'pending') {
      await connection.rollback();
      return { approved: false, unitRequestId: safeRequestId };
    }

    await unitQcCheckModel.lockQcReviewReversionTargetWithConnection(connection, {
      unitId: preview.unit_id,
      qcCheckId: preview.unit_qc_check_id
    });

    const [lockedRows] = await connection.query(
      `
        SELECT
          ur.unit_request_id,
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          ur.requester_note,
          qrr.unit_id,
          qrr.unit_work_completion_id,
          qrr.unit_qc_check_id,
          qrr.decision_code,
          qrr.qc_reviewed_by_user_id,
          qrr.qc_reviewed_at,
          qrr.qc_review_notes,
          (
            qrr.unit_id = qc.unit_id
            AND qrr.unit_work_completion_id = qc.unit_work_completion_id
            AND qrr.unit_qc_check_id = qc.unit_qc_check_id
            AND qrr.decision_code = qc.decision_code
            AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
            AND qrr.qc_reviewed_at = qc.reviewed_at
            AND qrr.qc_review_notes <=> qc.review_notes
          ) AS snapshot_matches_qc
        FROM unit_requests ur
        INNER JOIN unit_qc_reversion_requests qrr
          ON qrr.unit_request_id = ur.unit_request_id
        INNER JOIN unit_qc_checks qc
          ON qc.unit_qc_check_id = qrr.unit_qc_check_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );
    const request = lockedRows[0] || null;

    if (!request || request.status !== 'pending') {
      await connection.rollback();
      return { approved: false, unitRequestId: safeRequestId };
    }
    if (request.request_type !== QC_REVERSION_REQUEST_TYPE || !sameQcReversionRequestTarget(preview, request)) {
      const error = new Error('The QC reversion request changed before it could be reviewed.');
      error.code = 'BWT_QC_REVERSION_REQUEST_STALE';
      throw error;
    }
    if (Number(request.snapshot_matches_qc) !== 1) {
      const error = new Error('The saved QC reversion request snapshot no longer matches the exact Quality Control decision.');
      error.code = 'BWT_QC_REVERSION_REQUEST_SNAPSHOT_MISMATCH';
      throw error;
    }
    if (Number(request.requested_by_user_id) === safeReviewerUserId) {
      const error = new Error('A requester cannot approve their own QC reversion request.');
      error.code = 'BWT_UNIT_REQUEST_SELF_REVIEW';
      throw error;
    }

    await unitQcCheckModel.revertQcReviewWithConnection(connection, {
      unitId: request.unit_id,
      qcCheckId: request.unit_qc_check_id,
      revertedByUserId: safeReviewerUserId,
      reversionReason: request.requester_note,
      unitRequestId: safeRequestId
    });

    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
          AND status = 'pending'
        LIMIT 1
      `,
      [safeReviewerUserId, safeReviewerNote || null, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'approved',
      performedByUserId: safeReviewerUserId,
      eventNote: safeReviewerNote || null,
      eventDetails: {
        unitId: Number(request.unit_id),
        unitWorkCompletionId: Number(request.unit_work_completion_id),
        qcCheckId: Number(request.unit_qc_check_id),
        resultingQcState: 'awaiting_qc'
      }
    });

    await connection.commit();
    return { approved: true, unitRequestId: safeRequestId, unitId: Number(request.unit_id), qcCheckId: Number(request.unit_qc_check_id) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectUnitRequest({ unitRequestId, reviewedByUserId, reviewerNote, catalogReviewAuthorized = false }) {
  const safeRequestId = normalizePositiveInteger(unitRequestId);
  const safeReviewerUserId = normalizePositiveInteger(reviewedByUserId);
  const safeReviewerNote = normalizeText(reviewerNote, 1000);

  if (!safeRequestId || !safeReviewerUserId) {
    const error = new Error('The Unit Request could not be verified.');
    error.code = 'BWT_UNIT_REQUEST_INPUT_INVALID';
    throw error;
  }

  if (safeReviewerNote.length < 3) {
    const error = new Error('A rejection note is required.');
    error.code = 'BWT_UNIT_REQUEST_REJECTION_NOTE_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `
        SELECT
          ur.request_type,
          ur.status,
          ur.requested_by_user_id,
          ur.requester_note,
          qrr.unit_id AS qc_reversion_unit_id,
          qrr.unit_work_completion_id AS qc_reversion_completion_id,
          qrr.unit_qc_check_id AS qc_reversion_qc_check_id,
          qrr.decision_code AS qc_reversion_decision_code,
          CONCAT_WS(' ', requester.first_name, requester.last_name) AS requester_name
        FROM unit_requests ur
        LEFT JOIN unit_qc_reversion_requests qrr
          ON qrr.unit_request_id = ur.unit_request_id
        LEFT JOIN users requester
          ON requester.user_id = ur.requested_by_user_id
        WHERE ur.unit_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeRequestId]
    );

    const request = rows[0] || null;
    if (!request) {
      const error = new Error('The selected Unit Request could not be found.');
      error.code = 'BWT_UNIT_REQUEST_NOT_FOUND';
      throw error;
    }

    if (request.status !== 'pending') return false;

    if (CATALOG_REQUEST_TYPES.has(request.request_type) && !catalogReviewAuthorized) {
      const error = new Error('Only Admin can reject Model and Processor Catalog requests.');
      error.code = 'BWT_CATALOG_ADMIN_REQUIRED';
      throw error;
    }

    if (request.request_type === QC_REVERSION_REQUEST_TYPE && Number(request.requested_by_user_id) === safeReviewerUserId) {
      const error = new Error('A requester cannot reject their own QC reversion request.');
      error.code = 'BWT_UNIT_REQUEST_SELF_REVIEW';
      throw error;
    }

    await connection.query(
      `
        UPDATE unit_requests
        SET status = 'rejected', reviewed_by_user_id = ?, reviewed_at = NOW(), reviewer_note = ?
        WHERE unit_request_id = ?
        LIMIT 1
      `,
      [safeReviewerUserId, safeReviewerNote, safeRequestId]
    );

    await recordRequestEvent(connection, {
      unitRequestId: safeRequestId,
      eventType: 'rejected',
      performedByUserId: safeReviewerUserId,
      eventNote: safeReviewerNote
    });

    if (request.request_type === QC_REVERSION_REQUEST_TYPE) {
      const unitId = normalizePositiveInteger(request.qc_reversion_unit_id);
      const completionId = normalizePositiveInteger(request.qc_reversion_completion_id);
      const qcCheckId = normalizePositiveInteger(request.qc_reversion_qc_check_id);
      const decisionCode = normalizeText(request.qc_reversion_decision_code, 20).toLowerCase();

      if (!unitId || !completionId || !qcCheckId || !['accepted', 'rejected'].includes(decisionCode)) {
        const error = new Error('The QC reversion request linkage could not be audited.');
        error.code = 'BWT_QC_REVERSION_REQUEST_STALE';
        throw error;
      }

      await unitAuditEventModel.insertEventWithConnection(connection, {
        unitId,
        actorUserId: safeReviewerUserId,
        eventType: 'unit_qc_reversion_request_rejected',
        eventSource: 'quality_control_reversion_request',
        eventSummary: 'Rejected QC decision reversion request',
        metadata: {
          unitRequestId: safeRequestId,
          unitWorkCompletionId: completionId,
          qcCheckId,
          decisionCode,
          requestedByUserId: Number(request.requested_by_user_id) || null
        },
        changes: [
          {
            fieldKey: 'qc_reversion_request',
            fieldLabel: 'QC Reversion Request',
            changeType: 'rejected',
            oldValueText: 'Pending',
            newValueText: 'Rejected',
            sortOrder: 10
          },
          {
            fieldKey: 'qc_decision',
            fieldLabel: 'Quality Control Decision Retained',
            changeType: 'recorded',
            oldValueText: null,
            newValueText: decisionCode === 'accepted' ? 'Accepted' : 'Rejected',
            sortOrder: 20
          },
          {
            fieldKey: 'qc_reversion_requested_by',
            fieldLabel: 'Requested By',
            changeType: 'recorded',
            oldValueText: null,
            newValueText: normalizeText(request.requester_name, 255) || `User #${Number(request.requested_by_user_id)}`,
            sortOrder: 30
          },
          {
            fieldKey: 'qc_reversion_request_reason',
            fieldLabel: 'Reversion Request Reason',
            changeType: 'recorded',
            oldValueText: null,
            newValueText: normalizeText(request.requester_note, 1000) || 'No reason recorded.',
            sortOrder: 40
          },
          {
            fieldKey: 'qc_reversion_reviewer_note',
            fieldLabel: 'Rejection Note',
            changeType: 'recorded',
            oldValueText: null,
            newValueText: safeReviewerNote,
            sortOrder: 50
          }
        ]
      });
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  INTENTIONAL_DUPLICATE_REQUEST_TYPE,
  MODEL_CATALOG_REQUEST_TYPE,
  PROCESSOR_CATALOG_REQUEST_TYPE,
  QC_REVERSION_REQUEST_TYPE,
  CATALOG_REQUEST_TYPES,
  ARCHIVED_STATUS_FILTER,
  UNIT_REQUEST_ARCHIVE_RETENTION_DAYS,
  VALID_STATUS_FILTERS,
  normalizeStatusFilter,
  normalizeRequestTypeFilter,
  normalizeRequestSearch,
  requestTablesSupported,
  catalogRequestTablesSupported,
  requestArchiveSupported,
  archiveResolvedUnitRequests,
  listUnitRequests,
  listUnitRequestSummaries,
  listActiveProcessorBrands,
  getUnitRequestById,
  createIntentionalDuplicateRequest,
  createModelCatalogRequest,
  createProcessorCatalogRequest,
  revertQcReviewDirectlyWithRequestGuard,
  createQcReversionRequest,
  getPendingQcReversionRequestForQcCheck,
  withdrawUnitRequest,
  approveIntentionalDuplicateRequest,
  approveModelCatalogRequest,
  approveProcessorCatalogRequest,
  approveQcReversionRequest,
  rejectUnitRequest
};
