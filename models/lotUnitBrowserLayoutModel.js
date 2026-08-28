'use strict';

const { getLotLineage } = require('./lotUnitFormProfileModel');
const {
  buildUnitBrowserLayoutBehaviorSignature,
  resolveEffectiveLotUnitBrowserLayout
} = require('../services/lotUnitBrowserLayoutResolver');

function getDefaultConnection() {
  return require('./db').pool;
}

class LotUnitBrowserLayoutDataError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LotUnitBrowserLayoutDataError';
    this.code = code;
  }
}

function normalizeLotId(lotId) {
  const normalized = Number(lotId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new LotUnitBrowserLayoutDataError('Lot ID must be a positive integer.', 'INVALID_LOT_ID');
  }

  return normalized;
}

function normalizeUserId(userId) {
  const normalized = Number(userId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new LotUnitBrowserLayoutDataError('User ID must be a positive integer.', 'INVALID_USER_ID');
  }

  return normalized;
}

function mapColumnRow(row) {
  return Object.freeze({
    columnId: Number(row.lot_unit_browser_column_id),
    lotId: Number(row.lot_id),
    columnKey: String(row.column_key),
    isVisible: Number(row.is_visible) === 1,
    sortOrder: Number(row.sort_order),
    createdByUserId: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
    updatedByUserId: row.updated_by_user_id === null ? null : Number(row.updated_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function buildLayoutsFromRows(rows) {
  const layoutsByLotId = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const lotId = Number(row.lot_id);
    let layout = layoutsByLotId.get(lotId);

    if (!layout) {
      layout = {
        lotId,
        createdByUserId: row.layout_created_by_user_id === null ? null : Number(row.layout_created_by_user_id),
        updatedByUserId: row.layout_updated_by_user_id === null ? null : Number(row.layout_updated_by_user_id),
        createdAt: row.layout_created_at,
        updatedAt: row.layout_updated_at,
        columns: []
      };
      layoutsByLotId.set(lotId, layout);
    }

    if (row.column_key !== null && row.column_key !== undefined) {
      layout.columns.push(mapColumnRow(row));
    }
  }

  return [...layoutsByLotId.values()].map((layout) => Object.freeze({
    ...layout,
    columns: Object.freeze(layout.columns)
  }));
}

async function listLayoutsForLotLineage(lineage, connection = null) {
  const db = connection || getDefaultConnection();
  const lotIds = (Array.isArray(lineage) ? lineage : []).map((lot) => normalizeLotId(lot.lotId));

  if (lotIds.length === 0) {
    return [];
  }

  const placeholders = lotIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `
      SELECT
        layout.lot_id,
        layout.created_by_user_id AS layout_created_by_user_id,
        layout.updated_by_user_id AS layout_updated_by_user_id,
        layout.created_at AS layout_created_at,
        layout.updated_at AS layout_updated_at,
        col.lot_unit_browser_column_id,
        col.column_key,
        col.is_visible,
        col.sort_order,
        col.created_by_user_id,
        col.updated_by_user_id,
        col.created_at,
        col.updated_at
      FROM lot_unit_browser_layouts layout
      LEFT JOIN lot_unit_browser_columns col ON col.lot_id = layout.lot_id
      WHERE layout.lot_id IN (${placeholders})
      ORDER BY FIELD(layout.lot_id, ${placeholders}), col.sort_order, col.lot_unit_browser_column_id
    `,
    [...lotIds, ...lotIds]
  );

  return buildLayoutsFromRows(rows);
}

async function getDirectLayoutForLot(lotId, connection = null) {
  const db = connection || getDefaultConnection();
  const normalizedLotId = normalizeLotId(lotId);
  const [rows] = await db.query(
    `
      SELECT
        layout.lot_id,
        layout.created_by_user_id AS layout_created_by_user_id,
        layout.updated_by_user_id AS layout_updated_by_user_id,
        layout.created_at AS layout_created_at,
        layout.updated_at AS layout_updated_at,
        col.lot_unit_browser_column_id,
        col.column_key,
        col.is_visible,
        col.sort_order,
        col.created_by_user_id,
        col.updated_by_user_id,
        col.created_at,
        col.updated_at
      FROM lot_unit_browser_layouts layout
      LEFT JOIN lot_unit_browser_columns col ON col.lot_id = layout.lot_id
      WHERE layout.lot_id = ?
      ORDER BY col.sort_order, col.lot_unit_browser_column_id
    `,
    [normalizedLotId]
  );

  return buildLayoutsFromRows(rows)[0] || null;
}

async function getEffectiveLayoutForLot(lotId, connection = null) {
  const normalizedLotId = normalizeLotId(lotId);
  const lineage = await getLotLineage(normalizedLotId, connection);
  const layouts = await listLayoutsForLotLineage(lineage, connection);

  return resolveEffectiveLotUnitBrowserLayout({ lineage, layouts });
}

async function saveLayoutWithinTransaction(db, lotId, columns, userId) {
  const normalizedLotId = normalizeLotId(lotId);
  const normalizedUserId = normalizeUserId(userId);
  const safeColumns = Array.isArray(columns) ? columns : [];
  const [lotRows] = await db.query(
    'SELECT lot_id FROM lots WHERE lot_id = ? FOR UPDATE',
    [normalizedLotId]
  );

  if (lotRows.length === 0) {
    throw new LotUnitBrowserLayoutDataError(`Lot ${normalizedLotId} was not found.`, 'LOT_NOT_FOUND');
  }

  await db.query(
    `
      INSERT INTO lot_unit_browser_layouts (
        lot_id,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        updated_by_user_id = VALUES(updated_by_user_id),
        updated_at = CURRENT_TIMESTAMP(6)
    `,
    [normalizedLotId, normalizedUserId, normalizedUserId]
  );

  await db.query('DELETE FROM lot_unit_browser_columns WHERE lot_id = ?', [normalizedLotId]);

  if (safeColumns.length > 0) {
    const placeholders = safeColumns.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = safeColumns.flatMap((column) => [
      normalizedLotId,
      String(column.columnKey),
      column.isVisible ? 1 : 0,
      Number(column.sortOrder),
      normalizedUserId,
      normalizedUserId
    ]);

    await db.query(
      `
        INSERT INTO lot_unit_browser_columns (
          lot_id,
          column_key,
          is_visible,
          sort_order,
          created_by_user_id,
          updated_by_user_id
        ) VALUES ${placeholders}
      `,
      values
    );
  }

  return getEffectiveLayoutForLot(normalizedLotId, db);
}

async function replaceLayoutForLot(lotId, columns, userId, connection = null) {
  if (connection) {
    return saveLayoutWithinTransaction(connection, lotId, columns, userId);
  }

  const pool = getDefaultConnection();
  const db = await pool.getConnection();

  try {
    await db.beginTransaction();
    const result = await saveLayoutWithinTransaction(db, lotId, columns, userId);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

async function resetLayoutWithinTransaction(db, lotId) {
  const normalizedLotId = normalizeLotId(lotId);
  const [lotRows] = await db.query(
    'SELECT lot_id FROM lots WHERE lot_id = ? FOR UPDATE',
    [normalizedLotId]
  );

  if (lotRows.length === 0) {
    throw new LotUnitBrowserLayoutDataError(`Lot ${normalizedLotId} was not found.`, 'LOT_NOT_FOUND');
  }

  await db.query('DELETE FROM lot_unit_browser_layouts WHERE lot_id = ?', [normalizedLotId]);
  return getEffectiveLayoutForLot(normalizedLotId, db);
}

async function resetLayoutForLot(lotId, connection = null) {
  if (connection) {
    return resetLayoutWithinTransaction(connection, lotId);
  }

  const pool = getDefaultConnection();
  const db = await pool.getConnection();

  try {
    await db.beginTransaction();
    const result = await resetLayoutWithinTransaction(db, lotId);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

function materializeLayoutColumns(layout) {
  return (Array.isArray(layout?.columns) ? layout.columns : []).map((column, index) => ({
    columnKey: column.key,
    isVisible: Boolean(column.isVisible),
    sortOrder: (index + 1) * 10
  }));
}

async function copyLayoutForDuplicate({
  sourceLotId,
  targetLotId,
  inheritanceMode,
  currentUserId,
  connection
}) {
  if (!connection) {
    throw new LotUnitBrowserLayoutDataError('Lot duplication requires an active transaction connection.', 'TRANSACTION_REQUIRED');
  }

  const normalizedSourceLotId = normalizeLotId(sourceLotId);
  const normalizedTargetLotId = normalizeLotId(targetLotId);
  const sourceDirectLayout = await getDirectLayoutForLot(normalizedSourceLotId, connection);
  const sourceEffectiveLayout = await getEffectiveLayoutForLot(normalizedSourceLotId, connection);
  const preserveSource = String(inheritanceMode || '') === 'preserve_source';

  if (preserveSource) {
    await replaceLayoutForLot(
      normalizedTargetLotId,
      materializeLayoutColumns(sourceEffectiveLayout),
      currentUserId,
      connection
    );
  } else if (sourceDirectLayout) {
    const sourceDirectEffective = resolveEffectiveLotUnitBrowserLayout({
      lineage: [{ lotId: normalizedSourceLotId, parentLotId: null, name: `Lot ${normalizedSourceLotId}` }],
      layouts: [sourceDirectLayout]
    });
    await replaceLayoutForLot(
      normalizedTargetLotId,
      materializeLayoutColumns(sourceDirectEffective),
      currentUserId,
      connection
    );
  }

  const targetDirectLayout = await getDirectLayoutForLot(normalizedTargetLotId, connection);

  if (preserveSource) {
    const targetEffectiveLayout = await getEffectiveLayoutForLot(normalizedTargetLotId, connection);
    if (JSON.stringify(buildUnitBrowserLayoutBehaviorSignature(targetEffectiveLayout))
      !== JSON.stringify(buildUnitBrowserLayoutBehaviorSignature(sourceEffectiveLayout))) {
      throw new LotUnitBrowserLayoutDataError(
        'The duplicate could not preserve the source Lot Unit Browser behavior. No Lot was created.',
        'DUPLICATE_BROWSER_LAYOUT_MISMATCH'
      );
    }
  } else if (Boolean(targetDirectLayout) !== Boolean(sourceDirectLayout)) {
    throw new LotUnitBrowserLayoutDataError(
      'The duplicate could not preserve the source Lot direct Unit Browser customization state. No Lot was created.',
      'DUPLICATE_BROWSER_DIRECT_STATE_MISMATCH'
    );
  }

  return Object.freeze({
    sourceHadDirectLayout: Boolean(sourceDirectLayout),
    targetHasDirectLayout: Boolean(targetDirectLayout),
    materializedEffectiveLayout: preserveSource
  });
}

module.exports = {
  LotUnitBrowserLayoutDataError,
  copyLayoutForDuplicate,
  getDirectLayoutForLot,
  getEffectiveLayoutForLot,
  listLayoutsForLotLineage,
  replaceLayoutForLot,
  resetLayoutForLot
};
