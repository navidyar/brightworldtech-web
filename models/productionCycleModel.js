'use strict';

const { pool } = require('./db');
const unitAmazonModel = require('./unitAmazonModel');
const lotQcRequirementModel = require('./lotQcRequirementModel');
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
    hasHistoryFromLotIdSnapshot: historyColumns.has('from_lot_id_snapshot'),
    hasHistoryToLotIdSnapshot: historyColumns.has('to_lot_id_snapshot'),
    hasHistoryFromLotNameSnapshot: historyColumns.has('from_lot_name_snapshot'),
    hasHistoryToLotNameSnapshot: historyColumns.has('to_lot_name_snapshot'),
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

async function getLotNameSnapshots(lotIds, connection = pool) {
  const normalizedLotIds = Array.from(new Set((Array.isArray(lotIds) ? lotIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean)));

  if (normalizedLotIds.length === 0) {
    return new Map();
  }

  const [rows] = await connection.query(
    `
      SELECT lot_id, name
      FROM lots
      WHERE lot_id IN (${normalizedLotIds.map(() => '?').join(', ')})
    `,
    normalizedLotIds
  );

  return new Map(rows.map((row) => [Number(row.lot_id), String(row.name || '').trim()]));
}

async function rolloverCurrentHardwareToPrevious({ unitId, actorUserId = null }, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeActorUserId = normalizePositiveInteger(actorUserId);
  if (!safeUnitId) return { memoryRowsMoved: 0, storageRowsMoved: 0 };

  const [hasMemory, hasPreviousMemory, hasStorage, hasPreviousStorage] = await Promise.all([
    tableExists(connection, 'unit_memory_modules'),
    tableExists(connection, 'unit_previous_memory_modules'),
    tableExists(connection, 'unit_storage_devices'),
    tableExists(connection, 'unit_previous_storage_devices')
  ]);

  let memoryRowsMoved = 0;
  let storageRowsMoved = 0;

  if (hasMemory && hasPreviousMemory) {
    const [currentRows] = await connection.query(
      `SELECT slot_label, size_gb, ram_type_config_value_id, memory_install_type_code,
              speed_mhz, manufacturer_name, part_number, serial_number, change_notes
         FROM unit_memory_modules
        WHERE unit_id = ? AND is_current = 1
        ORDER BY slot_label, unit_memory_module_id`,
      [safeUnitId]
    );
    await connection.query('DELETE FROM unit_previous_memory_modules WHERE unit_id = ?', [safeUnitId]);
    for (const [index, row] of currentRows.entries()) {
      await connection.query(
        `INSERT INTO unit_previous_memory_modules (
           unit_id, sort_order, slot_label, size_gb, ram_type_config_value_id,
           memory_install_type_code, speed_mhz, manufacturer_name, part_number,
           serial_number, change_notes, changed_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeUnitId, index + 1, row.slot_label, row.size_gb, row.ram_type_config_value_id,
          row.memory_install_type_code, row.speed_mhz, row.manufacturer_name, row.part_number,
          row.serial_number, row.change_notes, safeActorUserId
        ]
      );
    }
    memoryRowsMoved = currentRows.length;
    const memoryColumns = await getColumnSet(connection, 'unit_memory_modules');
    const memoryReset = ['is_current = 0'];
    if (memoryColumns.has('removed_at')) memoryReset.push('removed_at = NOW()');
    if (memoryColumns.has('changed_by_user_id')) memoryReset.push('changed_by_user_id = ?');
    await connection.query(
      `UPDATE unit_memory_modules SET ${memoryReset.join(', ')} WHERE unit_id = ? AND is_current = 1`,
      memoryColumns.has('changed_by_user_id') ? [safeActorUserId, safeUnitId] : [safeUnitId]
    );
  }

  if (hasStorage && hasPreviousStorage) {
    const [currentRows] = await connection.query(
      `SELECT slot_label, storage_type_config_value_id, size_gb, manufacturer_name,
              model_number, serial_number, firmware_version, wipe_status_config_value_id, change_notes
         FROM unit_storage_devices
        WHERE unit_id = ? AND is_current = 1
        ORDER BY slot_label, unit_storage_device_id`,
      [safeUnitId]
    );
    await connection.query('DELETE FROM unit_previous_storage_devices WHERE unit_id = ?', [safeUnitId]);
    for (const [index, row] of currentRows.entries()) {
      await connection.query(
        `INSERT INTO unit_previous_storage_devices (
           unit_id, sort_order, slot_label, storage_type_config_value_id, size_gb,
           manufacturer_name, model_number, serial_number, firmware_version,
           wipe_status_config_value_id, change_notes, changed_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeUnitId, index + 1, row.slot_label, row.storage_type_config_value_id, row.size_gb,
          row.manufacturer_name, row.model_number, row.serial_number, row.firmware_version,
          row.wipe_status_config_value_id, row.change_notes, safeActorUserId
        ]
      );
    }
    storageRowsMoved = currentRows.length;
    const storageColumns = await getColumnSet(connection, 'unit_storage_devices');
    const storageReset = ['is_current = 0'];
    if (storageColumns.has('removed_at')) storageReset.push('removed_at = NOW()');
    if (storageColumns.has('changed_by_user_id')) storageReset.push('changed_by_user_id = ?');
    await connection.query(
      `UPDATE unit_storage_devices SET ${storageReset.join(', ')} WHERE unit_id = ? AND is_current = 1`,
      storageColumns.has('changed_by_user_id') ? [safeActorUserId, safeUnitId] : [safeUnitId]
    );
  }

  const unitColumns = await getColumnSet(connection, 'units');
  const assignments = [];
  if (unitColumns.has('previous_ram_gb') && unitColumns.has('ram_gb')) assignments.push('previous_ram_gb = ram_gb');
  if (unitColumns.has('ram_gb')) assignments.push('ram_gb = NULL');
  if (unitColumns.has('ram_type_config_value_id')) assignments.push('ram_type_config_value_id = NULL');
  if (unitColumns.has('previous_storage_gb') && unitColumns.has('storage_gb')) assignments.push('previous_storage_gb = storage_gb');
  if (unitColumns.has('storage_gb')) assignments.push('storage_gb = NULL');
  if (unitColumns.has('storage_type_config_value_id')) assignments.push('storage_type_config_value_id = NULL');
  if (assignments.length) {
    await connection.query(`UPDATE units SET ${assignments.join(', ')} WHERE unit_id = ? LIMIT 1`, [safeUnitId]);
  }

  if (await tableExists(connection, 'unit_field_sources')) {
    await connection.query(
      `DELETE FROM unit_field_sources WHERE unit_id = ? AND field_key IN ('memory_modules', 'storage_devices')`,
      [safeUnitId]
    );
  }

  return { memoryRowsMoved, storageRowsMoved };
}

async function recordLotMove({
  unitId,
  fromLotId,
  toLotId,
  movedByUserId,
  notes = null,
  allowNewProductionCycle = true,
  auditAmazonPalletClear = true,
  productionCyclePlan = null,
  hardwareRolloverPrepared = false
}, connection = pool) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeToLotId = normalizePositiveInteger(toLotId);
  const safeMovedByUserId = normalizePositiveInteger(movedByUserId);

  if (safeUnitId && safeToLotId && safeMovedByUserId) {
    await unitAmazonModel.applyDestinationLotAmazonPolicy(connection, {
      unitId: safeUnitId,
      destinationLotId: safeToLotId,
      actorUserId: safeMovedByUserId,
      source: 'unit_lot_move',
      auditPalletClear: auditAmazonPalletClear
    });
    await lotQcRequirementModel.auditUnitEnteredLot(connection, {
      unitId: safeUnitId,
      fromLotId,
      toLotId: safeToLotId,
      actorUserId: safeMovedByUserId,
      source: 'unit_lot_move'
    });
  }

  if (!safeUnitId || !safeToLotId || !safeMovedByUserId || !await tableExists(connection, 'unit_lot_history')) {
    return {
      unitLotHistoryId: null,
      startsNewProductionCycle: false,
      productionCycleKey: await getCurrentProductionCycleKey(safeUnitId, connection)
    };
  }

  const capabilities = await getProductionCycleSchemaCapabilities(connection);
  const plan = productionCyclePlan || await planLotMoveProductionCycle({
    unitId: safeUnitId,
    fromLotId,
    toLotId: safeToLotId,
    allowNewProductionCycle
  }, connection);

  if (plan.startsNewProductionCycle && !hardwareRolloverPrepared) {
    await rolloverCurrentHardwareToPrevious({
      unitId: safeUnitId,
      actorUserId: safeMovedByUserId
    }, connection);
  }

  const productionCycleNote = plan.startsNewProductionCycle
    ? 'Destination Lot started a new production cycle. Another production unit and weight are earned only after the Unit is completed again.'
    : '';
  const moveNotes = [String(notes || '').trim(), productionCycleNote].filter(Boolean).join(' ');
  const safeFromLotId = normalizePositiveInteger(fromLotId);
  const columns = ['unit_id', 'from_lot_id', 'to_lot_id', 'moved_by_user_id', 'notes'];
  const values = [
    safeUnitId,
    safeFromLotId,
    safeToLotId,
    safeMovedByUserId,
    moveNotes || null
  ];

  if (capabilities.hasHistoryFromLotIdSnapshot) {
    columns.push('from_lot_id_snapshot');
    values.push(safeFromLotId);
  }

  if (capabilities.hasHistoryToLotIdSnapshot) {
    columns.push('to_lot_id_snapshot');
    values.push(safeToLotId);
  }

  if (capabilities.hasHistoryFromLotNameSnapshot || capabilities.hasHistoryToLotNameSnapshot) {
    const lotNameSnapshots = await getLotNameSnapshots([safeFromLotId, safeToLotId], connection);

    if (capabilities.hasHistoryFromLotNameSnapshot) {
      columns.push('from_lot_name_snapshot');
      values.push(safeFromLotId ? lotNameSnapshots.get(safeFromLotId) || null : null);
    }

    if (capabilities.hasHistoryToLotNameSnapshot) {
      columns.push('to_lot_name_snapshot');
      values.push(lotNameSnapshots.get(safeToLotId) || null);
    }
  }

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
  rolloverCurrentHardwareToPrevious,
  recordLotMove,
  getCompletionProductionCycleState
};
