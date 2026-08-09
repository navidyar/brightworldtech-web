'use strict';

const { pool } = require('./db');
const {
  shouldGrantProductionCredit,
  shouldStartNewProductionCycle
} = require('../services/productionCyclePolicy');

const INITIAL_PRODUCTION_CYCLE_PREFIX = 'production:initial:';
const MOVE_PRODUCTION_CYCLE_PREFIX = 'production:move:';

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => String(row.column_name || '')));
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName]
  );

  return rows.length > 0;
}

function buildInitialProductionCycleKey(unitId) {
  const safeUnitId = normalizePositiveInteger(unitId);
  return safeUnitId ? `${INITIAL_PRODUCTION_CYCLE_PREFIX}${safeUnitId}` : null;
}

function buildMovedProductionCycleKey(unitId, unitLotHistoryId) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeHistoryId = normalizePositiveInteger(unitLotHistoryId);
  return safeUnitId && safeHistoryId
    ? `${MOVE_PRODUCTION_CYCLE_PREFIX}${safeUnitId}:${safeHistoryId}`
    : null;
}

async function getProductionCycleSchemaCapabilities(connection = pool) {
  const [hasLots, hasLotHistory, hasCompletions] = await Promise.all([
    tableExists(connection, 'lots'),
    tableExists(connection, 'unit_lot_history'),
    tableExists(connection, 'unit_work_completions')
  ]);

  const [lotColumns, historyColumns, completionColumns] = await Promise.all([
    hasLots ? getColumnSet(connection, 'lots') : Promise.resolve(new Set()),
    hasLotHistory ? getColumnSet(connection, 'unit_lot_history') : Promise.resolve(new Set()),
    hasCompletions ? getColumnSet(connection, 'unit_work_completions') : Promise.resolve(new Set())
  ]);

  return {
    hasLotPolicy: lotColumns.has('start_new_production_cycle_on_move'),
    hasHistoryStartFlag: historyColumns.has('starts_new_production_cycle'),
    hasHistoryProductionCycleKey: historyColumns.has('production_cycle_key'),
    hasCompletionProductionCycleKey: completionColumns.has('production_cycle_key'),
    hasCompletionCreditFlag: completionColumns.has('grants_production_credit'),
    hasCompletionWorkCycleKey: completionColumns.has('work_cycle_key'),
    hasCompletionReversal: completionColumns.has('reversed_at')
  };
}

async function getDestinationProductionCyclePolicy(lotId, connection = pool) {
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeLotId) return false;

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  if (!capabilities.hasLotPolicy) return false;

  const [rows] = await connection.query(
    `
      SELECT start_new_production_cycle_on_move
      FROM lots
      WHERE lot_id = ?
      LIMIT 1
    `,
    [safeLotId]
  );

  return Number(rows[0]?.start_new_production_cycle_on_move || 0) === 1;
}

async function getLatestHistoryProductionCycleKey(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return null;

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  if (!capabilities.hasHistoryProductionCycleKey) return null;

  const [rows] = await connection.query(
    `
      SELECT production_cycle_key
      FROM unit_lot_history
      WHERE unit_id = ?
        AND production_cycle_key IS NOT NULL
        AND production_cycle_key <> ''
      ORDER BY moved_at DESC, unit_lot_history_id DESC
      LIMIT 1
    `,
    [safeUnitId]
  );

  return String(rows[0]?.production_cycle_key || '').trim() || null;
}

async function getLatestActiveProductionCredit(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return null;

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  if (!capabilities.hasCompletionProductionCycleKey) return null;

  const creditFilter = capabilities.hasCompletionCreditFlag
    ? 'AND grants_production_credit = 1'
    : '';
  const reversalFilter = capabilities.hasCompletionReversal
    ? 'AND reversed_at IS NULL'
    : '';

  const [rows] = await connection.query(
    `
      SELECT
        unit_work_completion_id,
        production_cycle_key,
        completed_at,
        completed_by_user_id,
        production_weight_value
      FROM unit_work_completions
      WHERE unit_id = ?
        AND credit_source = 'manual_completion'
        ${creditFilter}
        ${reversalFilter}
        AND production_cycle_key IS NOT NULL
        AND production_cycle_key <> ''
      ORDER BY completed_at DESC, unit_work_completion_id DESC
      LIMIT 1
    `,
    [safeUnitId]
  );

  return rows[0] || null;
}


async function hasActiveProductionCreditForCycle({ unitId, productionCycleKey }, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeCycleKey = String(productionCycleKey || '').trim();
  if (!safeUnitId || !safeCycleKey) return false;

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  if (!capabilities.hasCompletionProductionCycleKey || !capabilities.hasCompletionCreditFlag) {
    return false;
  }

  const reversalFilter = capabilities.hasCompletionReversal
    ? 'AND reversed_at IS NULL'
    : '';
  const [rows] = await connection.query(
    `
      SELECT unit_work_completion_id
      FROM unit_work_completions
      WHERE unit_id = ?
        AND credit_source = 'manual_completion'
        AND grants_production_credit = 1
        ${reversalFilter}
        AND production_cycle_key = ?
      ORDER BY completed_at DESC, unit_work_completion_id DESC
      LIMIT 1
    `,
    [safeUnitId, safeCycleKey]
  );

  return rows.length > 0;
}

async function getCurrentProductionCycleKey(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId) return null;

  const historyKey = await getLatestHistoryProductionCycleKey(safeUnitId, connection);
  if (historyKey) return historyKey;

  const latestCredit = await getLatestActiveProductionCredit(safeUnitId, connection);
  const completionKey = String(latestCredit?.production_cycle_key || '').trim();
  if (completionKey) return completionKey;

  return buildInitialProductionCycleKey(safeUnitId);
}

async function getLatestLotStay(unitId, lotId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeUnitId || !safeLotId || !await tableExists(connection, 'unit_lot_history')) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT unit_lot_history_id, moved_at
      FROM unit_lot_history
      WHERE unit_id = ?
        AND to_lot_id = ?
      ORDER BY moved_at DESC, unit_lot_history_id DESC
      LIMIT 1
    `,
    [safeUnitId, safeLotId]
  );

  return rows[0] || null;
}

async function hasCurrentLotOperationalCompletion({ unitId, lotId }, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeLotId = normalizePositiveInteger(lotId);
  if (!safeUnitId || !safeLotId || !await tableExists(connection, 'unit_work_completions')) {
    return false;
  }

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  const lotStay = await getLatestLotStay(safeUnitId, safeLotId, connection);
  const workCycleKey = lotStay?.unit_lot_history_id
    ? `move:${safeUnitId}:${safeLotId}:${Number(lotStay.unit_lot_history_id)}`
    : `initial:${safeUnitId}:${safeLotId}`;
  const reversalFilter = capabilities.hasCompletionReversal
    ? 'AND reversed_at IS NULL'
    : '';

  if (capabilities.hasCompletionWorkCycleKey) {
    const [rows] = await connection.query(
      `
        SELECT unit_work_completion_id
        FROM unit_work_completions
        WHERE unit_id = ?
          AND lot_id = ?
          AND credit_source = 'manual_completion'
          ${reversalFilter}
          AND (
            work_cycle_key = ?
            OR (
              work_cycle_key IS NULL
              AND completed_at >= ?
            )
          )
        ORDER BY completed_at DESC, unit_work_completion_id DESC
        LIMIT 1
      `,
      [safeUnitId, safeLotId, workCycleKey, lotStay?.moved_at || '1970-01-01 00:00:00']
    );

    return rows.length > 0;
  }

  const [rows] = await connection.query(
    `
      SELECT unit_work_completion_id
      FROM unit_work_completions
      WHERE unit_id = ?
        AND lot_id = ?
        AND credit_source = 'manual_completion'
        ${reversalFilter}
        AND completed_at >= ?
      ORDER BY completed_at DESC, unit_work_completion_id DESC
      LIMIT 1
    `,
    [safeUnitId, safeLotId, lotStay?.moved_at || '1970-01-01 00:00:00']
  );

  return rows.length > 0;
}

async function planLotMoveProductionCycle({
  unitId,
  fromLotId,
  toLotId,
  allowNewProductionCycle = true
}, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeFromLotId = normalizePositiveInteger(fromLotId);
  const safeToLotId = normalizePositiveInteger(toLotId);
  const currentProductionCycleKey = await getCurrentProductionCycleKey(safeUnitId, connection);

  if (!safeUnitId || !safeToLotId || !allowNewProductionCycle || !safeFromLotId || safeFromLotId === safeToLotId) {
    return {
      startsNewProductionCycle: false,
      productionCycleKey: currentProductionCycleKey,
      destinationPolicyEnabled: false,
      hasCurrentProductionCredit: false
    };
  }

  const destinationPolicyEnabled = await getDestinationProductionCyclePolicy(safeToLotId, connection);
  if (!destinationPolicyEnabled) {
    return {
      startsNewProductionCycle: false,
      productionCycleKey: currentProductionCycleKey,
      destinationPolicyEnabled: false,
      hasCurrentProductionCredit: false
    };
  }

  const hasCurrentProductionCredit = await hasActiveProductionCreditForCycle({
    unitId: safeUnitId,
    productionCycleKey: currentProductionCycleKey
  }, connection);

  return {
    startsNewProductionCycle: shouldStartNewProductionCycle({
      allowNewProductionCycle,
      destinationPolicyEnabled: true,
      hasCurrentProductionCredit,
      fromLotId: safeFromLotId,
      toLotId: safeToLotId
    }),
    productionCycleKey: currentProductionCycleKey,
    destinationPolicyEnabled: true,
    hasCurrentProductionCredit
  };
}

async function recordLotMove({
  unitId,
  fromLotId,
  toLotId,
  movedByUserId,
  notes = null,
  allowNewProductionCycle = true
}, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeToLotId = normalizePositiveInteger(toLotId);
  const safeMovedByUserId = normalizePositiveInteger(movedByUserId);

  if (!safeUnitId || !safeToLotId || !safeMovedByUserId || !await tableExists(connection, 'unit_lot_history')) {
    return {
      unitLotHistoryId: null,
      startsNewProductionCycle: false,
      productionCycleKey: await getCurrentProductionCycleKey(safeUnitId, connection)
    };
  }

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  const plan = await planLotMoveProductionCycle({
    unitId: safeUnitId,
    fromLotId,
    toLotId: safeToLotId,
    allowNewProductionCycle
  }, connection);

  const productionCycleNote = plan.startsNewProductionCycle
    ? 'Destination Lot started a new production cycle. Another production unit and weight are earned only after the Unit is completed again.'
    : '';
  const moveNotes = [String(notes || '').trim(), productionCycleNote].filter(Boolean).join(' ');
  const columns = ['unit_id', 'from_lot_id', 'to_lot_id', 'moved_by_user_id', 'notes'];
  const values = [
    safeUnitId,
    normalizePositiveInteger(fromLotId),
    safeToLotId,
    safeMovedByUserId,
    moveNotes || null
  ];

  if (capabilities.hasHistoryStartFlag) {
    columns.push('starts_new_production_cycle');
    values.push(plan.startsNewProductionCycle ? 1 : 0);
  }

  if (capabilities.hasHistoryProductionCycleKey) {
    columns.push('production_cycle_key');
    values.push(plan.startsNewProductionCycle ? null : plan.productionCycleKey);
  }

  const [result] = await connection.query(
    `
      INSERT INTO unit_lot_history (${columns.map((column) => `\`${column}\``).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `,
    values
  );

  const unitLotHistoryId = normalizePositiveInteger(result.insertId);
  let productionCycleKey = plan.productionCycleKey;

  if (plan.startsNewProductionCycle && capabilities.hasHistoryProductionCycleKey && unitLotHistoryId) {
    productionCycleKey = buildMovedProductionCycleKey(safeUnitId, unitLotHistoryId);
    await connection.query(
      `
        UPDATE unit_lot_history
        SET production_cycle_key = ?
        WHERE unit_lot_history_id = ?
        LIMIT 1
      `,
      [productionCycleKey, unitLotHistoryId]
    );
  }

  return {
    unitLotHistoryId,
    startsNewProductionCycle: plan.startsNewProductionCycle,
    productionCycleKey,
    destinationPolicyEnabled: plan.destinationPolicyEnabled,
    hasCurrentProductionCredit: plan.hasCurrentProductionCredit
  };
}

async function getCompletionProductionCycleState(unitId, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  const productionCycleKey = await getCurrentProductionCycleKey(safeUnitId, connection);

  if (!safeUnitId || !productionCycleKey || !capabilities.hasCompletionProductionCycleKey || !capabilities.hasCompletionCreditFlag) {
    return {
      productionCycleKey,
      grantsProductionCredit: true,
      schemaReady: false
    };
  }

  const reversalFilter = capabilities.hasCompletionReversal
    ? 'AND reversed_at IS NULL'
    : '';
  const [rows] = await connection.query(
    `
      SELECT unit_work_completion_id
      FROM unit_work_completions
      WHERE unit_id = ?
        AND credit_source = 'manual_completion'
        AND grants_production_credit = 1
        ${reversalFilter}
        AND production_cycle_key = ?
      ORDER BY completed_at DESC, unit_work_completion_id DESC
      LIMIT 1
    `,
    [safeUnitId, productionCycleKey]
  );

  return {
    productionCycleKey,
    grantsProductionCredit: shouldGrantProductionCredit({
      hasActiveProductionCredit: rows.length > 0
    }),
    schemaReady: true
  };
}

module.exports = {
  buildInitialProductionCycleKey,
  buildMovedProductionCycleKey,
  getProductionCycleSchemaCapabilities,
  getDestinationProductionCyclePolicy,
  getCurrentProductionCycleKey,
  hasActiveProductionCreditForCycle,
  hasCurrentLotOperationalCompletion,
  planLotMoveProductionCycle,
  recordLotMove,
  getCompletionProductionCycleState
};
