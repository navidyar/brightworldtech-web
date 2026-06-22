const { pool } = require('./db');
const lotModel = require('./lotModel');

const OVERRIDE_TABLE = 'unit_override_requests';
const MANUAL_TECH_OVERRIDE_REQUEST_TYPE = 'manual_tech_override_request';
const OUTCOME_CONFIRMATION_REQUEST_TYPE = 'outcome_confirmation';
const DEFAULT_LIMIT = 100;
const VALID_STATUS_FILTERS = new Set(['pending', 'approved', 'denied', 'cancelled', 'all']);

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

async function overrideTableExists() {
  return tableExists(OVERRIDE_TABLE);
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

function getPersonName(row, prefix) {
  const firstName = row[`${prefix}_first_name`];
  const lastName = row[`${prefix}_last_name`];
  const email = row[`${prefix}_email`];
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return fullName || email || 'Unknown user';
}

async function getLotNameMap() {
  const lots = await lotModel.listLots({ includeHidden: true });
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot.lot_name || lot.name || 'Lot name not available');
  });

  return lotMap;
}


async function listAssignableLots() {
  const lots = await lotModel.listLots({ includeHidden: true });
  const activeLots = lots.filter((lot) => Number(lot.is_active) === 1 && Number(lot.is_closed || 0) !== 1);
  const parentLotIdsWithChildren = new Set(
    activeLots
      .filter((lot) => lot.parent_lot_id)
      .map((lot) => String(lot.parent_lot_id))
  );

  return activeLots
    .filter((lot) => !parentLotIdsWithChildren.has(String(lot.lot_id)))
    .map((lot) => ({
      lotId: Number(lot.lot_id),
      lotName: lot.lot_name || lot.name || 'Lot name not available'
    }));
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
    return 'Awaiting Management Review';
  }

  return decision || 'Not captured yet';
}

function mapOverrideRequest(row, lotMap) {
  const normalizedRequestStatus = normalizeRequestStatus(row.request_status);
  const unitAssetTag = row.asset_number
    ? getDisplayAssetTag(row.asset_number)
    : null;

  return {
    unitOverrideRequestId: Number(row.unit_override_request_id),
    unitId: row.unit_id ? Number(row.unit_id) : null,
    lotId: row.lot_id ? Number(row.lot_id) : null,
    lotName: row.lot_id ? lotMap.get(Number(row.lot_id)) || 'Lot name not available' : 'No lot selected',
    unitAssetTag,
    unitLabel: unitAssetTag || 'No asset tag',
    requestType: row.request_type || 'lot_requirement_override',
    requestTypeLabel: getRequestTypeLabel(row.request_type),
    requestStatus: normalizedRequestStatus,
    validationStatus: row.validation_status || null,
    enforcementDecision: row.enforcement_decision || null,
    reason: row.reason || '',
    requestDetails: row.request_details || null,
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

async function listOverrideRequests(options = {}) {
  const exists = await overrideTableExists();

  if (!exists) {
    return {
      supported: false,
      message: 'The unit_override_requests table does not exist yet. Run the Step 2j SQL migration before using overrides.',
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

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [lotMap, assignableLots] = await Promise.all([
    getLotNameMap(),
    listAssignableLots()
  ]);

  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.lot_id,
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
        ) AS has_recorded_work,
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
  );

  return {
    supported: true,
    message: 'Override requests loaded.',
    statusFilter,
    assignableLots,
    requests: rows.map((row) => mapOverrideRequest(row, lotMap))
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
          r.lot_id,
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
      ) ranked_requests
      WHERE row_rank = 1
    `,
    safeUnitIds
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
        r.lot_id,
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

  const lotMap = await getLotNameMap();

  const [rows] = await pool.query(
    `
      SELECT
        r.unit_override_request_id,
        r.unit_id,
        r.lot_id,
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
      WHERE r.unit_override_request_id = ?
      LIMIT 1
    `,
    [requestId]
  );

  return rows[0] ? mapOverrideRequest(rows[0], lotMap) : null;
}

async function getPendingOverrideRequestForUnit({ unitId, lotId, requestType = null }) {
  const exists = await overrideTableExists();

  if (!exists) {
    return null;
  }

  const normalizedUnitId = normalizeOptionalInteger(unitId);
  const normalizedLotId = normalizeOptionalInteger(lotId);
  const normalizedRequestType = normalizeText(requestType);

  if (!normalizedUnitId) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT
        unit_override_request_id,
        unit_id,
        lot_id,
        request_status,
        created_at
      FROM unit_override_requests
      WHERE unit_id = ?
        AND LOWER(request_status) = 'pending'
        AND (? IS NULL OR request_type = ?)
        AND (
          lot_id = ?
          OR (? IS NULL AND lot_id IS NULL)
        )
      ORDER BY created_at DESC, unit_override_request_id DESC
      LIMIT 1
    `,
    [normalizedUnitId, normalizedRequestType, normalizedRequestType, normalizedLotId, normalizedLotId]
  );

  return rows[0] || null;
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
  approvalRequested = false
}) {
  if (!await tableExists(OVERRIDE_TABLE)) {
    return null;
  }

  const safeUnitId = normalizeOptionalInteger(unitId);
  const safeRequestedByUserId = normalizeOptionalInteger(requestedByUserId);
  const safeLotId = normalizeOptionalInteger(lotId);
  const normalizedOutcomeCode = String(outcomeCode || '').trim().toLowerCase();

  if (!safeUnitId || !safeRequestedByUserId || !['pass', 'fail'].includes(normalizedOutcomeCode)) {
    return null;
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
    [safeUnitId, OUTCOME_CONFIRMATION_REQUEST_TYPE]
  );

  const pendingRequest = pendingRows[0] || null;

  if (!approvalRequested) {
    if (pendingRequest) {
      await connection.query(
        `
          UPDATE unit_override_requests
          SET
            request_status = 'cancelled',
            review_notes = 'Pass/Fail confirmation request was withdrawn when the outcome was updated without confirmation.',
            reviewed_at = NOW()
          WHERE unit_override_request_id = ?
        `,
        [pendingRequest.unit_override_request_id]
      );
    }

    return null;
  }

  const outcomeLabel = getOutcomeConfirmationLabel(normalizedOutcomeCode);
  const reason = `Second-opinion confirmation requested for the current ${outcomeLabel} decision.`;
  const requestDetails = JSON.stringify({
    source: 'tech_unit_pass_fail_confirmation',
    outcome_code: normalizedOutcomeCode,
    outcome_label: outcomeLabel,
    outcome_notes: normalizeText(outcomeNotes),
    request_notes: normalizeText(requestNotes)
  });

  if (pendingRequest) {
    await connection.query(
      `
        UPDATE unit_override_requests
        SET
          lot_id = ?,
          validation_status = 'needs_review',
          enforcement_decision = 'review',
          reason = ?,
          request_details = ?,
          requested_by_user_id = ?,
          review_notes = NULL,
          reviewed_by_user_id = NULL,
          reviewed_at = NULL,
          updated_at = NOW()
        WHERE unit_override_request_id = ?
      `,
      [
        safeLotId,
        reason,
        requestDetails,
        safeRequestedByUserId,
        pendingRequest.unit_override_request_id
      ]
    );

    return Number(pendingRequest.unit_override_request_id);
  }

  const [result] = await connection.query(
    `
      INSERT INTO unit_override_requests (
        unit_id,
        lot_id,
        request_type,
        request_status,
        validation_status,
        enforcement_decision,
        reason,
        request_details,
        requested_by_user_id
      )
      VALUES (?, ?, ?, 'pending', 'needs_review', 'review', ?, ?, ?)
    `,
    [
      safeUnitId,
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
    throw new Error('Cannot create override request because unit_override_requests table does not exist.');
  }

  const normalizedReason = normalizeText(reason);

  if (!normalizedReason) {
    throw new Error('Override request reason is required.');
  }

  const [result] = await pool.query(
    `
      INSERT INTO unit_override_requests (
        unit_id,
        lot_id,
        request_type,
        request_status,
        validation_status,
        enforcement_decision,
        reason,
        request_details,
        requested_by_user_id,
        expires_at
      )
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizeOptionalInteger(unitId),
      normalizeOptionalInteger(lotId),
      normalizeText(requestType) || 'lot_requirement_override',
      normalizeText(validationStatus),
      normalizeText(enforcementDecision),
      normalizedReason,
      normalizeJsonValue(requestDetails),
      normalizeOptionalInteger(requestedByUserId),
      expiresAt || null
    ]
  );

  return result.insertId;
}

async function approveOverrideRequest({
  overrideRequestId,
  reviewedByUserId,
  reviewNotes,
  priorTechCreditGranted = false,
  priorTechCreditWeight = null,
  destinationLotId = null
}) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const reviewerId = normalizeOptionalInteger(reviewedByUserId);

  if (!requestId || !reviewerId) {
    return false;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `
        SELECT
          r.unit_override_request_id,
          r.unit_id,
          r.request_type,
          r.requested_by_user_id,
          r.request_status,
          u.assigned_to_user_id,
          u.created_by_user_id,
          u.lot_id AS current_lot_id
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
      await connection.rollback();
      return false;
    }

    const isOutcomeConfirmation = request.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE;
    const isManualTechOverride = request.request_type === MANUAL_TECH_OVERRIDE_REQUEST_TYPE;
    const canGrantPriorTechCredit = !isOutcomeConfirmation && isManualTechOverride;
    const creditGranted = canGrantPriorTechCredit && priorTechCreditGranted === true;
    const creditWeight = creditGranted ? normalizeCreditWeight(priorTechCreditWeight) : null;

    if (creditGranted && creditWeight === null) {
      const error = new Error('Prior Tech credit weight must be a number from 0.10 through 10.00 with two decimal places.');
      error.code = 'BWT_INVALID_PRIOR_TECH_CREDIT_WEIGHT';
      throw error;
    }

    const requestedByUserId = normalizeOptionalInteger(request.requested_by_user_id);
    const previousAssignedUserId = normalizeOptionalInteger(request.assigned_to_user_id) || normalizeOptionalInteger(request.created_by_user_id);
    const currentLotId = normalizeOptionalInteger(request.current_lot_id);
    const completionTableReady = await tableExists('unit_work_completions');
    let hasRecordedWork = false;

    if (isManualTechOverride && request.unit_id && completionTableReady) {
      const [completionRows] = await connection.query(
        `
          SELECT 1
          FROM unit_work_completions
          WHERE unit_id = ?
          LIMIT 1
        `,
        [request.unit_id]
      );
      hasRecordedWork = completionRows.length > 0;
    }

    let approvedDestinationLotId = currentLotId;
    let destinationLot = null;

    if (isManualTechOverride && hasRecordedWork) {
      const requestedDestinationLotId = normalizeOptionalInteger(destinationLotId);

      if (!requestedDestinationLotId) {
        throw createOverrideDestinationLotError(
          'BWT_OVERRIDE_DESTINATION_LOT_REQUIRED',
          'Select an open destination lot before approving an override for a unit with recorded work.'
        );
      }

      const assignableLots = await listAssignableLots();
      destinationLot = assignableLots.find((lot) => lot.lotId === requestedDestinationLotId) || null;

      if (!destinationLot) {
        throw createOverrideDestinationLotError(
          'BWT_INVALID_OVERRIDE_DESTINATION_LOT',
          'The selected destination lot is not currently open and assignable.'
        );
      }

      approvedDestinationLotId = requestedDestinationLotId;
    }

    const lotChanged = Boolean(
      isManualTechOverride
      && hasRecordedWork
      && approvedDestinationLotId
      && approvedDestinationLotId !== currentLotId
    );
    const normalizedReviewNotes = normalizeText(reviewNotes);
    const finalReviewNotes = lotChanged
      ? [normalizedReviewNotes, `Destination lot selected: ${destinationLot.lotName}.`].filter(Boolean).join('\n')
      : normalizedReviewNotes;

    const [result] = await connection.query(
      `
        UPDATE unit_override_requests
        SET
          request_status = 'approved',
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
        reviewerId,
        finalReviewNotes,
        creditGranted ? 1 : 0,
        creditWeight,
        creditGranted ? previousAssignedUserId : null,
        requestId
      ]
    );

    if (Number(result.affectedRows) === 0) {
      await connection.rollback();
      return false;
    }

    if (isOutcomeConfirmation) {
      await connection.query(
        `
          UPDATE unit_outcomes
          SET
            approval_status_code = 'approved',
            approved_by_user_id = ?,
            approved_at = NOW(),
            approval_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE unit_id = ?
            AND is_current = 1
            AND approval_status_code = 'pending'
          ORDER BY selected_at DESC, unit_outcome_id DESC
          LIMIT 1
        `,
        [reviewerId, normalizedReviewNotes, request.unit_id]
      );
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

      await connection.query(
        `
          UPDATE units
          SET ${unitUpdates.join(', ')}
          WHERE unit_id = ?
          LIMIT 1
        `,
        [...unitValues, request.unit_id]
      );

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
            lotChanged
              ? 'Assignment transferred and lot moved by approved override request.'
              : 'Assignment transferred by approved override request.'
          ]
        );
      }

      if (lotChanged && await tableExists('unit_lot_history')) {
        await connection.query(
          `
            INSERT INTO unit_lot_history (
              unit_id,
              from_lot_id,
              to_lot_id,
              moved_by_user_id,
              notes
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            request.unit_id,
            currentLotId,
            approvedDestinationLotId,
            reviewerId,
            'Unit lot moved during approved override request.'
          ]
        );
      }
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

    const [requestRows] = await connection.query(
      `
        SELECT unit_id, request_type, request_status
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
      [reviewerId, normalizeText(reviewNotes), requestId]
    );

    if (Number(result.affectedRows) === 0) {
      await connection.rollback();
      return false;
    }

    if (request.request_type === OUTCOME_CONFIRMATION_REQUEST_TYPE) {
      await connection.query(
        `
          UPDATE unit_outcomes
          SET
            approval_status_code = 'denied',
            approved_by_user_id = ?,
            approved_at = NOW(),
            approval_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE unit_id = ?
            AND is_current = 1
            AND approval_status_code = 'pending'
          ORDER BY selected_at DESC, unit_outcome_id DESC
          LIMIT 1
        `,
        [reviewerId, normalizeText(reviewNotes), request.unit_id]
      );
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
  listOverrideRequests,
  getLatestOverrideRequestMapForUnits,
  listOverrideRequestsForUnit,
  getOverrideRequestById,
  getPendingOverrideRequestForUnit,
  createOverrideRequest,
  syncOutcomeConfirmationRequestWithConnection,
  approveOverrideRequest,
  denyOverrideRequest
};