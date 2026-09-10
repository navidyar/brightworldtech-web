'use strict';

const { pool } = require('./db');
const { getLotLineage } = require('./lotUnitFormProfileModel');
const {
  resolveEffectiveLotLabelTemplateSet,
  buildLotLabelTemplateBehaviorSignature
} = require('../services/lotLabelTemplateResolver');
const { LABEL_TEMPLATE_NEW_BADGE_DAYS } = require('../config/labelLibrary');

function getDefaultConnection() {
  return pool;
}

function normalizePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function normalizeNullableUserId(value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizePositiveInteger(value, 'User ID');
}

async function runWithOptionalTransaction(connection, work) {
  if (connection) return work(connection);

  const ownedConnection = await pool.getConnection();
  try {
    await ownedConnection.beginTransaction();
    const result = await work(ownedConnection);
    await ownedConnection.commit();
    return result;
  } catch (error) {
    await ownedConnection.rollback();
    throw error;
  } finally {
    ownedConnection.release();
  }
}

async function writeAuditEvent({ actorUserId = null, eventType, entityType, entityId = null, entityName = null, details = null }, connection = null) {
  const db = connection || getDefaultConnection();
  await db.query(
    `INSERT INTO label_library_audit_events
      (actor_user_id, event_type, entity_type, entity_id, entity_name_snapshot, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizeNullableUserId(actorUserId),
      String(eventType || '').trim(),
      String(entityType || '').trim(),
      entityId === null ? null : Number(entityId),
      entityName ? String(entityName).slice(0, 160) : null,
      details ? JSON.stringify(details) : null
    ]
  );
}

async function listLabelTemplates({ includeArchived = true } = {}, connection = null) {
  const db = connection || getDefaultConnection();
  const where = includeArchived ? '' : "WHERE template.status <> 'archived'";
  const [rows] = await db.query(`
    WITH RECURSIVE lot_ancestry AS (
      SELECT lot.lot_id AS target_lot_id, lot.lot_id AS ancestor_lot_id, lot.parent_lot_id, 0 AS depth
      FROM lots lot
      UNION ALL
      SELECT ancestry.target_lot_id, parent.lot_id, parent.parent_lot_id, ancestry.depth + 1
      FROM lot_ancestry ancestry
      INNER JOIN lots parent ON parent.lot_id = ancestry.parent_lot_id
      WHERE ancestry.depth < 100
    ),
    configured_sources AS (
      SELECT
        ancestry.target_lot_id,
        ancestry.ancestor_lot_id,
        ROW_NUMBER() OVER (PARTITION BY ancestry.target_lot_id ORDER BY ancestry.depth) AS source_rank
      FROM lot_ancestry ancestry
      INNER JOIN lot_label_template_sets setrow ON setrow.lot_id = ancestry.ancestor_lot_id
    ),
    effective_sources AS (
      SELECT target_lot_id, ancestor_lot_id
      FROM configured_sources
      WHERE source_rank = 1
    )
    SELECT
      template.*,
      COALESCE(lot_usage.attached_lot_count, 0) AS attached_lot_count,
      COALESCE(asset_usage.image_bytes, 0) AS image_bytes,
      COALESCE(asset_usage.json_bytes, 0) AS json_bytes,
      COALESCE(asset_usage.preview_bytes, 0) AS preview_bytes,
      COALESCE(asset_usage.total_bytes, 0) AS total_bytes,
      COALESCE(asset_usage.has_config, 0) AS has_config,
      COALESCE(asset_usage.has_preview, 0) AS has_preview,
      asset_usage.preview_asset_id AS preview_asset_id
    FROM label_templates template
    LEFT JOIN (
      SELECT assignment.label_template_id, COUNT(*) AS attached_lot_count
      FROM effective_sources source
      INNER JOIN lot_label_templates assignment
        ON assignment.lot_id = source.ancestor_lot_id
       AND assignment.is_active = 1
      GROUP BY assignment.label_template_id
    ) lot_usage ON lot_usage.label_template_id = template.label_template_id
    LEFT JOIN (
      SELECT
        links.label_template_id,
        SUM(CASE WHEN links.role = 'config_json' THEN asset.byte_size ELSE 0 END) AS json_bytes,
        SUM(CASE WHEN links.role = 'preview' THEN asset.byte_size ELSE 0 END) AS preview_bytes,
        SUM(CASE WHEN links.role NOT IN ('config_json', 'preview') THEN asset.byte_size ELSE 0 END) AS image_bytes,
        SUM(asset.byte_size) AS total_bytes,
        MAX(CASE WHEN links.role = 'config_json' THEN 1 ELSE 0 END) AS has_config,
        MAX(CASE WHEN links.role = 'preview' THEN 1 ELSE 0 END) AS has_preview,
        MAX(CASE WHEN links.role = 'preview' THEN asset.asset_id ELSE NULL END) AS preview_asset_id
      FROM label_template_asset_links links
      INNER JOIN label_assets asset ON asset.asset_id = links.asset_id
      GROUP BY links.label_template_id
    ) asset_usage ON asset_usage.label_template_id = template.label_template_id
    ${where}
    ORDER BY
      CASE WHEN template.new_until IS NOT NULL AND template.new_until > CURRENT_TIMESTAMP(6) THEN 0 ELSE 1 END,
      COALESCE(lot_usage.attached_lot_count, 0) DESC,
      template.print_count DESC,
      template.last_used_at DESC,
      template.name ASC,
      template.label_template_id ASC
  `);

  return rows;
}

async function getLabelTemplateById(labelTemplateId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const [rows] = await db.query(
    `SELECT template.*,
       EXISTS(
         SELECT 1 FROM label_template_asset_links link
         WHERE link.label_template_id = template.label_template_id AND link.role = 'config_json'
       ) AS has_config
     FROM label_templates template
     WHERE template.label_template_id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function getInitialRegisteredLabelTemplate(connection = null) {
  const db = connection || getDefaultConnection();
  const [rows] = await db.query(
    `SELECT template.*
     FROM label_library_audit_events event
     INNER JOIN label_templates template
       ON template.label_template_id = event.entity_id
     WHERE event.event_type = 'initial_template_registered'
       AND event.entity_type = 'label_template'
     ORDER BY event.label_library_audit_event_id
     LIMIT 1`
  );
  return rows[0] || null;
}

async function listTemplateAssets(labelTemplateId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const [rows] = await db.query(
    `SELECT link.*, asset.*
     FROM label_template_asset_links link
     INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
     WHERE link.label_template_id = ?
     ORDER BY link.sort_order, link.label_template_asset_link_id`,
    [id]
  );
  return rows;
}

async function listTemplateLotAttachments(labelTemplateId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const [rows] = await db.query(
    `SELECT assignment.*, lot.name AS lot_name
     FROM lot_label_templates assignment
     INNER JOIN lots lot ON lot.lot_id = assignment.lot_id
     WHERE assignment.label_template_id = ?
     ORDER BY lot.name, lot.lot_id`,
    [id]
  );
  return rows;
}

async function listEffectiveTemplateLotUsage(labelTemplateId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const [rows] = await db.query(
    `WITH RECURSIVE lot_ancestry AS (
       SELECT lot.lot_id AS target_lot_id, lot.lot_id AS ancestor_lot_id, lot.parent_lot_id, 0 AS depth
       FROM lots lot
       UNION ALL
       SELECT ancestry.target_lot_id, parent.lot_id, parent.parent_lot_id, ancestry.depth + 1
       FROM lot_ancestry ancestry
       INNER JOIN lots parent ON parent.lot_id = ancestry.parent_lot_id
       WHERE ancestry.depth < 100
     ),
     configured_sources AS (
       SELECT
         ancestry.target_lot_id,
         ancestry.ancestor_lot_id,
         ROW_NUMBER() OVER (PARTITION BY ancestry.target_lot_id ORDER BY ancestry.depth) AS source_rank
       FROM lot_ancestry ancestry
       INNER JOIN lot_label_template_sets setrow ON setrow.lot_id = ancestry.ancestor_lot_id
     ),
     effective_sources AS (
       SELECT target_lot_id, ancestor_lot_id
       FROM configured_sources
       WHERE source_rank = 1
     )
     SELECT
       target.lot_id,
       target.name AS lot_name,
       sourceLot.lot_id AS source_lot_id,
       sourceLot.name AS source_lot_name,
       assignment.is_required,
       assignment.default_quantity,
       assignment.is_active
     FROM effective_sources source
     INNER JOIN lots target ON target.lot_id = source.target_lot_id
     INNER JOIN lots sourceLot ON sourceLot.lot_id = source.ancestor_lot_id
     INNER JOIN lot_label_templates assignment
       ON assignment.lot_id = source.ancestor_lot_id
      AND assignment.label_template_id = ?
     ORDER BY target.name, target.lot_id`,
    [id]
  );
  return rows.map((row) => ({
    ...row,
    is_inherited: Number(row.lot_id) !== Number(row.source_lot_id)
  }));
}

async function createLabelTemplate(data, actorUserId, connection = null) {
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const [result] = await db.query(
      `INSERT INTO label_templates
        (name, description, category_code, status, new_until, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, 'draft', DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? DAY), ?, ?)`,
      [data.name, data.description || null, data.categoryCode, LABEL_TEMPLATE_NEW_BADGE_DAYS, actorId, actorId]
    );
    const id = Number(result.insertId);
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_created',
      entityType: 'label_template',
      entityId: id,
      entityName: data.name,
      details: { categoryCode: data.categoryCode, status: 'draft' }
    }, db);
    return getLabelTemplateById(id, db);
  });
}

async function updateLabelTemplate(labelTemplateId, data, actorUserId, connection = null) {
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const existing = await getLabelTemplateById(id, db);
    if (!existing) return null;

    await db.query(
      `UPDATE label_templates
       SET name = ?, description = ?, category_code = ?, updated_by_user_id = ?
       WHERE label_template_id = ?`,
      [data.name, data.description || null, data.categoryCode, actorId, id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_updated',
      entityType: 'label_template',
      entityId: id,
      entityName: data.name,
      details: {
        previous: { name: existing.name, description: existing.description, categoryCode: existing.category_code },
        current: { name: data.name, description: data.description || null, categoryCode: data.categoryCode }
      }
    }, db);
    return getLabelTemplateById(id, db);
  });
}

async function setLabelTemplateStatus(labelTemplateId, status, actorUserId, connection = null) {
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const template = await getLabelTemplateById(id, db);
    if (!template) return null;
    if (status === 'active' && Number(template.has_config || 0) !== 1) {
      const error = new Error('A template needs a saved layout configuration before it can be activated.');
      error.code = 'LABEL_TEMPLATE_CONFIG_REQUIRED';
      throw error;
    }

    const activatedAt = status === 'active' ? 'CURRENT_TIMESTAMP(6)' : 'activated_at';
    const archivedAt = status === 'archived' ? 'CURRENT_TIMESTAMP(6)' : 'NULL';
    await db.query(
      `UPDATE label_templates
       SET status = ?, activated_at = ${activatedAt}, archived_at = ${archivedAt}, updated_by_user_id = ?
       WHERE label_template_id = ?`,
      [status, actorId, id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: status === 'active' ? 'template_activated' : status === 'archived' ? 'template_archived' : 'template_status_changed',
      entityType: 'label_template',
      entityId: id,
      entityName: template.name,
      details: { previousStatus: template.status, status }
    }, db);
    return getLabelTemplateById(id, db);
  });
}

async function cloneLabelTemplate(labelTemplateId, actorUserId) {
  const sourceId = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const source = await getLabelTemplateById(sourceId, connection);
    if (!source) throw new Error('The source label template could not be found.');

    const [result] = await connection.query(
      `INSERT INTO label_templates
        (name, description, category_code, status, cloned_from_template_id,
         printer_profile_code, media_code, dpi, canvas_width_dots, canvas_height_dots,
         printable_width_dots, horizontal_offset_dots, feed_margin_dots, revision,
         new_until, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
         DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? DAY), ?, ?)`,
      [
        `${source.name} Copy`.slice(0, 160), source.description, source.category_code, sourceId,
        source.printer_profile_code, source.media_code, source.dpi, source.canvas_width_dots,
        source.canvas_height_dots, source.printable_width_dots, source.horizontal_offset_dots,
        source.feed_margin_dots, LABEL_TEMPLATE_NEW_BADGE_DAYS, actorId, actorId
      ]
    );
    const cloneId = Number(result.insertId);
    await connection.query(
      `INSERT INTO label_template_asset_links
        (label_template_id, asset_id, asset_key, role, sort_order, created_by_user_id, updated_by_user_id)
       SELECT ?, asset_id, asset_key, role, sort_order, ?, ?
       FROM label_template_asset_links
       WHERE label_template_id = ?`,
      [cloneId, actorId, actorId, sourceId]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_cloned',
      entityType: 'label_template',
      entityId: cloneId,
      entityName: `${source.name} Copy`.slice(0, 160),
      details: { sourceTemplateId: sourceId, sourceTemplateName: source.name }
    }, connection);
    await connection.commit();
    return getLabelTemplateById(cloneId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteLabelTemplate(labelTemplateId, actorUserId) {
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const template = await getLabelTemplateById(id, connection);
    if (!template) return null;
    const [lots, linkedAssets] = await Promise.all([
      listEffectiveTemplateLotUsage(id, connection),
      listTemplateAssets(id, connection)
    ]);

    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_deleted',
      entityType: 'label_template',
      entityId: id,
      entityName: template.name,
      details: {
        status: template.status,
        affectedLots: lots.map((lot) => ({ lotId: Number(lot.lot_id), lotName: lot.lot_name })),
        assetIds: linkedAssets.map((asset) => Number(asset.asset_id))
      }
    }, connection);

    await connection.query('DELETE FROM label_templates WHERE label_template_id = ?', [id]);

    const orphanedTransientAssets = [];
    for (const asset of linkedAssets) {
      if (!['config_json', 'preview', 'original_sample'].includes(String(asset.role))) continue;
      const [[usage]] = await connection.query(
        'SELECT COUNT(*) AS reference_count FROM label_template_asset_links WHERE asset_id = ?',
        [asset.asset_id]
      );
      if (Number(usage.reference_count) !== 0) continue;
      await connection.query('DELETE FROM label_assets WHERE asset_id = ?', [asset.asset_id]);
      orphanedTransientAssets.push({
        assetId: Number(asset.asset_id),
        relativePath: asset.storage_relative_path,
        role: asset.role
      });
    }

    await connection.commit();
    return { template, lots, orphanedTransientAssets };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getLabelAssetById(assetId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(assetId, 'Label asset ID');
  const [rows] = await db.query('SELECT * FROM label_assets WHERE asset_id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function listLabelAssets({ includeArchived = true } = {}, connection = null) {
  const db = connection || getDefaultConnection();
  const where = includeArchived ? '' : "WHERE asset.status <> 'archived'";
  const [rows] = await db.query(`
    SELECT asset.*, COALESCE(template_usage.template_count, 0) AS template_count
    FROM label_assets asset
    LEFT JOIN (
      SELECT asset_id, COUNT(DISTINCT label_template_id) AS template_count
      FROM label_template_asset_links GROUP BY asset_id
    ) template_usage ON template_usage.asset_id = asset.asset_id
    ${where}
    ORDER BY asset.name IS NULL, asset.name ASC, asset.created_at DESC, asset.asset_id DESC
  `);
  return rows;
}

async function getRepositoryStorageSummary(connection = null) {
  const db = connection || getDefaultConnection();
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS asset_count,
      COALESCE(SUM(byte_size), 0) AS total_bytes,
      COALESCE(SUM(CASE WHEN asset_kind = 'config_json' THEN byte_size ELSE 0 END), 0) AS json_bytes,
      COALESCE(SUM(CASE WHEN asset_kind = 'preview' THEN byte_size ELSE 0 END), 0) AS preview_bytes,
      COALESCE(SUM(CASE WHEN asset_kind NOT IN ('config_json', 'preview') THEN byte_size ELSE 0 END), 0) AS image_bytes
    FROM label_assets
  `);
  return row;
}

async function listDirectSetsForLineage(lineage, connection = null) {
  const db = connection || getDefaultConnection();
  const lotIds = (Array.isArray(lineage) ? lineage : []).map((lot) => Number(lot.lotId)).filter(Boolean);
  if (!lotIds.length) return [];
  const placeholders = lotIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT setrow.lot_id,
       assignment.lot_label_template_id, assignment.label_template_id,
       assignment.is_required, assignment.default_quantity, assignment.sort_order, assignment.is_active,
       template.name AS template_name, template.category_code AS template_category_code,
       template.status AS template_status
     FROM lot_label_template_sets setrow
     LEFT JOIN lot_label_templates assignment ON assignment.lot_id = setrow.lot_id
     LEFT JOIN label_templates template ON template.label_template_id = assignment.label_template_id
     WHERE setrow.lot_id IN (${placeholders})
     ORDER BY FIELD(setrow.lot_id, ${placeholders}), assignment.sort_order, assignment.lot_label_template_id`,
    [...lotIds, ...lotIds]
  );
  const byLotId = new Map();
  for (const row of rows) {
    const lotId = Number(row.lot_id);
    if (!byLotId.has(lotId)) byLotId.set(lotId, { lotId, assignments: [] });
    if (row.label_template_id !== null) byLotId.get(lotId).assignments.push(row);
  }
  return [...byLotId.values()];
}

async function getDirectLotTemplateSet(lotId, connection = null) {
  const id = normalizePositiveInteger(lotId, 'Lot ID');
  const sets = await listDirectSetsForLineage([{ lotId: id }], connection);
  return sets[0] || null;
}

async function getEffectiveLotTemplateSet(lotId, connection = null) {
  const lineage = await getLotLineage(lotId, connection);
  const directSets = await listDirectSetsForLineage(lineage, connection);
  return resolveEffectiveLotLabelTemplateSet({ lineage, directSets });
}

async function replaceLotTemplateSetRows(db, lotId, assignments, actorId) {
  await db.query(
    `INSERT INTO lot_label_template_sets (lot_id, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_by_user_id = VALUES(updated_by_user_id)`,
    [lotId, actorId, actorId]
  );
  await db.query('DELETE FROM lot_label_templates WHERE lot_id = ?', [lotId]);
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    await db.query(
      `INSERT INTO lot_label_templates
        (lot_id, label_template_id, is_required, default_quantity, sort_order, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lotId, assignment.labelTemplateId, assignment.isRequired ? 1 : 0, assignment.defaultQuantity,
       assignment.sortOrder, assignment.isActive ? 1 : 0, actorId, actorId]
    );
  }
  await writeAuditEvent({
    actorUserId: actorId,
    eventType: 'lot_label_set_saved',
    entityType: 'lot',
    entityId: lotId,
    details: { assignments }
  }, db);
  return getDirectLotTemplateSet(lotId, db);
}

async function replaceLotTemplateSet(lotId, assignments, actorUserId, connection = null) {
  const id = normalizePositiveInteger(lotId, 'Lot ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  if (connection) return replaceLotTemplateSetRows(connection, id, assignments, actorId);

  const ownedConnection = await pool.getConnection();
  try {
    await ownedConnection.beginTransaction();
    const result = await replaceLotTemplateSetRows(ownedConnection, id, assignments, actorId);
    await ownedConnection.commit();
    return result;
  } catch (error) {
    await ownedConnection.rollback();
    throw error;
  } finally {
    ownedConnection.release();
  }
}

async function resetLotTemplateSetRows(db, lotId, actorId) {
  const direct = await getDirectLotTemplateSet(lotId, db);
  await db.query('DELETE FROM lot_label_template_sets WHERE lot_id = ?', [lotId]);
  if (direct) {
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'lot_label_set_reset',
      entityType: 'lot',
      entityId: lotId,
      details: { previousAssignments: direct.assignments }
    }, db);
  }
}

async function resetLotTemplateSet(lotId, actorUserId, connection = null) {
  const id = normalizePositiveInteger(lotId, 'Lot ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  if (connection) return resetLotTemplateSetRows(connection, id, actorId);

  const ownedConnection = await pool.getConnection();
  try {
    await ownedConnection.beginTransaction();
    await resetLotTemplateSetRows(ownedConnection, id, actorId);
    await ownedConnection.commit();
  } catch (error) {
    await ownedConnection.rollback();
    throw error;
  } finally {
    ownedConnection.release();
  }
}

async function copyLotTemplateSetForDuplicate({ sourceLotId, targetLotId, inheritanceMode, currentUserId, connection }) {
  const preserveSource = String(inheritanceMode) === 'preserve_source';
  const [sourceDirect, sourceEffective] = await Promise.all([
    getDirectLotTemplateSet(sourceLotId, connection),
    getEffectiveLotTemplateSet(sourceLotId, connection)
  ]);

  if (preserveSource) {
    await replaceLotTemplateSet(targetLotId, sourceEffective.assignments, currentUserId, connection);
  } else if (sourceDirect) {
    await replaceLotTemplateSet(targetLotId, sourceDirect.assignments.map((row) => ({
      labelTemplateId: Number(row.label_template_id),
      isRequired: Number(row.is_required) === 1,
      defaultQuantity: Number(row.default_quantity),
      sortOrder: Number(row.sort_order),
      isActive: Number(row.is_active) === 1
    })), currentUserId, connection);
  }

  const targetEffective = await getEffectiveLotTemplateSet(targetLotId, connection);
  if (preserveSource && JSON.stringify(buildLotLabelTemplateBehaviorSignature(targetEffective))
    !== JSON.stringify(buildLotLabelTemplateBehaviorSignature(sourceEffective))) {
    throw new Error('The duplicate could not preserve the source Lot label behavior. No Lot was created.');
  }

  return {
    sourceHadDirectSet: Boolean(sourceDirect),
    targetHasDirectSet: Boolean(await getDirectLotTemplateSet(targetLotId, connection)),
    materializedEffectiveSet: preserveSource
  };
}

module.exports = {
  listLabelTemplates,
  getLabelTemplateById,
  getInitialRegisteredLabelTemplate,
  listTemplateAssets,
  listTemplateLotAttachments,
  listEffectiveTemplateLotUsage,
  createLabelTemplate,
  updateLabelTemplate,
  setLabelTemplateStatus,
  cloneLabelTemplate,
  deleteLabelTemplate,
  getLabelAssetById,
  listLabelAssets,
  getRepositoryStorageSummary,
  writeAuditEvent,
  listDirectSetsForLineage,
  getDirectLotTemplateSet,
  getEffectiveLotTemplateSet,
  replaceLotTemplateSet,
  resetLotTemplateSet,
  copyLotTemplateSetForDuplicate
};
