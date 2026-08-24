const { pool } = require('./db');
const productionWeightSyncModel = require('./productionWeightSyncModel');
const productionCycleModel = require('./productionCycleModel');
const unitWorkflowAudit = require('../services/unitWorkflowAudit');
const { buildLotHierarchyOptions } = require('../services/lotHierarchyPresentation');

const OVERRIDE_TABLE = 'unit_override_requests';
const MANUAL_TECH_OVERRIDE_REQUEST_TYPE = 'manual_tech_override_request';
const OUTCOME_CONFIRMATION_REQUEST_TYPE = 'outcome_confirmation';
const DEFAULT_LIMIT = 100;
const VALID_STATUS_FILTERS = new Set(['pending', 'approved', 'denied', 'cancelled', 'all']);
const OVERRIDE_SCHEMA_CAPABILITY_CACHE_MS = 60000;
let overrideSchemaCapabilityCache = null;

function getAssetTagPrefix() {
  const prefix = String(process.env.ASSET_TAG_PREFIX || 'BWT').trim();

  return prefix ? prefix.toUpperCase() : 'BWT';
}

function getDisplayAssetTag(assetNumber) {
  if (!assetNumber) {
    return '';
  }

  return `${getAssetTagPrefix()}${String(assetNumber)}`;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0].table_count) > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS column_count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0].column_count) > 0;
}

async function overrideTableExists() {
  const now = Date.now();
  if (overrideSchemaCapabilityCache && overrideSchemaCapabilityCache.expiresAt > now) {
    return overrideSchemaCapabilityCache.supported;
  }

  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS column_count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'requested_destination_lot_id'
    `,
    [OVERRIDE_TABLE]
  );
  const supported = Number(rows[0]?.column_count || 0) > 0;
  overrideSchemaCapabilityCache = {
    expiresAt: now + OVERRIDE_SCHEMA_CAPABILITY_CACHE_MS,
    supported
  };
  return supported;
}

function normalizeStatusFilter(statusFilter) {
  const normalized = String(statusFilter || 'pending').trim().toLowerCase();

  return VALID_STATUS_FILTERS.has(normalized) ? normalized : 'pending';
}

function normalizeRequestStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();

  if (!normalized || normalized === 'all') {
    return 'pending';
  }

  return normalized;
}

function normalizeOptionalInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  const normalized = String(value || '').trim();

  return normalized || null;
}

function normalizeCreditWeight(value) {
  const stringValue = String(value || '').trim();

  if (!/^\d{1,2}\.\d{2}$/.test(stringValue)) {
    return null;
  }

  const numericValue = Number(stringValue);

  if (!Number.isFinite(numericValue) || numericValue < 0.10 || numericValue > 10.00) {
    return null;
  }

  return Number(numericValue.toFixed(2));
}

function normalizeJsonValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function parseRequestDetails(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getPersonName(row, prefix) {
  const firstName = row[`${prefix}_first_name`];
  const lastName = row[`${prefix}_last_name`];
  const email = row[`${prefix}_email`];
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || email || 'Unknown user';
}

async function listLotReferenceRows() {
  const [rows] = await pool.query(
    `
      SELECT
        lot_id,
        name AS lot_name,
        parent_lot_id,
        is_active,
        is_closed,
        is_assignable
      FROM lots
      ORDER BY COALESCE(parent_lot_id, 0), name, lot_id
    `
  );

  return rows;
}

async function getLotNameMap() {
  const lots = await listLotReferenceRows();
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot.lot_name || 'Lot name not available');
  });

  return lotMap;
}


async function getAssignableLotOptions() {
  const lots = await listLotReferenceRows();
  const activeLots = lots.filter((lot) => Number(lot.is_active) === 1 && Number(lot.is_closed || 0) !== 1);
  const parentLotIdsWithChildren = new Set(
    activeLots
      .filter((lot) => lot.parent_lot_id)
      .map((lot) => String(lot.parent_lot_id))
  );
  const assignableLotRows = activeLots.filter((lot) => {
    if (lot.is_assignable !== null && lot.is_assignable !== undefined) {
      return Number(lot.is_assignable) === 1;
    }

    return !parentLotIdsWithChildren.has(String(lot.lot_id));
  });
  const assignableLots = assignableLotRows.map((lot) => ({
    lotId: Number(lot.lot_id),
    lotName: lot.lot_name || 'Lot name not available'
  }));

  return {
    lots: assignableLots,
    hierarchyOptions: buildLotHierarchyOptions(lots, assignableLotRows)
  };
}

async function listAssignableLots() {
  const result = await getAssignableLotOptions();
  return result.lots;
}

async function listAssignableLotHierarchyOptions() {
  const result = await getAssignableLotOptions();
  return result.hierarchyOptions;
}

function createOverrideDestinationLotError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getStatusLabel(status) {
  const normalizedStatus = normalizeRequestStatus(status);

  if (normalizedStatus === 'pending') {
    return 'Pending';
  }

  if (normalizedStatus === 'approved') {
    return 'Approved';
  }

  if (normalizedStatus === 'denied') {
    return 'Denied';
  }

  if (normalizedStatus === 'cancelled') {
    return 'Cancelled';
  }

  return status || 'Unknown';
}

function getStatusClass(status) {
  const normalizedStatus = normalizeRequestStatus(status);

  if (normalizedStatus === 'approved') {
    return 'good';
  }

  if (normalizedStatus === 'denied' || normalizedStatus === 'cancelled') {
    return 'bad';
  }

  return 'warn';
}

function getRequestTypeLabel(requestType) {
  if (requestType === MANUAL_TECH_OVERRIDE_REQUEST_TYPE) {
    return 'Manual Tech Request';
  }

  if (requestType === OUTCOME_CONFIRMATION_REQUEST_TYPE) {
    return 'Pass/Fail Confirmation';
  }

  if (requestType === 'lot_requirement_override') {
    return 'Requirement Override';
  }

  return requestType || 'Override Request';
}

function getValidationLabel(status) {
  if (status === 'accepted') {
    return 'Accepted';
  }

  if (status === 'rejected') {
    return 'Rejected';
  }

  if (status === 'needs_review') {
    return 'Needs Review';
  }

  if (status === 'open') {
    return 'Open';
  }

  if (status === 'not_checked') {
    return 'Not validated yet';
  }

  return status || 'Not captured yet';
}

function getDecisionLabel(decision) {
  if (decision === 'allowed') {
    return 'Allowed';
  }

  if (decision === 'allowed_open') {
    return 'Allowed - Open Lot';
  }

  if (decision === 'blocked') {
    return 'Blocked';
  }

  if (decision === 'review') {
    return 'Needs Review';
  }

  if (decision === 'manual_request') {
    return 'Awaiting Tech Lead+ Review';
  }

  return decision || 'Not captured yet';
}

function mapOverrideRequest(row, lotMap = new Map()) {
  const normalizedRequestStatus = normalizeRequestStatus(row.request_status);
  const unitAssetTag = row.asset_number
    ? getDisplayAssetTag(row.asset_number)
    : null;
  const requestDetails = parseRequestDetails(row.request_details);
  const isOutcomeConfirmationRequest = row.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
  const unitOutcomeId = normalizeOptionalInteger(row.unit_outcome_id || requestDetails.unit_outcome_id);
  const outcomeConfirmationOutcomeCode = isOutcomeConfirmationRequest
    ? String(row.linked_outcome_code || requestDetails.outcome_code || '').trim().toLowerCase()
    : '';
  const outcomeConfirmationOutcomeLabel = outcomeConfirmationOutcomeCode === 'pass'
    ? 'Pass'
    : outcomeConfirmationOutcomeCode === 'fail'
      ? 'Fail'
      : '';
  const requesterNote = isOutcomeConfirmationRequest
    ? String(requestDetails.request_notes || '').trim()
    : String(row.reason || '').trim();
  const requestedDestinationLotId = normalizeOptionalInteger(
    row.requested_destination_lot_id || requestDetails.requested_destination_lot_id
  );
  const isDuplicateIntakeMoveRequest = requestDetails.source === 'duplicate_intake_existing_unit_request';
  const isParkedTakeoverRequest = requestDetails.source === 'tech_units_parked_takeover_request'
    || (requestDetails.source_unit_state === 'parked' && requestDetails.action_kind === 'takeover');
  const duplicateIntakeActionKind = isDuplicateIntakeMoveRequest && requestDetails.action_kind === 'move'
    ? 'move'
    : isDuplicateIntakeMoveRequest
      ? 'takeover'
      : '';

  return {
    unitOverrideRequestId: Number(row.unit_override_request_id),
    unitId: row.unit_id ? Number(row.unit_id) : null,
    unitOutcomeId,
    outcomeConfirmationOutcomeCode,
    outcomeConfirmationOutcomeLabel,
    outcomeConfirmationTargetStatusCode: isOutcomeConfirmationRequest ? String(row.linked_outcome_status_code || '').trim().toLowerCase() : '',
    outcomeConfirmationTargetIsCurrent: isOutcomeConfirmationRequest ? Number(row.linked_outcome_is_current || 0) === 1 : false,
    lotId: row.lot_id ? Number(row.lot_id) : null,
    lotName: isParkedTakeoverRequest
      ? 'Parked · No active lot'
      : row.lot_id
        ? row.current_lot_name || lotMap.get(Number(row.lot_id)) || 'Lot name not available'
        : 'No lot selected',
    requestedDestinationLotId,
    requestedDestinationLotName: requestedDestinationLotId
      ? row.requested_destination_lot_name || lotMap.get(requestedDestinationLotId) || 'Lot name not available'
      : 'No destination selected',
    unitAssetTag,
    unitLabel: unitAssetTag || 'No asset tag',
    requestType: row.request_type || 'lot_requirement_override',
    requestTypeLabel: isParkedTakeoverRequest ? 'Parked Unit Takeover' : getRequestTypeLabel(row.request_type),
    requestStatus: normalizedRequestStatus,
    validationStatus: row.validation_status || null,
    enforcementDecision: row.enforcement_decision || null,
    reason: row.reason || '',
    requesterNote,
    requestDetails,
    isDuplicateIntakeMoveRequest,
    isParkedTakeoverRequest,
    isDuplicateIntakeLotMoveRequest: isDuplicateIntakeMoveRequest && duplicateIntakeActionKind === 'move',
    duplicateIntakeActionKind,
    duplicateIntakeRequestLabel: duplicateIntakeActionKind === 'move' ? 'Lot Move' : 'Move / Takeover Existing Unit',
    hasRecordedWork: Number(row.has_recorded_work || 0) === 1,
    reviewNotes: row.review_notes || '',
    requestedByUserId: row.requested_by_user_id ? Number(row.requested_by_user_id) : null,
    requestedByName: getPersonName(row, 'requested_by'),
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedByName: row.reviewed_by_user_id ? getPersonName(row, 'reviewed_by') : null,
    priorTechCreditGranted: Number(row.prior_tech_credit_granted || 0) === 1,
    priorTechCreditWeight: row.prior_tech_credit_weight !== null && row.prior_tech_credit_weight !== undefined ? Number(row.prior_tech_credit_weight) : null,
    priorTechCreditUserId: row.prior_tech_credit_user_id ? Number(row.prior_tech_credit_user_id) : null,
    priorTechCreditUserName: row.prior_tech_credit_user_id ? getPersonName(row, 'prior_tech_credit_user') : '',
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPending: normalizedRequestStatus === 'pending',
    statusLabel: getStatusLabel(normalizedRequestStatus),
    statusClass: getStatusClass(normalizedRequestStatus),
    validationLabel: getValidationLabel(row.validation_status),
    decisionLabel: getDecisionLabel(row.enforcement_decision)
  };
}


async function listOverrideRequestSummaries(options = {}) {
  const exists = await overrideTableExists();

  if (!exists) {
    return {
      supported: false,
      message: 'The override request lifecycle migration is not ready. Apply the Stage 7B database migration before using overrides.',
      statusFilter: normalizeStatusFilter(options.statusFilter),
      requests: []
    };
  }

  const statusFilter = normalizeStatusFilter(options.statusFilter);
  const limit = Number.isInteger(Number(options.limit)) && Number(options.limit) > 0
    ? Math.min(Number(options.limit), 250)
    : DEFAULT_LIMIT;
  const where = [];
  const params = [];

  if (statusFilter !== 'all') {
    where.push('r.request_status = ?');
    params.push(statusFilter);
  }

  const requestedByUserId = normalizeOptionalInteger(options.requestedByUserId);
  if (requestedByUserId) {
    where.push('r.requested_by_user_id = ?');
    params.push(requestedByUserId);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderBySql = statusFilter === 'all'
    ? `
      ORDER BY
        CASE r.request_status
          WHEN 'pending' THEN 10
          WHEN 'approved' THEN 20
          WHEN 'denied' THEN 30
          WHEN 'cancelled' THEN 40
          ELSE 999
        END,
        r.created_at DESC,
        r.unit_override_request_id DESC
    `
    : 'ORDER BY r.created_at DESC, r.unit_override_request_id DESC';

  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.unit_outcome_id,
        r.lot_id,
        r.requested_destination_lot_id,
        r.request_type,
        r.request_status,
        r.validation_status,
        r.enforcement_decision,
        r.reason,
        r.review_notes,
        r.requested_by_user_id,
        r.reviewed_at,
        r.created_at,
        r.updated_at,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.source')) ELSE NULL END AS request_detail_source,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.source_unit_state')) ELSE NULL END AS request_detail_source_unit_state,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.action_kind')) ELSE NULL END AS request_detail_action_kind,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.request_notes')) ELSE NULL END AS request_detail_request_notes,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.unit_outcome_id')) ELSE NULL END AS request_detail_unit_outcome_id,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.outcome_code')) ELSE NULL END AS request_detail_outcome_code,
        CASE WHEN JSON_VALID(r.request_details) THEN JSON_UNQUOTE(JSON_EXTRACT(r.request_details, '$.requested_destination_lot_id')) ELSE NULL END AS request_detail_destination_lot_id,
        u.asset_number,
        current_lot.name AS current_lot_name,
        requested_destination_lot.name AS requested_destination_lot_name,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email
      FROM unit_override_requests r
      LEFT JOIN units u
        ON u.unit_id = r.unit_id
      LEFT JOIN lots current_lot
        ON current_lot.lot_id = r.lot_id
      LEFT JOIN lots requested_destination_lot
        ON requested_destination_lot.lot_id = r.requested_destination_lot_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = r.requested_by_user_id
      ${whereSql}
      ${orderBySql}
      LIMIT ?
    `,
    [...params, limit]
  );

  return {
    supported: true,
    message: 'Override requests loaded.',
    statusFilter,
    assignableLots: [],
    requests: rows.map((row) => mapOverrideRequest({
      ...row,
      request_details: {
        source: row.request_detail_source || '',
        source_unit_state: row.request_detail_source_unit_state || '',
        action_kind: row.request_detail_action_kind || '',
        request_notes: row.request_detail_request_notes || '',
        unit_outcome_id: row.request_detail_unit_outcome_id || row.unit_outcome_id || null,
        outcome_code: row.request_detail_outcome_code || '',
        requested_destination_lot_id: row.request_detail_destination_lot_id || null
      }
    }))
  };
}

async function listOverrideRequests(options = {}) {
  const exists = await overrideTableExists();

  if (!exists) {
    return {
      supported: false,
      message: 'The override request lifecycle migration is not ready. Apply the Stage 7B database migration before using overrides.',
      statusFilter: normalizeStatusFilter(options.statusFilter),
      requests: []
    };
  }

  const statusFilter = normalizeStatusFilter(options.statusFilter);
  const limit = Number.isInteger(Number(options.limit)) && Number(options.limit) > 0
    ? Math.min(Number(options.limit), 250)
    : DEFAULT_LIMIT;

  const where = [];
  const params = [];

  if (statusFilter !== 'all') {
    where.push('LOWER(r.request_status) = ?');
    params.push(statusFilter);
  }

  const requestedByUserId = normalizeOptionalInteger(options.requestedByUserId);
  if (requestedByUserId) {
    where.push('r.requested_by_user_id = ?');
    params.push(requestedByUserId);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const includeAssignableLots = options.includeAssignableLots !== false;
  const assignableLotsPromise = includeAssignableLots ? listAssignableLots() : Promise.resolve([]);

  const [[rows], assignableLots] = await Promise.all([
    pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.unit_outcome_id,
        r.lot_id,
        r.requested_destination_lot_id,
        r.request_type,
        r.request_status,
        r.validation_status,
        r.enforcement_decision,
        r.reason,
        r.request_details,
        r.requested_by_user_id,
        r.reviewed_by_user_id,
        r.review_notes,
        r.prior_tech_credit_granted,
        r.prior_tech_credit_weight,
        r.prior_tech_credit_user_id,
        r.reviewed_at,
        r.expires_at,
        r.created_at,
        r.updated_at,
        EXISTS(
          SELECT 1
          FROM unit_work_completions completion_check
          WHERE completion_check.unit_id = r.unit_id
            AND completion_check.reversed_at IS NULL
        ) AS has_recorded_work,
        u.asset_number,
        current_lot.name AS current_lot_name,
        requested_destination_lot.name AS requested_destination_lot_name,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email,
        reviewed_by.first_name AS reviewed_by_first_name,
        reviewed_by.last_name AS reviewed_by_last_name,
        reviewed_by.email AS reviewed_by_email,
        prior_tech_credit_user.first_name AS prior_tech_credit_user_first_name,
        prior_tech_credit_user.last_name AS prior_tech_credit_user_last_name,
        prior_tech_credit_user.email AS prior_tech_credit_user_email
      FROM unit_override_requests r
      LEFT JOIN units u
        ON u.unit_id = r.unit_id
      LEFT JOIN lots current_lot
        ON current_lot.lot_id = r.lot_id
      LEFT JOIN lots requested_destination_lot
        ON requested_destination_lot.lot_id = r.requested_destination_lot_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = r.requested_by_user_id
      LEFT JOIN users reviewed_by
        ON reviewed_by.user_id = r.reviewed_by_user_id
      LEFT JOIN users prior_tech_credit_user
        ON prior_tech_credit_user.user_id = r.prior_tech_credit_user_id
      ${whereSql}
      ORDER BY
        CASE LOWER(r.request_status)
          WHEN 'pending' THEN 10
          WHEN 'approved' THEN 20
          WHEN 'denied' THEN 30
          WHEN 'cancelled' THEN 40
          ELSE 999
        END,
        r.created_at DESC,
        r.unit_override_request_id DESC
      LIMIT ?
    `,
    [...params, limit]
    ),
    assignableLotsPromise
  ]);

  return {
    supported: true,
    message: 'Override requests loaded.',
    statusFilter,
    assignableLots,
    requests: rows.map((row) => mapOverrideRequest(row))
  };
}

async function getLatestOverrideRequestMapForUnits(unitIds) {
  const exists = await overrideTableExists();
  const safeUnitIds = Array.from(
    new Set(
      (unitIds || [])
        .map((unitId) => Number(unitId))
        .filter((unitId) => Number.isInteger(unitId) && unitId > 0)
    )
  );

  if (!exists || safeUnitIds.length === 0) {
    return new Map();
  }

  const placeholders = safeUnitIds.map(() => '?').join(', ');
  const lotMap = await getLotNameMap();

  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          r.unit_override_request_id,
          r.unit_id,
          r.unit_outcome_id,
          r.lot_id,
          r.requested_destination_lot_id,
          r.request_type,
          r.request_status,
          r.validation_status,
          r.enforcement_decision,
          r.reason,
          r.request_details,
          r.requested_by_user_id,
          r.reviewed_by_user_id,
          r.review_notes,
          r.reviewed_at,
          r.expires_at,
          r.created_at,
          r.updated_at,
          u.asset_number,
          requested_by.first_name AS requested_by_first_name,
          requested_by.last_name AS requested_by_last_name,
          requested_by.email AS requested_by_email,
          reviewed_by.first_name AS reviewed_by_first_name,
          reviewed_by.last_name AS reviewed_by_last_name,
          reviewed_by.email AS reviewed_by_email,
          ROW_NUMBER() OVER (
            PARTITION BY r.unit_id
            ORDER BY r.created_at DESC, r.unit_override_request_id DESC
          ) AS row_rank
        FROM unit_override_requests r
        LEFT JOIN units u
          ON u.unit_id = r.unit_id
        LEFT JOIN users requested_by
          ON requested_by.user_id = r.requested_by_user_id
        LEFT JOIN users reviewed_by
          ON reviewed_by.user_id = r.reviewed_by_user_id
        WHERE r.unit_id IN (${placeholders})
          AND r.request_type = ?
      ) ranked_requests
      WHERE row_rank = 1
    `,
    [...safeUnitIds, MANUAL_TECH_OVERRIDE_REQUEST_TYPE]
  );

  const requestMap = new Map();

  rows.forEach((row) => {
    requestMap.set(Number(row.unit_id), mapOverrideRequest(row, lotMap));
  });

  return requestMap;
}

async function listOverrideRequestsForUnit(unitId, limit = 25) {
  const exists = await overrideTableExists();
  const normalizedUnitId = normalizeOptionalInteger(unitId);

  if (!exists || !normalizedUnitId) {
    return {
      supported: exists,
      requests: []
    };
  }

  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 100)
    : 25;

  const lotMap = await getLotNameMap();

  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.unit_outcome_id,
        r.lot_id,
        r.requested_destination_lot_id,
        r.request_type,
        r.request_status,
        r.validation_status,
        r.enforcement_decision,
        r.reason,
        r.request_details,
        r.requested_by_user_id,
        r.reviewed_by_user_id,
        r.review_notes,
        r.prior_tech_credit_granted,
        r.prior_tech_credit_weight,
        r.prior_tech_credit_user_id,
        r.reviewed_at,
        r.expires_at,
        r.created_at,
        r.updated_at,
        u.asset_number,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email,
        reviewed_by.first_name AS reviewed_by_first_name,
        reviewed_by.last_name AS reviewed_by_last_name,
        reviewed_by.email AS reviewed_by_email,
        prior_tech_credit_user.first_name AS prior_tech_credit_user_first_name,
        prior_tech_credit_user.last_name AS prior_tech_credit_user_last_name,
        prior_tech_credit_user.email AS prior_tech_credit_user_email
      FROM unit_override_requests r
      LEFT JOIN units u
        ON u.unit_id = r.unit_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = r.requested_by_user_id
      LEFT JOIN users reviewed_by
        ON reviewed_by.user_id = r.reviewed_by_user_id
      LEFT JOIN users prior_tech_credit_user
        ON prior_tech_credit_user.user_id = r.prior_tech_credit_user_id
      WHERE r.unit_id = ?
      ORDER BY r.created_at DESC, r.unit_override_request_id DESC
      LIMIT ?
    `,
    [normalizedUnitId, safeLimit]
  );

  return {
    supported: true,
    requests: rows.map((row) => mapOverrideRequest(row, lotMap))
  };
}

async function getOverrideRequestById(overrideRequestId) {
  const exists = await overrideTableExists();

  if (!exists) {
    return null;
  }

  const requestId = normalizeOptionalInteger(overrideRequestId);

  if (!requestId) {
    return null;
  }


  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.unit_outcome_id,
        r.lot_id,
        r.requested_destination_lot_id,
        r.request_type,
        r.request_status,
        r.validation_status,
        r.enforcement_decision,
        r.reason,
        r.request_details,
        r.requested_by_user_id,
        r.reviewed_by_user_id,
        r.review_notes,
        r.prior_tech_credit_granted,
        r.prior_tech_credit_weight,
        r.prior_tech_credit_user_id,
        r.reviewed_at,
        r.expires_at,
        r.created_at,
        r.updated_at,
        u.asset_number,
        current_lot.name AS current_lot_name,
        destination_lot.name AS requested_destination_lot_name,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email,
        reviewed_by.first_name AS reviewed_by_first_name,
        reviewed_by.last_name AS reviewed_by_last_name,
        reviewed_by.email AS reviewed_by_email,
        prior_tech_credit_user.first_name AS prior_tech_credit_user_first_name,
        prior_tech_credit_user.last_name AS prior_tech_credit_user_last_name,
        prior_tech_credit_user.email AS prior_tech_credit_user_email,
        linked_outcome.outcome_code AS linked_outcome_code,
        linked_outcome.approval_status_code AS linked_outcome_status_code,
        linked_outcome.is_current AS linked_outcome_is_current
      FROM unit_override_requests r
      LEFT JOIN units u
        ON u.unit_id = r.unit_id
      LEFT JOIN lots current_lot
        ON current_lot.lot_id = r.lot_id
      LEFT JOIN lots destination_lot
        ON destination_lot.lot_id = r.requested_destination_lot_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = r.requested_by_user_id
      LEFT JOIN users reviewed_by
        ON reviewed_by.user_id = r.reviewed_by_user_id
      LEFT JOIN users prior_tech_credit_user
        ON prior_tech_credit_user.user_id = r.prior_tech_credit_user_id
      LEFT JOIN unit_outcomes linked_outcome
        ON linked_outcome.unit_outcome_id = r.unit_outcome_id
      WHERE r.unit_override_request_id = ?
      LIMIT 1
    `,
    [requestId]
  );

  return rows[0] ? mapOverrideRequest(rows[0]) : null;
}

async function getPendingOverrideRequestForUnit({ unitId, requestType = null }) {
  const exists = await overrideTableExists();

  if (!exists) {
    return null;
  }

  const normalizedUnitId = normalizeOptionalInteger(unitId);
  const normalizedRequestType = normalizeText(requestType);

  if (!normalizedUnitId) {
    return null;
  }

  const lotMap = await getLotNameMap();
  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.unit_outcome_id,
        r.lot_id,
        r.requested_destination_lot_id,
        r.request_type,
        r.request_status,
        r.validation_status,
        r.enforcement_decision,
        r.reason,
        r.request_details,
        r.requested_by_user_id,
        r.reviewed_by_user_id,
        r.review_notes,
        r.reviewed_at,
        r.expires_at,
        r.created_at,
        r.updated_at,
        u.asset_number,
        requested_by.first_name AS requested_by_first_name,
        requested_by.last_name AS requested_by_last_name,
        requested_by.email AS requested_by_email,
        reviewed_by.first_name AS reviewed_by_first_name,
        reviewed_by.last_name AS reviewed_by_last_name,
        reviewed_by.email AS reviewed_by_email
      FROM unit_override_requests r
      LEFT JOIN units u
        ON u.unit_id = r.unit_id
      LEFT JOIN users requested_by
        ON requested_by.user_id = r.requested_by_user_id
      LEFT JOIN users reviewed_by
        ON reviewed_by.user_id = r.reviewed_by_user_id
      WHERE r.unit_id = ?
        AND LOWER(r.request_status) = 'pending'
        AND (? IS NULL OR r.request_type = ?)
      ORDER BY r.created_at DESC, r.unit_override_request_id DESC
      LIMIT 1
    `,
    [normalizedUnitId, normalizedRequestType, normalizedRequestType]
  );

  return rows[0] ? mapOverrideRequest(rows[0], lotMap) : null;
}

function getOutcomeConfirmationLabel(outcomeCode) {
  return String(outcomeCode || '').trim().toLowerCase() === 'pass' ? 'Pass' : 'Fail';
}

async function syncOutcomeConfirmationRequestWithConnection(connection, {
  unitId,
  lotId = null,
  requestedByUserId,
  outcomeCode,
  outcomeNotes = null,
  requestNotes = null,
  unitOutcomeId = null,
  approvalRequested = false
}) {
  if (!await tableExists(OVERRIDE_TABLE)) {
    return null;
  }

  const safeUnitId = normalizeOptionalInteger(unitId);
  const safeRequestedByUserId = normalizeOptionalInteger(requestedByUserId);
  const safeLotId = normalizeOptionalInteger(lotId);
  const safeUnitOutcomeId = normalizeOptionalInteger(unitOutcomeId);
  const normalizedOutcomeCode = String(outcomeCode || '').trim().toLowerCase();

  if (!safeUnitId || !safeRequestedByUserId || !['pass', 'fail'].includes(normalizedOutcomeCode)) {
    return null;
  }

  const [pendingRows] = await connection.query(
    `
      SELECT unit_override_request_id, unit_outcome_id
      FROM unit_override_requests
      WHERE unit_id = ?
        AND request_type = ?
        AND LOWER(request_status) = 'pending'
      ORDER BY created_at DESC, unit_override_request_id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [safeUnitId, OUTCOME_CONFIRMATION_REQUEST_TYPE]
  );

  const pendingRequest = pendingRows[0] || null;

  if (!approvalRequested) {
    if (pendingRequest) {
      const withdrawalNote = 'Pass/Fail confirmation request was withdrawn when the outcome was updated without confirmation.';
      const linkedOutcomeId = normalizeOptionalInteger(pendingRequest.unit_outcome_id);

      await connection.query(
        `
          UPDATE unit_override_requests
          SET
            request_status = 'cancelled',
            review_notes = ?,
            reviewed_at = NOW()
          WHERE unit_override_request_id = ?
        `,
        [withdrawalNote, pendingRequest.unit_override_request_id]
      );

      if (linkedOutcomeId) {
        await connection.query(
          `
            UPDATE unit_outcomes
            SET
              approval_status_code = 'not_requested',
              approved_by_user_id = NULL,
              approved_at = NULL,
              approval_notes = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE unit_outcome_id = ?
              AND unit_id = ?
              AND approval_status_code = 'pending'
            LIMIT 1
          `,
          [withdrawalNote, linkedOutcomeId, safeUnitId]
        );
      }
    }

    return null;
  }

  if (!safeUnitOutcomeId) {
    const error = new Error('The Pass/Fail confirmation request could not be linked to the exact outcome decision.');
    error.code = 'BWT_OUTCOME_CONFIRMATION_TARGET_REQUIRED';
    throw error;
  }

  const outcomeLabel = getOutcomeConfirmationLabel(normalizedOutcomeCode);
  const reason = `Second-opinion confirmation requested for the current ${outcomeLabel} decision.`;
  const requestDetails = JSON.stringify({
    source: 'tech_unit_pass_fail_confirmation',
    outcome_code: normalizedOutcomeCode,
    outcome_label: outcomeLabel,
    unit_outcome_id: safeUnitOutcomeId,
    outcome_notes: normalizeText(outcomeNotes),
    request_notes: normalizeText(requestNotes)
  });

  if (pendingRequest) {
    const pendingOutcomeId = normalizeOptionalInteger(pendingRequest.unit_outcome_id);

    if (pendingOutcomeId === safeUnitOutcomeId) {
      return Number(pendingRequest.unit_override_request_id);
    }

    const supersededNote = 'Pass/Fail confirmation request was superseded by a newer Pass/Fail confirmation decision.';
    await connection.query(
      `
        UPDATE unit_override_requests
        SET
          request_status = 'cancelled',
          review_notes = ?,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE unit_override_request_id = ?
          AND LOWER(request_status) = 'pending'
      `,
      [supersededNote, pendingRequest.unit_override_request_id]
    );

    if (pendingOutcomeId) {
      await connection.query(
        `
          UPDATE unit_outcomes
          SET
            approval_status_code = 'not_requested',
            approved_by_user_id = NULL,
            approved_at = NULL,
            approval_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE unit_outcome_id = ?
            AND unit_id = ?
            AND approval_status_code = 'pending'
          LIMIT 1
        `,
        [supersededNote, pendingOutcomeId, safeUnitId]
      );
    }
  }

  const [result] = await connection.query(
    `
      INSERT INTO unit_override_requests (
        unit_id,
        unit_outcome_id,
        lot_id,
        request_type,
        request_status,
        validation_status,
        enforcement_decision,
        reason,
        request_details,
        requested_by_user_id
      )
      VALUES (?, ?, ?, ?, 'pending', 'needs_review', 'review', ?, ?, ?)
    `,
    [
      safeUnitId,
      safeUnitOutcomeId,
      safeLotId,
      OUTCOME_CONFIRMATION_REQUEST_TYPE,
      reason,
      requestDetails,
      safeRequestedByUserId
    ]
  );

  return Number(result.insertId);
}

async function createOverrideRequest({
  unitId,
  lotId,
  requestedDestinationLotId = null,
  requestType = 'lot_requirement_override',
  validationStatus = null,
  enforcementDecision = null,
  reason,
  requestDetails = null,
  requestedByUserId,
  expiresAt = null
}) {
  const exists = await overrideTableExists();

  if (!exists) {
    throw new Error('Cannot create override request because the Stage 7B override lifecycle migration is not ready.');
  }

  const normalizedReason = normalizeText(reason);
  const normalizedUnitId = normalizeOptionalInteger(unitId);
  const normalizedRequestType = normalizeText(requestType) || 'lot_requirement_override';
  const normalizedRequestedByUserId = normalizeOptionalInteger(requestedByUserId);
  const normalizedDestinationLotId = normalizeOptionalInteger(requestedDestinationLotId);

  if (!normalizedReason) {
    throw new Error('Override request reason is required.');
  }

  if (normalizedRequestType !== MANUAL_TECH_OVERRIDE_REQUEST_TYPE) {
    const [result] = await pool.query(
      `
        INSERT INTO unit_override_requests (
          unit_id,
          lot_id,
          requested_destination_lot_id,
          request_type,
          request_status,
          validation_status,
          enforcement_decision,
          reason,
          request_details,
          requested_by_user_id,
          expires_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedUnitId,
        normalizeOptionalInteger(lotId),
        normalizedDestinationLotId,
        normalizedRequestType,
        normalizeText(validationStatus),
        normalizeText(enforcementDecision),
        normalizedReason,
        normalizeJsonValue(requestDetails),
        normalizedRequestedByUserId,
        expiresAt || null
      ]
    );

    return Number(result.insertId);
  }

  if (!normalizedUnitId || !normalizedRequestedByUserId || !normalizedDestinationLotId) {
    const error = new Error('Manual override requests require a Unit, requester, and destination Lot.');
    error.code = 'BWT_OVERRIDE_DESTINATION_LOT_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [unitRows] = await connection.query(
      'SELECT unit_id FROM units WHERE unit_id = ? LIMIT 1 FOR UPDATE',
      [normalizedUnitId]
    );

    if (unitRows.length === 0) {
      const error = new Error('The selected Unit no longer exists.');
      error.code = 'BWT_OVERRIDE_UNIT_NOT_FOUND';
      throw error;
    }

    const [pendingRows] = await connection.query(
      `
        SELECT unit_override_request_id
        FROM unit_override_requests
        WHERE unit_id = ?
          AND request_type = ?
          AND LOWER(request_status) = 'pending'
        ORDER BY created_at DESC, unit_override_request_id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedUnitId, normalizedRequestType]
    );

    if (pendingRows[0]) {
      const error = new Error('A pending override request already exists for this Unit.');
      error.code = 'BWT_OVERRIDE_ALREADY_PENDING';
      error.overrideRequestId = Number(pendingRows[0].unit_override_request_id);
      throw error;
    }

    const [result] = await connection.query(
      `
        INSERT INTO unit_override_requests (
          unit_id,
          lot_id,
          requested_destination_lot_id,
          request_type,
          request_status,
          validation_status,
          enforcement_decision,
          reason,
          request_details,
          requested_by_user_id,
          expires_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedUnitId,
        normalizeOptionalInteger(lotId),
        normalizedDestinationLotId,
        normalizedRequestType,
        normalizeText(validationStatus),
        normalizeText(enforcementDecision),
        normalizedReason,
        normalizeJsonValue(requestDetails),
        normalizedRequestedByUserId,
        expiresAt || null
      ]
    );

    await connection.commit();
    return Number(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function createOutcomeConfirmationTargetError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function lockOutcomeConfirmationTargetRow(connection, request, { requireTarget = true } = {}) {
  const linkedOutcomeId = normalizeOptionalInteger(request && request.unit_outcome_id);
  const requestUnitId = normalizeOptionalInteger(request && request.unit_id);

  if (!linkedOutcomeId) {
    if (!requireTarget) return null;
    throw createOutcomeConfirmationTargetError(
      'BWT_OUTCOME_CONFIRMATION_TARGET_REQUIRED',
      'This Pass/Fail confirmation request is missing its immutable outcome target.'
    );
  }

  const [rows] = await connection.query(
    `
      SELECT
        unit_outcome_id,
        unit_id,
        outcome_code,
        approval_status_code,
        is_current,
        approval_requested_by_user_id
      FROM unit_outcomes
      WHERE unit_outcome_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [linkedOutcomeId]
  );
  const outcome = rows[0] || null;

  if (!outcome || normalizeOptionalInteger(outcome.unit_id) !== requestUnitId) {
    if (!requireTarget) return null;
    throw createOutcomeConfirmationTargetError(
      'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
      'The linked Pass/Fail decision no longer matches this request.'
    );
  }

  return outcome;
}

function assertOutcomeConfirmationTargetReviewable(outcome, request) {
  const requestedByUserId = normalizeOptionalInteger(request && request.requested_by_user_id);
  const exactTargetIsReviewable = outcome
    && Number(outcome.is_current || 0) === 1
    && String(outcome.approval_status_code || '').toLowerCase() === 'pending'
    && normalizeOptionalInteger(outcome.approval_requested_by_user_id) === requestedByUserId;

  if (!exactTargetIsReviewable) {
    throw createOutcomeConfirmationTargetError(
      'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
      'The linked Pass/Fail decision is no longer the current pending confirmation target.'
    );
  }
}

async function lockOutcomeConfirmationTarget(connection, request) {
  const outcome = await lockOutcomeConfirmationTargetRow(connection, request);
  assertOutcomeConfirmationTargetReviewable(outcome, request);
  return outcome;
}

function sameOutcomeConfirmationRequestTarget(firstRequest, secondRequest) {
  return normalizeOptionalInteger(firstRequest && firstRequest.unit_id) === normalizeOptionalInteger(secondRequest && secondRequest.unit_id)
    && normalizeOptionalInteger(firstRequest && firstRequest.unit_outcome_id) === normalizeOptionalInteger(secondRequest && secondRequest.unit_outcome_id)
    && normalizeOptionalInteger(firstRequest && firstRequest.requested_by_user_id) === normalizeOptionalInteger(secondRequest && secondRequest.requested_by_user_id)
    && String(firstRequest && firstRequest.request_type || '') === String(secondRequest && secondRequest.request_type || '');
}

async function approveOverrideRequest({
  overrideRequestId,
  reviewedByUserId,
  reviewNotes,
  priorTechCreditGranted = false,
  priorTechCreditWeight = null,
  destinationLotId = null,
  connection: providedConnection = null
}) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const reviewerId = normalizeOptionalInteger(reviewedByUserId);

  if (!requestId || !reviewerId) {
    return false;
  }

  const ownsConnection = !providedConnection;
  const connection = providedConnection || await pool.getConnection();

  try {
    if (ownsConnection) {
      await connection.beginTransaction();
    }

    const [previewRows] = await connection.query(
      `
        SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id
        FROM unit_override_requests
        WHERE unit_override_request_id = ?
        LIMIT 1
      `,
      [requestId]
    );
    const requestPreview = previewRows[0] || null;

    if (!requestPreview || String(requestPreview.request_status || '').toLowerCase() !== 'pending') {
      if (ownsConnection) {
        await connection.rollback();
      }
      return false;
    }

    const previewIsOutcomeConfirmation = requestPreview.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    const linkedOutcome = previewIsOutcomeConfirmation
      ? await lockOutcomeConfirmationTarget(connection, requestPreview)
      : null;

    const [requestRows] = await connection.query(
      `
        SELECT
          r.unit_override_request_id,
          r.unit_id,
          r.unit_outcome_id,
          r.request_type,
          r.requested_by_user_id,
          r.requested_destination_lot_id,
          r.request_status,
          u.assigned_to_user_id,
          u.created_by_user_id,
          u.lot_id AS current_lot_id,
          GREATEST(COALESCE(u.is_parked, 0), COALESCE(u.is_archived, 0)) AS is_parked
        FROM unit_override_requests r
        LEFT JOIN units u
          ON u.unit_id = r.unit_id
        WHERE r.unit_override_request_id = ?
        FOR UPDATE
      `,
      [requestId]
    );

    const request = requestRows[0];

    if (!request || String(request.request_status || '').toLowerCase() !== 'pending') {
      if (ownsConnection) {
        await connection.rollback();
      }
      return false;
    }

    const isOutcomeConfirmation = request.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    if (previewIsOutcomeConfirmation !== isOutcomeConfirmation
      || (isOutcomeConfirmation && !sameOutcomeConfirmationRequestTarget(requestPreview, request))) {
      throw createOutcomeConfirmationTargetError(
        'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
        'The Pass/Fail confirmation request changed before it could be reviewed.'
      );
    }

    if (Number(request.requested_by_user_id) === reviewerId) {
      const error = new Error('A requester cannot approve their own request.');
      error.code = 'BWT_OVERRIDE_SELF_REVIEW';
      throw error;
    }

    const isManualTechOverride = request.request_type === MANUAL_TECH_OVERRIDE_REQUEST_TYPE;
    const wasParked = Number(request.is_parked || 0) === 1;

    if (wasParked && !isManualTechOverride) {
      const error = new Error('This unit is parked. Return it to Active before approving this request type.');
      error.code = 'BWT_UNIT_PARKED';
      throw error;
    }

    const canGrantPriorTechCredit = !isOutcomeConfirmation && isManualTechOverride && !wasParked;
    const creditGranted = canGrantPriorTechCredit && priorTechCreditGranted === true;
    const creditWeight = creditGranted ? normalizeCreditWeight(priorTechCreditWeight) : null;

    if (creditGranted && creditWeight === null) {
      const error = new Error('Prior Tech credit weight must be a number from 0.10 through 10.00 with two decimal places.');
      error.code = 'BWT_INVALID_PRIOR_TECH_CREDIT_WEIGHT';
      throw error;
    }

    const requestedByUserId = normalizeOptionalInteger(request.requested_by_user_id);
    const previousAssignedUserId = wasParked
      ? null
      : normalizeOptionalInteger(request.assigned_to_user_id) || normalizeOptionalInteger(request.created_by_user_id);
    const currentLotId = normalizeOptionalInteger(request.current_lot_id);
    const completionTableReady = isManualTechOverride && await tableExists('unit_work_completions');
    let hasRecordedWork = false;

    if (isManualTechOverride && request.unit_id && completionTableReady) {
      const [completionRows] = await connection.query(
        `
          SELECT 1
          FROM unit_work_completions
          WHERE unit_id = ?
            AND reversed_at IS NULL
          LIMIT 1
        `,
        [request.unit_id]
      );
      hasRecordedWork = completionRows.length > 0;
    }

    let approvedDestinationLotId = currentLotId;
    let destinationLot = null;

    if (isManualTechOverride) {
      const requestedDestinationLotId = normalizeOptionalInteger(destinationLotId)
        || normalizeOptionalInteger(request.requested_destination_lot_id)
        || currentLotId;

      if (!requestedDestinationLotId) {
        throw createOverrideDestinationLotError(
          'BWT_OVERRIDE_DESTINATION_LOT_REQUIRED',
          'Select an open destination Lot before approving this override request.'
        );
      }

      const assignableLots = await listAssignableLots();
      destinationLot = assignableLots.find((lot) => lot.lotId === requestedDestinationLotId) || null;

      if (!destinationLot) {
        throw createOverrideDestinationLotError(
          'BWT_INVALID_OVERRIDE_DESTINATION_LOT',
          'The requested destination Lot is no longer open and assignable.'
        );
      }

      approvedDestinationLotId = requestedDestinationLotId;
    }

    let destinationValidation = null;

    if (isManualTechOverride && request.unit_id && approvedDestinationLotId) {
      // Lazy-load to avoid a module cycle through Unit expanded-form outcome helpers.
      const unitLotDestinationValidationModel = require('./unitLotDestinationValidationModel');
      destinationValidation = await unitLotDestinationValidationModel.assertExistingUnitDestination({
        unitId: request.unit_id,
        destinationLotId: approvedDestinationLotId
      });
    }

    const lotChanged = Boolean(
      isManualTechOverride
      && approvedDestinationLotId
      && (wasParked || approvedDestinationLotId !== currentLotId)
    );
    const normalizedReviewNotes = normalizeText(reviewNotes);
    const destinationNote = lotChanged && destinationLot
      ? wasParked
        ? `Parked Unit returned to Active in destination lot: ${destinationLot.lotName}.`
        : `Destination lot selected: ${destinationLot.lotName}.`
      : '';
    const validationWarningNote = destinationValidation && destinationValidation.warningMessages.length > 0
      ? destinationValidation.warningMessages.join(' ')
      : '';
    const finalReviewNotes = [
      normalizedReviewNotes,
      destinationNote,
      validationWarningNote
    ].filter(Boolean).join('\n') || null;

    const [result] = await connection.query(
      `
        UPDATE unit_override_requests
        SET
          request_status = 'approved',
          requested_destination_lot_id = ?,
          reviewed_by_user_id = ?,
          review_notes = ?,
          reviewed_at = NOW(),
          prior_tech_credit_granted = ?,
          prior_tech_credit_weight = ?,
          prior_tech_credit_user_id = ?
        WHERE unit_override_request_id = ?
          AND LOWER(request_status) = 'pending'
      `,
      [
        isManualTechOverride ? approvedDestinationLotId : normalizeOptionalInteger(request.requested_destination_lot_id),
        reviewerId,
        finalReviewNotes,
        creditGranted ? 1 : 0,
        creditWeight,
        creditGranted ? previousAssignedUserId : null,
        requestId
      ]
    );

    if (Number(result.affectedRows) === 0) {
      if (ownsConnection) {
        await connection.rollback();
      }
      return false;
    }

    if (isOutcomeConfirmation) {
      const [outcomeResult] = await connection.query(
        `
          UPDATE unit_outcomes
          SET
            approval_status_code = 'approved',
            approved_by_user_id = ?,
            approved_at = NOW(),
            approval_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE unit_outcome_id = ?
            AND unit_id = ?
            AND is_current = 1
            AND approval_status_code = 'pending'
          LIMIT 1
        `,
        [reviewerId, normalizedReviewNotes, linkedOutcome.unit_outcome_id, request.unit_id]
      );

      if (Number(outcomeResult.affectedRows || 0) !== 1) {
        throw createOutcomeConfirmationTargetError(
          'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
          'The linked Pass/Fail decision changed before the confirmation could be recorded.'
        );
      }

      const outcomeLabel = linkedOutcome.outcome_code === 'pass'
        ? 'Pass'
        : linkedOutcome.outcome_code === 'fail'
          ? 'Fail'
          : '';
      await unitWorkflowAudit.recordOutcomeApproved(connection, {
        unitId: request.unit_id,
        actorUserId: reviewerId,
        outcomeLabel,
        approvalNotes: normalizedReviewNotes,
        source: 'override_outcome_confirmation'
      });
    } else if (requestedByUserId && request.unit_id) {
      const unitUpdates = [
        'assigned_to_user_id = ?',
        'assigned_at = NOW()',
        'assignment_updated_by_user_id = ?'
      ];
      const unitValues = [requestedByUserId, reviewerId];

      if (lotChanged) {
        unitUpdates.push('lot_id = ?');
        unitValues.push(approvedDestinationLotId);
      }

      if (wasParked) {
        if (await columnExists('units', 'is_parked')) unitUpdates.push('is_parked = 0');
        if (await columnExists('units', 'parked_at')) unitUpdates.push('parked_at = NULL');
        if (await columnExists('units', 'parked_by_user_id')) unitUpdates.push('parked_by_user_id = NULL');
        if (await columnExists('units', 'is_archived')) unitUpdates.push('is_archived = 0');
        if (await columnExists('units', 'archived_at')) unitUpdates.push('archived_at = NULL');
        if (await columnExists('units', 'archived_by_user_id')) unitUpdates.push('archived_by_user_id = NULL');
      }

      await connection.query(
        `
          UPDATE units
          SET ${unitUpdates.join(', ')}
          WHERE unit_id = ?
          LIMIT 1
        `,
        [...unitValues, request.unit_id]
      );

      if (lotChanged) {
        await productionCycleModel.recordLotMove({
          unitId: request.unit_id,
          fromLotId: wasParked ? null : currentLotId,
          toLotId: approvedDestinationLotId,
          movedByUserId: reviewerId,
          notes: wasParked
            ? 'Parked Unit returned to Active during approved takeover request.'
            : 'Unit lot moved during approved override request.',
          allowNewProductionCycle: !wasParked
        }, connection);
      }

      if (lotChanged || wasParked) {
        await productionWeightSyncModel.syncEffectiveManualCompletionWeights({
          connection,
          unitIds: [request.unit_id],
          apply: true
        });
      }

      if (await tableExists('unit_assignment_history') && previousAssignedUserId !== requestedByUserId) {
        await connection.query(
          `
            INSERT INTO unit_assignment_history (
              unit_id,
              from_user_id,
              to_user_id,
              changed_by_user_id,
              change_source,
              override_request_id,
              notes
            )
            VALUES (?, ?, ?, ?, 'override_approval', ?, ?)
          `,
          [
            request.unit_id,
            previousAssignedUserId,
            requestedByUserId,
            reviewerId,
            requestId,
            wasParked
              ? 'Parked Unit returned to Active and assigned by approved takeover request.'
              : lotChanged
                ? 'Assignment transferred and lot moved by approved override request.'
                : 'Assignment transferred by approved override request.'
          ]
        );
      }

      if (lotChanged && currentLotId) {
        const lotValidationOverrideModel = require('./lotValidationOverrideModel');
        await lotValidationOverrideModel.expireMovedUnitOverrides(currentLotId, connection);
      }

      if (wasParked && await tableExists('unit_park_history')) {
        await connection.query(
          `
            INSERT INTO unit_park_history (
              unit_id,
              event_type,
              from_lot_id,
              to_lot_id,
              from_assigned_to_user_id,
              to_assigned_to_user_id,
              changed_by_user_id,
              notes
            )
            VALUES (?, 'returned_to_active', NULL, ?, NULL, ?, ?, ?)
          `,
          [
            request.unit_id,
            approvedDestinationLotId,
            requestedByUserId,
            reviewerId,
            'Parked Unit returned to Active and assigned through an approved takeover request.'
          ]
        );
      }

      await unitWorkflowAudit.recordOverrideApproved(connection, {
        unitId: request.unit_id,
        actorUserId: reviewerId,
        requestId,
        fromUserId: previousAssignedUserId,
        toUserId: requestedByUserId,
        fromLotId: currentLotId,
        toLotId: approvedDestinationLotId,
        priorTechCreditWeight: creditGranted ? creditWeight : null,
        reviewNotes: finalReviewNotes
      });
    }

    if (creditGranted && previousAssignedUserId && completionTableReady) {
      await connection.query(
        `
          INSERT INTO unit_work_completions (
            unit_id,
            lot_id,
            completed_by_user_id,
            production_weight_value,
            credit_source,
            recorded_by_user_id,
            override_request_id,
            notes
          )
          VALUES (?, ?, ?, ?, 'override_prior_tech_credit', ?, ?, ?)
        `,
        [
          request.unit_id,
          currentLotId,
          previousAssignedUserId,
          creditWeight,
          reviewerId,
          requestId,
          'Prior Tech credit intentionally granted during override approval.'
        ]
      );
    }

    if (ownsConnection) {
      await connection.commit();
    }
    return true;
  } catch (error) {
    if (ownsConnection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}


async function withdrawOverrideRequest({ overrideRequestId, requestedByUserId, withdrawalNote = '' }) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const requesterId = normalizeOptionalInteger(requestedByUserId);

  if (!requestId || !requesterId) {
    const error = new Error('The request could not be verified.');
    error.code = 'BWT_OVERRIDE_REQUEST_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [previewRows] = await connection.query(
      `
        SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id
        FROM unit_override_requests
        WHERE unit_override_request_id = ?
        LIMIT 1
      `,
      [requestId]
    );
    const requestPreview = previewRows[0] || null;

    if (!requestPreview || Number(requestPreview.requested_by_user_id) !== requesterId) {
      const error = new Error('You can withdraw only your own pending request.');
      error.code = 'BWT_OVERRIDE_REQUEST_NOT_OWNER';
      throw error;
    }

    if (String(requestPreview.request_status || '').toLowerCase() !== 'pending') {
      const error = new Error('Only pending requests can be withdrawn.');
      error.code = 'BWT_OVERRIDE_REQUEST_NOT_PENDING';
      throw error;
    }

    const previewIsOutcomeConfirmation = requestPreview.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    if (previewIsOutcomeConfirmation && normalizeOptionalInteger(requestPreview.unit_outcome_id)) {
      await lockOutcomeConfirmationTargetRow(connection, requestPreview, { requireTarget: false });
    }

    const [rows] = await connection.query(
      `
        SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id
        FROM unit_override_requests
        WHERE unit_override_request_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [requestId]
    );
    const request = rows[0] || null;

    if (!request || Number(request.requested_by_user_id) !== requesterId) {
      const error = new Error('You can withdraw only your own pending request.');
      error.code = 'BWT_OVERRIDE_REQUEST_NOT_OWNER';
      throw error;
    }

    if (String(request.request_status || '').toLowerCase() !== 'pending'
      || (previewIsOutcomeConfirmation && !sameOutcomeConfirmationRequestTarget(requestPreview, request))) {
      const error = new Error('Only pending requests can be withdrawn.');
      error.code = 'BWT_OVERRIDE_REQUEST_NOT_PENDING';
      throw error;
    }

    const note = normalizeText(withdrawalNote) || 'Withdrawn by requester.';
    const [result] = await connection.query(
      `
        UPDATE unit_override_requests
        SET
          request_status = 'cancelled',
          reviewed_by_user_id = ?,
          review_notes = ?,
          reviewed_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
        WHERE unit_override_request_id = ?
          AND LOWER(request_status) = 'pending'
      `,
      [requesterId, note, requestId]
    );

    if (Number(result.affectedRows) !== 1) {
      const error = new Error('Only pending requests can be withdrawn.');
      error.code = 'BWT_OVERRIDE_REQUEST_NOT_PENDING';
      throw error;
    }

    if (request.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE) {
      const linkedOutcomeId = normalizeOptionalInteger(request.unit_outcome_id);
      if (linkedOutcomeId) {
        await connection.query(
          `
            UPDATE unit_outcomes
            SET
              approval_status_code = 'not_requested',
              approved_by_user_id = NULL,
              approved_at = NULL,
              approval_notes = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE unit_outcome_id = ?
              AND unit_id = ?
              AND approval_status_code = 'pending'
            LIMIT 1
          `,
          [note, linkedOutcomeId, request.unit_id]
        );
      } else {
        // Compatibility for a pending request created before Stage 10W70A.
        await connection.query(
          `
            UPDATE unit_outcomes
            SET
              approval_status_code = 'not_requested',
              approved_by_user_id = NULL,
              approved_at = NULL,
              approval_notes = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE unit_id = ?
              AND is_current = 1
              AND approval_status_code = 'pending'
            ORDER BY selected_at DESC, unit_outcome_id DESC
            LIMIT 1
          `,
          [note, request.unit_id]
        );
      }
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

async function denyOverrideRequest({ overrideRequestId, reviewedByUserId, reviewNotes }) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const reviewerId = normalizeOptionalInteger(reviewedByUserId);

  if (!requestId || !reviewerId) {
    return false;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [previewRows] = await connection.query(
      `
        SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id
        FROM unit_override_requests
        WHERE unit_override_request_id = ?
        LIMIT 1
      `,
      [requestId]
    );
    const requestPreview = previewRows[0] || null;

    if (!requestPreview || String(requestPreview.request_status || '').toLowerCase() !== 'pending') {
      await connection.rollback();
      return false;
    }

    const previewIsOutcomeConfirmation = requestPreview.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    const linkedOutcome = previewIsOutcomeConfirmation
      ? await lockOutcomeConfirmationTarget(connection, requestPreview)
      : null;

    const [requestRows] = await connection.query(
      `
        SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id
        FROM unit_override_requests
        WHERE unit_override_request_id = ?
        FOR UPDATE
      `,
      [requestId]
    );
    const request = requestRows[0];

    if (!request || String(request.request_status || '').toLowerCase() !== 'pending') {
      await connection.rollback();
      return false;
    }

    const isOutcomeConfirmation = request.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    if (previewIsOutcomeConfirmation !== isOutcomeConfirmation
      || (isOutcomeConfirmation && !sameOutcomeConfirmationRequestTarget(requestPreview, request))) {
      throw createOutcomeConfirmationTargetError(
        'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
        'The Pass/Fail confirmation request changed before it could be reviewed.'
      );
    }

    if (Number(request.requested_by_user_id) === reviewerId) {
      const error = new Error('A requester cannot review their own request.');
      error.code = 'BWT_OVERRIDE_SELF_REVIEW';
      throw error;
    }

    const normalizedReviewNotes = normalizeText(reviewNotes);

    const [result] = await connection.query(
      `
        UPDATE unit_override_requests
        SET
          request_status = 'denied',
          reviewed_by_user_id = ?,
          review_notes = ?,
          reviewed_at = NOW()
        WHERE unit_override_request_id = ?
          AND LOWER(request_status) = 'pending'
      `,
      [reviewerId, normalizedReviewNotes, requestId]
    );

    if (Number(result.affectedRows) === 0) {
      await connection.rollback();
      return false;
    }

    if (isOutcomeConfirmation) {
      const [outcomeResult] = await connection.query(
        `
          UPDATE unit_outcomes
          SET
            approval_status_code = 'denied',
            approved_by_user_id = ?,
            approved_at = NOW(),
            approval_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE unit_outcome_id = ?
            AND unit_id = ?
            AND is_current = 1
            AND approval_status_code = 'pending'
          LIMIT 1
        `,
        [reviewerId, normalizedReviewNotes, linkedOutcome.unit_outcome_id, request.unit_id]
      );

      if (Number(outcomeResult.affectedRows || 0) !== 1) {
        throw createOutcomeConfirmationTargetError(
          'BWT_OUTCOME_CONFIRMATION_TARGET_STALE',
          'The linked Pass/Fail decision changed before the rejection could be recorded.'
        );
      }
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
  overrideTableExists,
  getAssignableLotOptions,
  listAssignableLots,
  listAssignableLotHierarchyOptions,
  listOverrideRequests,
  listOverrideRequestSummaries,
  getLatestOverrideRequestMapForUnits,
  listOverrideRequestsForUnit,
  getOverrideRequestById,
  getPendingOverrideRequestForUnit,
  createOverrideRequest,
  syncOutcomeConfirmationRequestWithConnection,
  approveOverrideRequest,
  denyOverrideRequest,
  withdrawOverrideRequest
};
