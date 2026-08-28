'use strict';

const { pool } = require('./db');
const { getConfigValueIdBySystemId } = require('./configLookupModel');
const lotUnitFormProfileModel = require('./lotUnitFormProfileModel');
const unitAuditEventModel = require('./unitAuditEventModel');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const { isUnitFormFieldManaged } = require('../services/unitFormSubmissionPolicy');

const AMAZON_ASSET_TAG_PREFIX = 'AZ';
const AMAZON_ASSET_TAG_DIGITS = 8;
const AMAZON_DETAIL_FIELDS = Object.freeze([
  ['fnsku', 'fnsku', 100],
  ['asin', 'asin', 100],
  ['tracking_number', 'trackingNumber', 150],
  ['pallet_number', 'palletNumber', 150],
  ['buyer_comments', 'buyerComments', 5000]
]);

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function formatAmazonAssetTag(sequenceNumber) {
  const safeNumber = normalizePositiveInteger(sequenceNumber);
  if (!safeNumber || safeNumber > 99999999) {
    throw new Error('Amazon Asset Tag sequence is outside the supported AZ00000001-AZ99999999 range.');
  }
  return `${AMAZON_ASSET_TAG_PREFIX}${String(safeNumber).padStart(AMAZON_ASSET_TAG_DIGITS, '0')}`;
}

function normalizeAmazonAssetTag(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return /^AZ\d{8}$/.test(normalized) ? normalized : '';
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

function getBlankAmazonFormData() {
  return {
    amazonAssetTag: '',
    fnsku: '',
    asin: '',
    trackingNumber: '',
    palletNumber: '',
    buyerComments: ''
  };
}

async function getAmazonAssetTag(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId || !await tableExists(connection, 'unit_identifiers')) return '';
  const identifierTypeId = await getConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, connection);
  if (!identifierTypeId) return '';

  const [rows] = await connection.query(
    `SELECT identifier_value
     FROM unit_identifiers
     WHERE unit_id = ? AND identifier_type_config_value_id = ?
     ORDER BY unit_identifier_id DESC
     LIMIT 1`,
    [safeUnitId, identifierTypeId]
  );
  return normalizeAmazonAssetTag(rows[0]?.identifier_value);
}

async function getAmazonDetailsByUnitId(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const blank = getBlankAmazonFormData();
  if (!safeUnitId) return blank;

  const [amazonAssetTag, detailsReady] = await Promise.all([
    getAmazonAssetTag(safeUnitId, connection),
    tableExists(connection, 'unit_amazon_details')
  ]);

  if (!detailsReady) return { ...blank, amazonAssetTag };

  const [rows] = await connection.query(
    `SELECT fnsku, asin, tracking_number, pallet_number, buyer_comments
     FROM unit_amazon_details
     WHERE unit_id = ?
     LIMIT 1`,
    [safeUnitId]
  );
  const row = rows[0] || {};

  return {
    amazonAssetTag,
    fnsku: row.fnsku || '',
    asin: row.asin || '',
    trackingNumber: row.tracking_number || '',
    palletNumber: row.pallet_number || '',
    buyerComments: row.buyer_comments || ''
  };
}

async function getAmazonDetailsByUnitIds(unitIds, connection = pool) {
  const ids = [...new Set((unitIds || []).map(normalizePositiveInteger).filter(Boolean))];
  const result = new Map(ids.map((unitId) => [unitId, getBlankAmazonFormData()]));
  if (ids.length === 0) return result;

  const [detailsReady, identifiersReady, identifierTypeId] = await Promise.all([
    tableExists(connection, 'unit_amazon_details'),
    tableExists(connection, 'unit_identifiers'),
    getConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, connection)
  ]);
  const placeholders = ids.map(() => '?').join(', ');

  if (detailsReady) {
    const [rows] = await connection.query(
      `SELECT unit_id, fnsku, asin, tracking_number, pallet_number, buyer_comments
       FROM unit_amazon_details
       WHERE unit_id IN (${placeholders})`,
      ids
    );
    rows.forEach((row) => {
      result.set(Number(row.unit_id), {
        ...(result.get(Number(row.unit_id)) || getBlankAmazonFormData()),
        fnsku: row.fnsku || '',
        asin: row.asin || '',
        trackingNumber: row.tracking_number || '',
        palletNumber: row.pallet_number || '',
        buyerComments: row.buyer_comments || ''
      });
    });
  }

  if (identifiersReady && identifierTypeId) {
    const [rows] = await connection.query(
      `SELECT unit_id, identifier_value
       FROM unit_identifiers
       WHERE unit_id IN (${placeholders})
         AND identifier_type_config_value_id = ?
       ORDER BY unit_identifier_id DESC`,
      [...ids, identifierTypeId]
    );
    const seen = new Set();
    rows.forEach((row) => {
      const unitId = Number(row.unit_id);
      if (seen.has(unitId)) return;
      seen.add(unitId);
      result.set(unitId, {
        ...(result.get(unitId) || getBlankAmazonFormData()),
        amazonAssetTag: normalizeAmazonAssetTag(row.identifier_value)
      });
    });
  }

  return result;
}

async function saveAmazonDetailsForUnitWithConnection(connection, {
  unitId,
  formData,
  currentUserId
}) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId || !await tableExists(connection, 'unit_amazon_details')) return;

  const managedFields = AMAZON_DETAIL_FIELDS.filter(([fieldKey]) => isUnitFormFieldManaged(formData, fieldKey));
  if (managedFields.length === 0) return;

  const [existingRows] = await connection.query(
    `SELECT fnsku, asin, tracking_number, pallet_number, buyer_comments
     FROM unit_amazon_details WHERE unit_id = ? LIMIT 1`,
    [safeUnitId]
  );
  const existing = existingRows[0] || {};
  const valuesByColumn = {};

  AMAZON_DETAIL_FIELDS.forEach(([fieldKey, propertyName, maxLength]) => {
    const columnName = fieldKey;
    const isManaged = managedFields.some(([managedFieldKey]) => managedFieldKey === fieldKey);
    valuesByColumn[columnName] = isManaged
      ? normalizeText(formData[propertyName], maxLength)
      : (existing[columnName] || null);
  });

  const hasAnyValue = Object.values(valuesByColumn).some((value) => value !== null);
  if (!hasAnyValue && !existingRows[0]) return;

  await connection.query(
    `INSERT INTO unit_amazon_details (
       unit_id, fnsku, asin, tracking_number, pallet_number, buyer_comments,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
     ON DUPLICATE KEY UPDATE
       fnsku = VALUES(fnsku),
       asin = VALUES(asin),
       tracking_number = VALUES(tracking_number),
       pallet_number = VALUES(pallet_number),
       buyer_comments = VALUES(buyer_comments),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = NOW(6)`,
    [
      safeUnitId,
      valuesByColumn.fnsku,
      valuesByColumn.asin,
      valuesByColumn.tracking_number,
      valuesByColumn.pallet_number,
      valuesByColumn.buyer_comments,
      normalizePositiveInteger(currentUserId),
      normalizePositiveInteger(currentUserId)
    ]
  );
}

async function saveAmazonDetailsForUnit({ unitId, formData, currentUserId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await saveAmazonDetailsForUnitWithConnection(connection, { unitId, formData, currentUserId });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getLotAmazonPolicy(destinationLotId, connection = pool) {
  const safeLotId = normalizePositiveInteger(destinationLotId);
  if (!safeLotId) return { generateAmazonAssetTag: false, palletNumberVisible: false };

  const hasGenerateColumn = await columnExists(connection, 'lots', 'generate_amazon_asset_tag');
  const [rows] = hasGenerateColumn
    ? await connection.query('SELECT generate_amazon_asset_tag FROM lots WHERE lot_id = ? LIMIT 1', [safeLotId])
    : [[]];
  const profile = await lotUnitFormProfileModel.getEffectiveUnitFormProfileForLot(safeLotId, connection);
  const palletField = profile?.fieldsByKey instanceof Map ? profile.fieldsByKey.get('pallet_number') : null;

  return {
    generateAmazonAssetTag: Number(rows[0]?.generate_amazon_asset_tag || 0) === 1,
    palletNumberVisible: Boolean(palletField?.visible)
  };
}

async function nextAmazonAssetTagNumber(connection) {
  if (!await tableExists(connection, 'amazon_asset_tag_sequence')) {
    throw new Error('Amazon Asset Tag sequence is not ready. Apply the Amazon workflow migration first.');
  }

  const [rows] = await connection.query(
    'SELECT last_number FROM amazon_asset_tag_sequence WHERE sequence_id = 1 FOR UPDATE'
  );
  if (!rows[0]) {
    await connection.query('INSERT INTO amazon_asset_tag_sequence (sequence_id, last_number) VALUES (1, 0)');
    return nextAmazonAssetTagNumber(connection);
  }

  const nextNumber = Number(rows[0].last_number || 0) + 1;
  formatAmazonAssetTag(nextNumber);
  await connection.query(
    'UPDATE amazon_asset_tag_sequence SET last_number = ?, updated_at = NOW(6) WHERE sequence_id = 1',
    [nextNumber]
  );
  return nextNumber;
}

async function ensureAmazonAssetTag(connection, {
  unitId,
  actorUserId,
  source = 'amazon_lot_policy',
  reason = 'Unit entered a Lot configured to generate Amazon Asset Tags.'
}) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId || !await tableExists(connection, 'unit_identifiers')) return { amazonAssetTag: '', created: false };

  const identifierTypeId = await getConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, connection);
  if (!identifierTypeId) {
    throw new Error('Amazon Asset Tag identifier type is not configured. Apply the Amazon workflow migration first.');
  }

  const [existingRows] = await connection.query(
    `SELECT identifier_value FROM unit_identifiers
     WHERE unit_id = ? AND identifier_type_config_value_id = ?
     ORDER BY unit_identifier_id DESC LIMIT 1 FOR UPDATE`,
    [safeUnitId, identifierTypeId]
  );
  const existingTag = normalizeAmazonAssetTag(existingRows[0]?.identifier_value);
  if (existingTag) return { amazonAssetTag: existingTag, created: false };

  const sequenceNumber = await nextAmazonAssetTagNumber(connection);
  const amazonAssetTag = formatAmazonAssetTag(sequenceNumber);

  await connection.query(
    `INSERT INTO unit_identifiers (
       unit_id, identifier_type_config_value_id, identifier_value, normalized_value, is_primary
     ) VALUES (?, ?, ?, ?, 0)`,
    [safeUnitId, identifierTypeId, amazonAssetTag, amazonAssetTag]
  );

  if (await tableExists(connection, 'unit_audit_events') && await tableExists(connection, 'unit_audit_event_changes')) {
    await unitAuditEventModel.createUnitAuditEvent({
      unitId: safeUnitId,
      actorUserId: normalizePositiveInteger(actorUserId),
      eventType: 'amazon_asset_tag_assigned',
      eventSource: source,
      eventSummary: `Assigned Amazon Asset Tag ${amazonAssetTag}`,
      metadata: { reason, amazonAssetTag },
      changes: [{
        fieldKey: 'amazon_asset_tag',
        fieldLabel: 'Amazon Asset Tag',
        changeType: 'added',
        oldValue: null,
        newValue: amazonAssetTag,
        oldValueText: '',
        newValueText: amazonAssetTag,
        sortOrder: 10
      }]
    }, connection);
  }

  return { amazonAssetTag, created: true };
}

async function clearPalletNumberIfNeeded(connection, { unitId, actorUserId, destinationLotId, palletNumberVisible, recordAudit = true }) {
  if (palletNumberVisible || !await tableExists(connection, 'unit_amazon_details')) return false;
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return false;

  const [rows] = await connection.query(
    'SELECT pallet_number FROM unit_amazon_details WHERE unit_id = ? LIMIT 1 FOR UPDATE',
    [safeUnitId]
  );
  const previousPallet = String(rows[0]?.pallet_number || '').trim();
  if (!previousPallet) return false;

  await connection.query(
    `UPDATE unit_amazon_details
     SET pallet_number = NULL, updated_by_user_id = ?, updated_at = NOW(6)
     WHERE unit_id = ?`,
    [normalizePositiveInteger(actorUserId), safeUnitId]
  );

  if (recordAudit && await tableExists(connection, 'unit_audit_events') && await tableExists(connection, 'unit_audit_event_changes')) {
    await unitAuditEventModel.createUnitAuditEvent({
      unitId: safeUnitId,
      actorUserId: normalizePositiveInteger(actorUserId),
      eventType: 'amazon_pallet_cleared',
      eventSource: 'amazon_lot_policy',
      eventSummary: `Cleared Pallet Number ${previousPallet}`,
      metadata: { destinationLotId: normalizePositiveInteger(destinationLotId), reason: 'Destination Lot does not expose Pallet Number.' },
      changes: [{
        fieldKey: 'pallet_number',
        fieldLabel: 'Pallet Number',
        changeType: 'removed',
        oldValue: previousPallet,
        newValue: null,
        oldValueText: previousPallet,
        newValueText: '',
        sortOrder: 10
      }]
    }, connection);
  }

  return true;
}

async function applyDestinationLotAmazonPolicy(connection, {
  unitId,
  destinationLotId,
  actorUserId,
  source = 'amazon_lot_policy',
  auditPalletClear = true
}) {
  const policy = await getLotAmazonPolicy(destinationLotId, connection);
  const azResult = policy.generateAmazonAssetTag
    ? await ensureAmazonAssetTag(connection, { unitId, actorUserId, source })
    : { amazonAssetTag: await getAmazonAssetTag(unitId, connection), created: false };
  const palletCleared = await clearPalletNumberIfNeeded(connection, {
    unitId,
    actorUserId,
    destinationLotId,
    palletNumberVisible: policy.palletNumberVisible,
    recordAudit: auditPalletClear
  });

  return {
    ...policy,
    ...azResult,
    palletCleared
  };
}


async function searchDirectLotPalletNumbers(lotId, search = '', limit = 25, connection = pool) {
  const safeLotId = normalizePositiveInteger(lotId);
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 50);
  const normalizedSearch = String(search || '').trim().slice(0, 150);

  if (!safeLotId || !await tableExists(connection, 'unit_amazon_details')) {
    return { values: [], hasMore: false };
  }

  const whereSearch = normalizedSearch
    ? 'AND INSTR(LOWER(ua.pallet_number), LOWER(?)) > 0'
    : '';
  const params = normalizedSearch ? [safeLotId, normalizedSearch] : [safeLotId];
  const [rows] = await connection.query(
    `SELECT DISTINCT ua.pallet_number
     FROM unit_amazon_details ua
     INNER JOIN units u ON u.unit_id = ua.unit_id
     WHERE u.lot_id = ?
       AND ua.pallet_number IS NOT NULL
       AND TRIM(ua.pallet_number) <> ''
       ${whereSearch}
     ORDER BY ua.pallet_number
     LIMIT ${safeLimit + 1}`,
    params
  );
  const values = rows
    .slice(0, safeLimit)
    .map((row) => String(row.pallet_number || '').trim())
    .filter(Boolean);

  return {
    values,
    hasMore: rows.length > safeLimit
  };
}

async function listDirectLotPalletNumbers(lotId, connection = pool) {
  const result = await searchDirectLotPalletNumbers(lotId, '', 50, connection);
  return result.values;
}

async function countDirectLotUnitsMissingAmazonAssetTag(lotId, connection = pool) {
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeLotId) return 0;
  const identifierTypeId = await getConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, connection);
  if (!identifierTypeId) return 0;
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM units u
     WHERE u.lot_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM unit_identifiers ui
         WHERE ui.unit_id = u.unit_id
           AND ui.identifier_type_config_value_id = ?
       )`,
    [safeLotId, identifierTypeId]
  );
  return Number(rows[0]?.row_count || 0);
}

async function bulkGenerateDirectLotAmazonAssetTags({ lotId, actorUserId }) {
  const safeLotId = normalizePositiveInteger(lotId);
  const safeActorUserId = normalizePositiveInteger(actorUserId);
  if (!safeLotId || !safeActorUserId) throw new Error('Lot ID and Management user are required.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const policy = await getLotAmazonPolicy(safeLotId, connection);
    if (!policy.generateAmazonAssetTag) {
      const error = new Error('Enable Generate Amazon Asset Tag for this Lot before bulk generation.');
      error.code = 'BWT_AMAZON_ASSET_TAG_LOT_DISABLED';
      throw error;
    }

    const identifierTypeId = await getConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_AMAZON_ASSET_TAG, connection);
    const [rows] = await connection.query(
      `SELECT u.unit_id
       FROM units u
       WHERE u.lot_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM unit_identifiers ui
           WHERE ui.unit_id = u.unit_id
             AND ui.identifier_type_config_value_id = ?
         )
       ORDER BY u.unit_id
       FOR UPDATE`,
      [safeLotId, identifierTypeId]
    );

    let generatedCount = 0;
    for (const row of rows) {
      const result = await ensureAmazonAssetTag(connection, {
        unitId: row.unit_id,
        actorUserId: safeActorUserId,
        source: 'amazon_asset_tag_bulk_generation',
        reason: 'Management explicitly generated missing Amazon Asset Tags for direct Units in the Lot.'
      });
      if (result.created) generatedCount += 1;
    }

    await connection.commit();
    return { generatedCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  AMAZON_ASSET_TAG_DIGITS,
  AMAZON_ASSET_TAG_PREFIX,
  applyDestinationLotAmazonPolicy,
  bulkGenerateDirectLotAmazonAssetTags,
  countDirectLotUnitsMissingAmazonAssetTag,
  formatAmazonAssetTag,
  getAmazonAssetTag,
  getAmazonDetailsByUnitId,
  getAmazonDetailsByUnitIds,
  getBlankAmazonFormData,
  getLotAmazonPolicy,
  listDirectLotPalletNumbers,
  searchDirectLotPalletNumbers,
  normalizeAmazonAssetTag,
  saveAmazonDetailsForUnit,
  saveAmazonDetailsForUnitWithConnection
};
