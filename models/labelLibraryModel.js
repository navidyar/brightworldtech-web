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

async function listLabelTemplates({ includeArchived = true, printScope = null } = {}, connection = null) {
  const db = connection || getDefaultConnection();
  const conditions = [];
  const params = [];
  if (!includeArchived) conditions.push("template.status <> 'archived'");
  if (printScope) {
    conditions.push('template.print_scope = ?');
    params.push(String(printScope));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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
      COALESCE(asset_usage.total_bytes, 0) AS total_bytes,
      COALESCE(asset_usage.has_config, 0) AS has_config
    FROM label_templates template
    LEFT JOIN (
      SELECT assignment.label_template_id, COUNT(*) AS attached_lot_count
      FROM effective_sources source
      INNER JOIN lot_label_templates assignment
        ON assignment.lot_id = source.ancestor_lot_id
      GROUP BY assignment.label_template_id
    ) lot_usage ON lot_usage.label_template_id = template.label_template_id
    LEFT JOIN (
      SELECT
        links.label_template_id,
        SUM(CASE WHEN asset.mime_type = 'application/json' THEN asset.byte_size ELSE 0 END) AS json_bytes,
        SUM(CASE WHEN asset.mime_type <> 'application/json' THEN asset.byte_size ELSE 0 END) AS image_bytes,
        SUM(asset.byte_size) AS total_bytes,
        MAX(CASE WHEN links.role = 'config_json' THEN 1 ELSE 0 END) AS has_config
      FROM label_template_asset_links links
      INNER JOIN label_assets asset ON asset.asset_id = links.asset_id
      GROUP BY links.label_template_id
    ) asset_usage ON asset_usage.label_template_id = template.label_template_id
    ${where}
    ORDER BY
      template.library_sort_order ASC,
      template.label_template_id ASC
  `, params);

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

async function getTemplateAssetByRole(labelTemplateId, role, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const normalizedRole = String(role || '').trim();
  if (!normalizedRole) throw new Error('Label template asset role is required.');
  const [rows] = await db.query(
    `SELECT link.*, asset.*
     FROM label_template_asset_links link
     INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
     WHERE link.label_template_id = ? AND link.role = ?
     ORDER BY link.sort_order, link.label_template_asset_link_id
     LIMIT 1`,
    [id, normalizedRole]
  );
  return rows[0] || null;
}

async function listCurrentTemplateConfigAssets(connection = null) {
  const db = connection || getDefaultConnection();
  const [rows] = await db.query(
    `SELECT
       template.label_template_id,
       template.name AS template_name,
       template.status AS template_status,
       template.updated_at AS template_updated_at,
       asset.asset_id,
       asset.storage_relative_path,
       asset.mime_type
     FROM label_templates template
     INNER JOIN label_template_asset_links link
       ON link.label_template_id = template.label_template_id
      AND link.role = 'config_json'
     INNER JOIN label_assets asset ON asset.asset_id = link.asset_id
     WHERE template.status IN ('draft', 'active')
       AND asset.status = 'active'
       AND asset.mime_type = 'application/json'
     ORDER BY template.updated_at DESC, template.label_template_id DESC`
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
       CASE WHEN template.status = 'active' THEN 1 ELSE 0 END AS is_active
     FROM effective_sources source
     INNER JOIN lots target ON target.lot_id = source.target_lot_id
     INNER JOIN lots sourceLot ON sourceLot.lot_id = source.ancestor_lot_id
     INNER JOIN lot_label_templates assignment
       ON assignment.lot_id = source.ancestor_lot_id
      AND assignment.label_template_id = ?
     INNER JOIN label_templates template ON template.label_template_id = assignment.label_template_id
     ORDER BY target.name, target.lot_id`,
    [id]
  );
  return rows.map((row) => ({
    ...row,
    is_inherited: Number(row.lot_id) !== Number(row.source_lot_id)
  }));
}

async function getNextLabelTemplateLibrarySortOrder(connection = null) {
  const db = connection || getDefaultConnection();
  const [[row]] = await db.query('SELECT COALESCE(MAX(library_sort_order), 0) + 10 AS next_sort_order FROM label_templates');
  return Math.max(10, Number(row?.next_sort_order || 10));
}

async function createLabelTemplate(data, actorUserId, connection = null) {
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const geometry = data.mediaGeometry || {};
    const librarySortOrder = await getNextLabelTemplateLibrarySortOrder(db);
    const [result] = await db.query(
      `INSERT INTO label_templates
        (name, description, category_code, print_scope, status, printer_profile_code, media_code, dpi,
         canvas_width_dots, canvas_height_dots, printable_width_dots, horizontal_offset_dots,
         feed_margin_dots, library_sort_order, new_until, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? DAY), ?, ?)`,
      [data.name, data.description || null, data.categoryCode, data.printScope, geometry.printerProfileCode || null,
       geometry.mediaCode || null, geometry.dpi || null, geometry.canvasWidthDots || null,
       geometry.canvasHeightDots || null, geometry.printableWidthDots || null,
       geometry.horizontalOffsetDots ?? null, geometry.feedMarginDots || null, librarySortOrder,
       LABEL_TEMPLATE_NEW_BADGE_DAYS, actorId, actorId]
    );
    const id = Number(result.insertId);
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_created',
      entityType: 'label_template',
      entityId: id,
      entityName: data.name,
      details: { categoryCode: data.categoryCode, printScope: data.printScope, status: 'draft' }
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
       SET name = ?, description = ?, category_code = ?, print_scope = ?, updated_by_user_id = ?
       WHERE label_template_id = ?`,
      [data.name, data.description || null, data.categoryCode, data.printScope, actorId, id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_updated',
      entityType: 'label_template',
      entityId: id,
      entityName: data.name,
      details: {
        previous: { name: existing.name, description: existing.description, categoryCode: existing.category_code, printScope: existing.print_scope },
        current: { name: data.name, description: data.description || null, categoryCode: data.categoryCode, printScope: data.printScope }
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
      eventType: status === 'active'
        ? 'template_activated'
        : status === 'archived'
          ? 'template_archived'
          : template.status === 'archived' && status === 'draft'
            ? 'template_unarchived'
            : 'template_status_changed',
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
        (name, description, category_code, print_scope, status, cloned_from_template_id,
         printer_profile_code, media_code, dpi, canvas_width_dots, canvas_height_dots,
         printable_width_dots, horizontal_offset_dots, feed_margin_dots, revision, library_sort_order,
         new_until, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?,
         DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? DAY), ?, ?)`,
      [
        `${source.name} Copy`.slice(0, 160), source.description, source.category_code, source.print_scope || 'lot', sourceId,
        source.printer_profile_code, source.media_code, source.dpi, source.canvas_width_dots,
        source.canvas_height_dots, source.printable_width_dots, source.horizontal_offset_dots,
        source.feed_margin_dots, await getNextLabelTemplateLibrarySortOrder(connection), LABEL_TEMPLATE_NEW_BADGE_DAYS, actorId, actorId
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
      if (String(asset.role) !== 'config_json') continue;
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


async function replaceTemplateConfigAsset(labelTemplateId, storedAsset, actorUserId, geometry, reusableAssetLinks = [], connection = null) {
  const id = normalizePositiveInteger(labelTemplateId, 'Label template ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const template = await getLabelTemplateById(id, db);
    if (!template) return null;

    const previous = await getTemplateAssetByRole(id, 'config_json', db);
    if (previous && String(previous.sha256 || '').toLowerCase() === String(storedAsset.sha256 || '').toLowerCase()) {
      return {
        template,
        asset: previous,
        orphanedPreviousAsset: null,
        changed: false
      };
    }

    await db.query(
      `UPDATE label_templates
       SET printer_profile_code = ?, media_code = ?, dpi = ?, canvas_width_dots = ?, canvas_height_dots = ?,
           printable_width_dots = ?, horizontal_offset_dots = ?, feed_margin_dots = ?, updated_by_user_id = ?
       WHERE label_template_id = ?`,
      [geometry.printerProfileCode, geometry.mediaCode, geometry.dpi, geometry.canvasWidthDots, geometry.canvasHeightDots,
       geometry.printableWidthDots, geometry.horizontalOffsetDots, geometry.feedMarginDots, actorId, id]
    );
    await db.query(
      `INSERT INTO label_assets
        (name, asset_kind, status, sha256, storage_relative_path, mime_type, byte_size,
         source_filename, created_by_user_id, updated_by_user_id)
       VALUES (?, 'config_json', 'active', ?, ?, 'application/json', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE asset_id = LAST_INSERT_ID(asset_id), updated_by_user_id = VALUES(updated_by_user_id)`,
      [`${template.name} Layout`, storedAsset.sha256, storedAsset.relativePath, storedAsset.byteSize,
       `label-template-${id}.json`, actorId, actorId]
    );
    const [[asset]] = await db.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [storedAsset.sha256]);

    await db.query("DELETE FROM label_template_asset_links WHERE label_template_id = ? AND role = 'config_json'", [id]);
    await db.query(
      `INSERT INTO label_template_asset_links
        (label_template_id, asset_id, asset_key, role, sort_order, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, 'config', 'config_json', 10, ?, ?)`,
      [id, asset.asset_id, actorId, actorId]
    );

    await db.query("DELETE FROM label_template_asset_links WHERE label_template_id = ? AND role = 'layout_asset'", [id]);
    const uniqueLayoutAssets = [];
    const seenLayoutKeys = new Set();
    for (const link of Array.isArray(reusableAssetLinks) ? reusableAssetLinks : []) {
      const assetId = Number(link?.assetId);
      const assetKey = String(link?.assetKey || '').trim();
      if (!Number.isSafeInteger(assetId) || assetId <= 0 || !/^shared_[a-f0-9]{64}$/.test(assetKey) || seenLayoutKeys.has(assetKey)) continue;
      seenLayoutKeys.add(assetKey);
      uniqueLayoutAssets.push({ assetId, assetKey });
    }
    for (let index = 0; index < uniqueLayoutAssets.length; index += 1) {
      const link = uniqueLayoutAssets[index];
      await db.query(
        `INSERT INTO label_template_asset_links
          (label_template_id, asset_id, asset_key, role, sort_order, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, 'layout_asset', ?, ?, ?)`,
        [id, link.assetId, link.assetKey, 20 + index, actorId, actorId]
      );
    }
    await db.query(
      `UPDATE label_templates SET revision = revision + 1, updated_by_user_id = ? WHERE label_template_id = ?`,
      [actorId, id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_layout_saved',
      entityType: 'label_template',
      entityId: id,
      entityName: template.name,
      details: { configSha256: storedAsset.sha256, reusableAssetIds: uniqueLayoutAssets.map((link) => link.assetId) }
    }, db);

    let orphanedPreviousAsset = null;
    if (previous && Number(previous.asset_id) !== Number(asset.asset_id)) {
      const [[usage]] = await db.query(
        'SELECT COUNT(*) AS reference_count FROM label_template_asset_links WHERE asset_id = ?',
        [previous.asset_id]
      );
      if (Number(usage.reference_count) === 0) {
        await db.query('DELETE FROM label_assets WHERE asset_id = ?', [previous.asset_id]);
        orphanedPreviousAsset = {
          assetId: Number(previous.asset_id),
          relativePath: previous.storage_relative_path
        };
      }
    }

    return {
      template: await getLabelTemplateById(id, db),
      asset,
      orphanedPreviousAsset,
      changed: true
    };
  });
}



async function createOrReuseLabelAsset({ storedAsset, name, assetKind, mimeType, sourceFilename, widthPixels, heightPixels, hasTransparency, actorUserId }, connection = null) {
  if (!storedAsset || !storedAsset.sha256 || !storedAsset.relativePath) {
    throw new Error('Stored label asset metadata is required.');
  }
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  const safeKind = String(assetKind || '').trim();
  const safeName = String(name || '').trim();
  const safeMime = String(mimeType || '').trim().toLowerCase();
  const safeFilename = String(sourceFilename || '').trim();

  return runWithOptionalTransaction(connection, async (db) => {
    const existing = await getLabelAssetBySha256(storedAsset.sha256, db);
    if (existing) {
      await writeAuditEvent({
        actorUserId: actorId,
        eventType: 'shared_asset_reused',
        entityType: 'label_asset',
        entityId: Number(existing.asset_id),
        entityName: existing.name || safeName || safeFilename,
        details: { sha256: storedAsset.sha256, requestedName: safeName, requestedKind: safeKind }
      }, db);
      return { asset: existing, created: false };
    }

    await db.query(
      `INSERT INTO label_assets
        (name, asset_kind, status, sha256, storage_relative_path, mime_type, byte_size,
         width_pixels, height_pixels, has_transparency, source_filename, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [safeName, safeKind, storedAsset.sha256, storedAsset.relativePath, safeMime, storedAsset.byteSize,
       widthPixels || null, heightPixels || null, hasTransparency === null ? null : (hasTransparency ? 1 : 0),
       safeFilename || null, actorId, actorId]
    );
    const asset = await getLabelAssetBySha256(storedAsset.sha256, db);
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'shared_asset_uploaded',
      entityType: 'label_asset',
      entityId: Number(asset.asset_id),
      entityName: safeName,
      details: {
        sha256: storedAsset.sha256,
        assetKind: safeKind,
        mimeType: safeMime,
        byteSize: Number(storedAsset.byteSize || 0),
        widthPixels: widthPixels || null,
        heightPixels: heightPixels || null,
        sourceFilename: safeFilename || null
      }
    }, db);
    return { asset, created: true };
  });
}

async function getLabelAssetBySha256(sha256, connection = null) {
  const db = connection || getDefaultConnection();
  const hash = String(sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const [rows] = await db.query('SELECT * FROM label_assets WHERE sha256 = ? LIMIT 1', [hash]);
  return rows[0] || null;
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
    ORDER BY
      CASE
        WHEN asset.mime_type = 'application/json' OR asset.asset_kind LIKE '%_json' THEN 90
        WHEN asset.asset_kind = 'logo' THEN 10
        WHEN asset.asset_kind = 'image' THEN 20
        WHEN asset.asset_kind = 'background' THEN 30
        ELSE 80
      END,
      asset.name IS NULL, asset.name ASC, asset.created_at DESC, asset.asset_id DESC
  `);
  return rows;
}

async function getRepositoryStorageSummary(connection = null) {
  const db = connection || getDefaultConnection();
  const [[row]] = await db.query(`
    SELECT COUNT(*) AS asset_count,
      COALESCE(SUM(byte_size), 0) AS total_bytes,
      COALESCE(SUM(CASE WHEN mime_type = 'application/json' THEN byte_size ELSE 0 END), 0) AS json_bytes,
      COALESCE(SUM(CASE WHEN mime_type <> 'application/json' THEN byte_size ELSE 0 END), 0) AS image_bytes
    FROM label_assets
  `);
  return row;
}

async function reorderLabelTemplates(orderedTemplateIds, actorUserId, connection = null) {
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  const orderedIds = Array.isArray(orderedTemplateIds)
    ? orderedTemplateIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    : [];
  if (!orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('A complete unique template order is required.');
  }

  return runWithOptionalTransaction(connection, async (db) => {
    const [rows] = await db.query('SELECT label_template_id FROM label_templates ORDER BY library_sort_order, label_template_id');
    const existingIds = rows.map((row) => Number(row.label_template_id));
    if (existingIds.length !== orderedIds.length || existingIds.some((id) => !orderedIds.includes(id))) {
      throw new Error('Template order changed while you were editing. Refresh the Label Library and try again.');
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      await db.query(
        'UPDATE label_templates SET library_sort_order = ?, updated_by_user_id = ? WHERE label_template_id = ?',
        [(index + 1) * 10, actorId, orderedIds[index]]
      );
    }
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'template_library_reordered',
      entityType: 'label_template_library',
      details: { orderedTemplateIds: orderedIds }
    }, db);
    return orderedIds;
  });
}

async function updateLabelAssetMetadata(assetId, { name, assetKind }, actorUserId, connection = null) {
  const id = normalizePositiveInteger(assetId, 'Label asset ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  const safeName = String(name || '').trim();
  const safeKind = String(assetKind || '').trim().toLowerCase();
  if (!safeName) throw new Error('Asset name is required.');
  if (safeName.length > 160) throw new Error('Asset name must be 160 characters or fewer.');
  if (!['logo', 'image', 'background'].includes(safeKind)) {
    throw new Error('Choose Logo, Image, or Background for the asset type.');
  }

  return runWithOptionalTransaction(connection, async (db) => {
    const asset = await getLabelAssetById(id, db);
    if (!asset) return null;
    const mimeType = String(asset.mime_type || '');
    if (!['image/png', 'image/svg+xml'].includes(mimeType)) {
      throw new Error('Generated layout/configuration assets are managed by template history and cannot be edited manually.');
    }
    const previousName = String(asset.name || asset.source_filename || `Asset ${id}`);
    const previousKind = String(asset.asset_kind || 'image');
    await db.query(
      'UPDATE label_assets SET name = ?, asset_kind = ?, updated_by_user_id = ? WHERE asset_id = ?',
      [safeName, safeKind, actorId, id]
    );
    await writeAuditEvent({
      actorUserId: actorId,
      eventType: previousKind === safeKind ? 'shared_asset_renamed' : 'shared_asset_reclassified',
      entityType: 'label_asset',
      entityId: id,
      entityName: safeName,
      details: {
        previousName,
        newName: safeName,
        previousKind,
        newKind: safeKind
      }
    }, db);
    return getLabelAssetById(id, db);
  });
}

async function renameLabelAsset(assetId, name, actorUserId, connection = null) {
  const asset = await getLabelAssetById(assetId, connection);
  if (!asset) return null;
  return updateLabelAssetMetadata(assetId, {
    name,
    assetKind: asset.asset_kind
  }, actorUserId, connection);
}

async function listLabelAssetTemplateUsage(assetId, connection = null) {
  const db = connection || getDefaultConnection();
  const id = normalizePositiveInteger(assetId, 'Label asset ID');
  const [rows] = await db.query(
    `SELECT link.label_template_asset_link_id, link.role, link.asset_key,
       template.label_template_id, template.name AS template_name, template.status AS template_status
     FROM label_template_asset_links link
     INNER JOIN label_templates template ON template.label_template_id = link.label_template_id
     WHERE link.asset_id = ?
     ORDER BY FIELD(template.status, 'active', 'draft', 'archived'), template.library_sort_order, template.label_template_id`,
    [id]
  );
  return rows;
}

async function deleteLabelAsset(assetId, actorUserId, { confirmActiveUsage = false } = {}, connection = null) {
  const id = normalizePositiveInteger(assetId, 'Label asset ID');
  const actorId = normalizePositiveInteger(actorUserId, 'User ID');
  return runWithOptionalTransaction(connection, async (db) => {
    const asset = await getLabelAssetById(id, db);
    if (!asset) return null;
    const mimeType = String(asset.mime_type || '');
    if (!['image/png', 'image/svg+xml'].includes(mimeType)) {
      throw new Error('Generated layout/configuration assets are managed by template history and cannot be deleted manually.');
    }
    const usage = await listLabelAssetTemplateUsage(id, db);
    const activeUsage = usage.filter((row) => String(row.template_status) === 'active');
    if (activeUsage.length && !confirmActiveUsage) {
      const error = new Error('Type DELETE to confirm removal of an asset used by Active label templates.');
      error.code = 'LABEL_ASSET_ACTIVE_CONFIRM_REQUIRED';
      throw error;
    }

    await writeAuditEvent({
      actorUserId: actorId,
      eventType: 'shared_asset_deleted',
      entityType: 'label_asset',
      entityId: id,
      entityName: asset.name || asset.source_filename || `Asset ${id}`,
      details: {
        mimeType,
        sha256: asset.sha256,
        affectedTemplates: usage.map((row) => ({
          labelTemplateId: Number(row.label_template_id),
          templateName: row.template_name,
          status: row.template_status,
          role: row.role,
          assetKey: row.asset_key
        }))
      }
    }, db);
    await db.query('DELETE FROM label_template_asset_links WHERE asset_id = ?', [id]);
    await db.query('DELETE FROM label_assets WHERE asset_id = ?', [id]);
    return { asset, usage, activeUsage };
  });
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
  const selectedIds = [...new Set((Array.isArray(assignments) ? assignments : []).map((assignment) => Number(assignment.labelTemplateId)).filter(Number.isSafeInteger))];
  if (selectedIds.length > 0) {
    const placeholders = selectedIds.map(() => '?').join(',');
    const [invalidScopeRows] = await db.query(
      `SELECT label_template_id, name
       FROM label_templates
       WHERE label_template_id IN (${placeholders}) AND print_scope <> 'lot'`,
      selectedIds
    );
    if (invalidScopeRows.length > 0) {
      throw new Error(`Standalone label templates cannot be assigned to Lots: ${invalidScopeRows.map((row) => row.name).join(', ')}.`);
    }
  }
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
       assignment.sortOrder, 1, actorId, actorId]
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
  getTemplateAssetByRole,
  listCurrentTemplateConfigAssets,
  listTemplateLotAttachments,
  listEffectiveTemplateLotUsage,
  createLabelTemplate,
  updateLabelTemplate,
  setLabelTemplateStatus,
  cloneLabelTemplate,
  deleteLabelTemplate,
  replaceTemplateConfigAsset,
  createOrReuseLabelAsset,
  getLabelAssetById,
  getLabelAssetBySha256,
  listLabelAssets,
  getRepositoryStorageSummary,
  reorderLabelTemplates,
  listLabelAssetTemplateUsage,
  updateLabelAssetMetadata,
  renameLabelAsset,
  deleteLabelAsset,
  writeAuditEvent,
  listDirectSetsForLineage,
  getDirectLotTemplateSet,
  getEffectiveLotTemplateSet,
  replaceLotTemplateSet,
  resetLotTemplateSet,
  copyLotTemplateSetForDuplicate
};
