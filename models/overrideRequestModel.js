const { pool } = require('./db');
const lotModel = require('./lotModel');

const OVERRIDE_TABLE = 'unit_override_requests';
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

function normalizeOptionalInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  const normalized = String(value || '').trim();

  return normalized || null;
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
  const lots = await lotModel.listLots();
  const lotMap = new Map();

  lots.forEach((lot) => {
    lotMap.set(Number(lot.lot_id), lot.lot_name || lot.name || `Lot #${lot.lot_id}`);
  });

  return lotMap;
}

function getStatusLabel(status) {
  if (status === 'pending') {
    return 'Pending';
  }

  if (status === 'approved') {
    return 'Approved';
  }

  if (status === 'denied') {
    return 'Denied';
  }

  if (status === 'cancelled') {
    return 'Cancelled';
  }

  return status || 'Unknown';
}

function getStatusClass(status) {
  if (status === 'approved') {
    return 'good';
  }

  if (status === 'denied' || status === 'cancelled') {
    return 'bad';
  }

  return 'warn';
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

  return decision || 'Not captured yet';
}

function mapOverrideRequest(row, lotMap) {
  const unitAssetTag = row.asset_number
    ? getDisplayAssetTag(row.asset_number)
    : null;

  return {
    unitOverrideRequestId: Number(row.unit_override_request_id),
    unitId: row.unit_id ? Number(row.unit_id) : null,
    lotId: row.lot_id ? Number(row.lot_id) : null,
    lotName: row.lot_id ? lotMap.get(Number(row.lot_id)) || `Lot ID ${row.lot_id}` : 'No lot selected',
    unitAssetTag,
    unitLabel: unitAssetTag || (row.unit_id ? `Unit #${row.unit_id}` : 'No unit selected'),
    requestType: row.request_type || 'lot_requirement_override',
    requestStatus: row.request_status || 'pending',
    validationStatus: row.validation_status || null,
    enforcementDecision: row.enforcement_decision || null,
    reason: row.reason || '',
    requestDetails: row.request_details || null,
    reviewNotes: row.review_notes || '',
    requestedByUserId: row.requested_by_user_id ? Number(row.requested_by_user_id) : null,
    requestedByName: getPersonName(row, 'requested_by'),
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedByName: row.reviewed_by_user_id ? getPersonName(row, 'reviewed_by') : null,
    reviewedAt: row.reviewed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isPending: row.request_status === 'pending',
    statusLabel: getStatusLabel(row.request_status),
    statusClass: getStatusClass(row.request_status),
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
    where.push('r.request_status = ?');
    params.push(statusFilter);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
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
      ${whereSql}
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
      LIMIT ?
    `,
    [...params, limit]
  );

  return {
    supported: true,
    message: 'Override requests loaded.',
    statusFilter,
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
      WHERE r.unit_override_request_id = ?
      LIMIT 1
    `,
    [requestId]
  );

  return rows[0] ? mapOverrideRequest(rows[0], lotMap) : null;
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

async function approveOverrideRequest({ overrideRequestId, reviewedByUserId, reviewNotes }) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const reviewerId = normalizeOptionalInteger(reviewedByUserId);

  if (!requestId || !reviewerId) {
    return false;
  }

  const [result] = await pool.query(
    `
      UPDATE unit_override_requests
      SET
        request_status = 'approved',
        reviewed_by_user_id = ?,
        review_notes = ?,
        reviewed_at = NOW()
      WHERE unit_override_request_id = ?
        AND request_status = 'pending'
      LIMIT 1
    `,
    [reviewerId, normalizeText(reviewNotes), requestId]
  );

  return result.affectedRows === 1;
}

async function denyOverrideRequest({ overrideRequestId, reviewedByUserId, reviewNotes }) {
  const requestId = normalizeOptionalInteger(overrideRequestId);
  const reviewerId = normalizeOptionalInteger(reviewedByUserId);

  if (!requestId || !reviewerId) {
    return false;
  }

  const [result] = await pool.query(
    `
      UPDATE unit_override_requests
      SET
        request_status = 'denied',
        reviewed_by_user_id = ?,
        review_notes = ?,
        reviewed_at = NOW()
      WHERE unit_override_request_id = ?
        AND request_status = 'pending'
      LIMIT 1
    `,
    [reviewerId, normalizeText(reviewNotes), requestId]
  );

  return result.affectedRows === 1;
}

module.exports = {
  overrideTableExists,
  listOverrideRequests,
  getOverrideRequestById,
  createOverrideRequest,
  approveOverrideRequest,
  denyOverrideRequest
};