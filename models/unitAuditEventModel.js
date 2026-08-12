'use strict';

const crypto = require('node:crypto');
const { pool } = require('./db');
const lotModel = require('./lotModel');
const { snapshotLotPath } = require('../services/lotHierarchyPresentation');

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeNullablePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${fieldName} is required.`);
  if (normalized.length > maxLength) throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function normalizeOptionalText(value, maxLength = null) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function toJsonValue(value) {
  return value === undefined ? null : value;
}

function normalizeChange(change, index) {
  const fieldKey = normalizeText(change && change.fieldKey, 120, 'Audit field key');
  const fieldLabel = normalizeText(change && change.fieldLabel, 150, 'Audit field label');
  const changeType = normalizeText(change && change.changeType, 40, 'Audit change type');

  return {
    fieldKey,
    fieldLabel,
    changeType,
    oldValueText: normalizeOptionalText(change.oldValueText),
    newValueText: normalizeOptionalText(change.newValueText),
    oldValue: toJsonValue(change.oldValue),
    newValue: toJsonValue(change.newValue),
    sortOrder: Number.isInteger(Number(change.sortOrder)) ? Number(change.sortOrder) : (index + 1) * 10
  };
}

function normalizeEvent(event) {
  const changes = (Array.isArray(event && event.changes) ? event.changes : []).map(normalizeChange);

  return {
    unitId: normalizePositiveInteger(event && event.unitId, 'Unit ID'),
    actorUserId: normalizeNullablePositiveInteger(event && event.actorUserId),
    eventType: normalizeText(event && event.eventType, 80, 'Audit event type'),
    eventSource: normalizeText(event && event.eventSource || 'application', 80, 'Audit event source'),
    eventSummary: normalizeText(event && event.eventSummary, 255, 'Audit event summary'),
    correlationKey: normalizeOptionalText(event && event.correlationKey, 36) || crypto.randomUUID(),
    metadata: event && event.metadata && typeof event.metadata === 'object' ? event.metadata : null,
    occurredAt: event && event.occurredAt ? event.occurredAt : null,
    changes
  };
}

const LOT_HIERARCHY_AUDIT_FIELDS = new Set(['assignable_lot', 'completion_lot']);

async function enrichLotHierarchyMetadata(connection, normalizedEvent) {
  const lotChanges = normalizedEvent.changes.filter((change) => LOT_HIERARCHY_AUDIT_FIELDS.has(change.fieldKey));
  if (lotChanges.length === 0) return normalizedEvent;

  let rows = [];
  try {
    rows = await lotModel.listLotHierarchyRows(connection);
  } catch (_error) {
    return normalizedEvent;
  }

  const lotHierarchyPaths = {};
  lotChanges.forEach((change) => {
    const oldId = normalizeNullablePositiveInteger(change.oldValue);
    const newId = normalizeNullablePositiveInteger(change.newValue);
    lotHierarchyPaths[change.fieldKey] = {
      old: oldId ? snapshotLotPath(rows, oldId) : null,
      new: newId ? snapshotLotPath(rows, newId) : null
    };
  });

  return {
    ...normalizedEvent,
    metadata: {
      ...(normalizedEvent.metadata || {}),
      lotHierarchyPaths
    }
  };
}

async function insertEventWithConnection(connection, event) {
  const baseNormalized = normalizeEvent(event);
  const normalized = await enrichLotHierarchyMetadata(connection, baseNormalized);
  const [result] = await connection.query(
    `
      INSERT INTO unit_audit_events (
        unit_id,
        actor_user_id,
        event_type,
        event_source,
        event_summary,
        correlation_key,
        event_metadata_json,
        occurred_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(6)))
    `,
    [
      normalized.unitId,
      normalized.actorUserId,
      normalized.eventType,
      normalized.eventSource,
      normalized.eventSummary,
      normalized.correlationKey,
      normalized.metadata ? JSON.stringify(normalized.metadata) : null,
      normalized.occurredAt
    ]
  );

  const eventId = Number(result.insertId);

  for (const change of normalized.changes) {
    await connection.query(
      `
        INSERT INTO unit_audit_event_changes (
          unit_audit_event_id,
          field_key,
          field_label,
          change_type,
          old_value_text,
          new_value_text,
          old_value_json,
          new_value_json,
          sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        eventId,
        change.fieldKey,
        change.fieldLabel,
        change.changeType,
        change.oldValueText,
        change.newValueText,
        change.oldValue === null ? null : JSON.stringify(change.oldValue),
        change.newValue === null ? null : JSON.stringify(change.newValue),
        change.sortOrder
      ]
    );
  }

  return {
    eventId,
    correlationKey: normalized.correlationKey,
    changeCount: normalized.changes.length
  };
}

async function createUnitAuditEvent(event, connection = null) {
  if (connection) return insertEventWithConnection(connection, event);

  const ownedConnection = await pool.getConnection();
  try {
    await ownedConnection.beginTransaction();
    const result = await insertEventWithConnection(ownedConnection, event);
    await ownedConnection.commit();
    return result;
  } catch (error) {
    await ownedConnection.rollback();
    throw error;
  } finally {
    ownedConnection.release();
  }
}


async function getUnitCreationContext(unitId, { connection = pool, assetTagPrefix = 'BWT' } = {}) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const [rows] = await connection.query(
    `
      SELECT
        u.unit_id,
        u.asset_number,
        u.created_by_user_id,
        u.created_at,
        CONCAT_WS(' ', creator.first_name, creator.last_name) AS created_by_name
      FROM units u
      LEFT JOIN users creator
        ON creator.user_id = u.created_by_user_id
      WHERE u.unit_id = ?
      LIMIT 1
    `,
    [safeUnitId]
  );

  const row = rows[0];
  if (!row) return null;

  const compactPrefix = String(assetTagPrefix || 'BWT').trim().toUpperCase() || 'BWT';
  const assetNumber = row.asset_number == null ? '' : String(row.asset_number).trim();

  return {
    unitId: Number(row.unit_id),
    assetTag: assetNumber ? `${compactPrefix}${assetNumber}` : `Unit ${Number(row.unit_id)}`,
    createdByUserId: normalizeNullablePositiveInteger(row.created_by_user_id),
    createdByName: String(row.created_by_name || '').trim() || (row.created_by_user_id ? 'User not recorded' : 'System'),
    createdAt: row.created_at || null
  };
}

async function listUnitAuditEvents(unitId, { limit = 250, connection = pool } = {}) {
  const safeUnitId = normalizePositiveInteger(unitId, 'Unit ID');
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 1000);
  const [rows] = await connection.query(
    `
      SELECT
        event_record.unit_audit_event_id,
        event_record.unit_id,
        event_record.actor_user_id,
        event_record.event_type,
        event_record.event_source,
        event_record.event_summary,
        event_record.correlation_key,
        event_record.event_metadata_json,
        event_record.occurred_at,
        CONCAT_WS(' ', actor.first_name, actor.last_name) AS actor_name
      FROM unit_audit_events event_record
      LEFT JOIN users actor
        ON actor.user_id = event_record.actor_user_id
      WHERE event_record.unit_id = ?
      ORDER BY event_record.occurred_at DESC, event_record.unit_audit_event_id DESC
      LIMIT ?
    `,
    [safeUnitId, safeLimit]
  );

  if (rows.length === 0) return [];

  const eventIds = rows.map((row) => Number(row.unit_audit_event_id));
  const [changeRows] = await connection.query(
    `
      SELECT
        unit_audit_event_change_id,
        unit_audit_event_id,
        field_key,
        field_label,
        change_type,
        old_value_text,
        new_value_text,
        old_value_json,
        new_value_json,
        sort_order
      FROM unit_audit_event_changes
      WHERE unit_audit_event_id IN (${eventIds.map(() => '?').join(', ')})
      ORDER BY unit_audit_event_id, sort_order, unit_audit_event_change_id
    `,
    eventIds
  );

  const changesByEvent = new Map();
  changeRows.forEach((row) => {
    const eventId = Number(row.unit_audit_event_id);
    if (!changesByEvent.has(eventId)) changesByEvent.set(eventId, []);
    changesByEvent.get(eventId).push({
      changeId: Number(row.unit_audit_event_change_id),
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      changeType: row.change_type,
      oldValueText: row.old_value_text || '',
      newValueText: row.new_value_text || '',
      oldValue: row.old_value_json,
      newValue: row.new_value_json,
      sortOrder: Number(row.sort_order || 0)
    });
  });

  return rows.map((row) => ({
    eventId: Number(row.unit_audit_event_id),
    unitId: Number(row.unit_id),
    actorUserId: normalizeNullablePositiveInteger(row.actor_user_id),
    actorName: String(row.actor_name || '').trim() || (row.actor_user_id ? 'User not recorded' : 'System'),
    eventType: row.event_type,
    eventSource: row.event_source,
    eventSummary: row.event_summary,
    correlationKey: row.correlation_key,
    metadata: row.event_metadata_json || null,
    occurredAt: row.occurred_at,
    changes: changesByEvent.get(Number(row.unit_audit_event_id)) || []
  }));
}

module.exports = {
  createUnitAuditEvent,
  enrichLotHierarchyMetadata,
  getUnitCreationContext,
  insertEventWithConnection,
  listUnitAuditEvents,
  normalizeEvent
};
