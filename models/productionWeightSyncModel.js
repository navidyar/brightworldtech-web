'use strict';

const { pool } = require('./db');
const productionWeightModel = require('./productionWeightModel');

const SYNCABLE_CREDIT_SOURCE = 'manual_completion';
const UPDATE_CHUNK_SIZE = 500;

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function chunk(values, size = UPDATE_CHUNK_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
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

  return new Set(rows.map((row) => row.column_name));
}

function hasRequiredColumns(columns, requiredColumns) {
  return requiredColumns.every((columnName) => columns.has(columnName));
}

function resolveEffectiveWeightForSyncRow(row = {}, productionWeightOptions = []) {
  return productionWeightModel.buildProductionWeightDetails({
    unitProductionWeightOverride: row.production_weight_override,
    unitProductionWeightNotes: row.production_weight_notes || '',
    lotDefaultProductionWeight: row.resolved_default_production_weight,
    lotDefaultProductionWeightLabel: row.default_production_weight_label || '',
    unitCategory: {
      code: row.unit_category_code || '',
      label: row.unit_category_label || '',
      value: row.unit_category_value || ''
    },
    productionWeightOptions
  });
}

function buildCompletionWeightSyncPlan({
  unitRows = [],
  completionRows = [],
  productionWeightOptions = []
} = {}) {
  const unitDetailsById = new Map();
  const unresolvedUnits = [];

  for (const row of unitRows) {
    const unitId = normalizePositiveInteger(row.unit_id);
    if (!unitId) continue;

    const details = resolveEffectiveWeightForSyncRow(row, productionWeightOptions);
    unitDetailsById.set(unitId, details);

    if (details.effectiveWeight === null || details.effectiveWeight === undefined) {
      unresolvedUnits.push({
        unitId,
        lotId: normalizePositiveInteger(row.lot_id),
        sourceCode: details.sourceCode,
        sourceLabel: details.sourceLabel
      });
    }
  }

  const updates = [];
  const unchanged = [];

  for (const row of completionRows) {
    const completionId = normalizePositiveInteger(row.unit_work_completion_id);
    const unitId = normalizePositiveInteger(row.unit_id);
    const details = unitDetailsById.get(unitId);

    if (!completionId || !unitId || !details || details.effectiveWeight === null || details.effectiveWeight === undefined) {
      continue;
    }

    const currentWeight = productionWeightModel.normalizeWeightValue(row.production_weight_value);
    const effectiveWeight = productionWeightModel.normalizeWeightValue(details.effectiveWeight);

    if (currentWeight === effectiveWeight) {
      unchanged.push({ completionId, unitId, effectiveWeight, sourceCode: details.sourceCode });
      continue;
    }

    updates.push({
      completionId,
      unitId,
      previousWeight: currentWeight,
      effectiveWeight,
      sourceCode: details.sourceCode,
      sourceLabel: details.sourceLabel
    });
  }

  return {
    unitsScanned: unitRows.length,
    completionsScanned: completionRows.length,
    unresolvedUnits,
    updates,
    unchanged
  };
}

async function loadCurrentUnitWeightRows(connection, { unitIds = null, lotId = null } = {}) {
  const [unitColumns, lotColumns] = await Promise.all([
    getColumnSet(connection, 'units'),
    getColumnSet(connection, 'lots')
  ]);

  if (!hasRequiredColumns(unitColumns, ['unit_id', 'lot_id', 'unit_category_config_value_id'])
      || !hasRequiredColumns(lotColumns, ['lot_id'])) {
    return { ready: false, rows: [], reason: 'Required Unit/Lot weight columns are unavailable.' };
  }

  const hasUnitOverride = unitColumns.has('production_weight_override');
  const hasUnitNotes = unitColumns.has('production_weight_notes');
  const hasLotCustomWeight = lotColumns.has('default_production_weight');
  const hasLotPresetId = lotColumns.has('default_production_weight_config_value_id');

  if (!hasUnitOverride || (!hasLotCustomWeight && !hasLotPresetId)) {
    return { ready: false, rows: [], reason: 'Production weight storage columns are unavailable.' };
  }

  const where = ['u.lot_id IS NOT NULL'];
  const params = [];
  const normalizedIds = Array.from(new Set((Array.isArray(unitIds) ? unitIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean)));
  const normalizedLotId = normalizePositiveInteger(lotId);

  if (normalizedIds.length > 0) {
    where.push(`u.unit_id IN (${normalizedIds.map(() => '?').join(', ')})`);
    params.push(...normalizedIds);
  } else if (normalizedLotId) {
    where.push('u.lot_id = ?');
    params.push(normalizedLotId);
  }

  const lotPresetJoin = hasLotPresetId
    ? 'LEFT JOIN config_values lot_weight ON lot_weight.config_value_id = l.default_production_weight_config_value_id'
    : '';
  const lotCustomExpression = hasLotCustomWeight ? 'l.default_production_weight' : 'NULL';
  const lotPresetExpression = hasLotPresetId ? 'CAST(lot_weight.value AS DECIMAL(20,2))' : 'NULL';
  const resolvedLotExpression = hasLotCustomWeight && hasLotPresetId
    ? `COALESCE(${lotCustomExpression}, ${lotPresetExpression})`
    : hasLotCustomWeight
      ? lotCustomExpression
      : lotPresetExpression;

  const [rows] = await connection.query(
    `
      SELECT
        u.unit_id,
        u.lot_id,
        u.unit_category_config_value_id,
        ${hasUnitOverride ? 'u.production_weight_override' : 'NULL'} AS production_weight_override,
        ${hasUnitNotes ? 'u.production_weight_notes' : 'NULL'} AS production_weight_notes,
        ${resolvedLotExpression} AS resolved_default_production_weight,
        ${hasLotPresetId ? 'COALESCE(lot_weight.label, lot_weight.code)' : 'NULL'} AS default_production_weight_label,
        unit_category.code AS unit_category_code,
        unit_category.label AS unit_category_label,
        unit_category.value AS unit_category_value
      FROM units u
      INNER JOIN lots l
        ON l.lot_id = u.lot_id
      ${lotPresetJoin}
      LEFT JOIN config_values unit_category
        ON unit_category.config_value_id = u.unit_category_config_value_id
      WHERE ${where.join('\n        AND ')}
      ORDER BY u.unit_id
    `,
    params
  );

  return { ready: true, rows, reason: '' };
}

async function loadCurrentProductionCycleKeys(connection, unitIds, completionColumns) {
  const normalizedIds = Array.from(new Set((Array.isArray(unitIds) ? unitIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean)));
  const result = new Map();

  if (normalizedIds.length === 0
      || !completionColumns.has('production_cycle_key')
      || !completionColumns.has('grants_production_credit')) {
    return result;
  }

  const historyColumns = await getColumnSet(connection, 'unit_lot_history');
  const historyKeys = new Map();

  if (historyColumns.has('production_cycle_key')) {
    for (const idChunk of chunk(normalizedIds)) {
      const [rows] = await connection.query(
        `
          SELECT unit_id, production_cycle_key
          FROM (
            SELECT
              unit_id,
              production_cycle_key,
              ROW_NUMBER() OVER (
                PARTITION BY unit_id
                ORDER BY moved_at DESC, unit_lot_history_id DESC
              ) AS row_rank
            FROM unit_lot_history
            WHERE unit_id IN (${idChunk.map(() => '?').join(', ')})
              AND production_cycle_key IS NOT NULL
              AND production_cycle_key <> ''
          ) ranked_cycles
          WHERE row_rank = 1
        `,
        idChunk
      );

      for (const row of rows) {
        historyKeys.set(Number(row.unit_id), String(row.production_cycle_key || '').trim());
      }
    }
  }

  const reversalFilter = completionColumns.has('reversed_at') ? 'AND reversed_at IS NULL' : '';
  const completionKeys = new Map();
  for (const idChunk of chunk(normalizedIds)) {
    const [rows] = await connection.query(
      `
        SELECT unit_id, production_cycle_key
        FROM (
          SELECT
            unit_id,
            production_cycle_key,
            ROW_NUMBER() OVER (
              PARTITION BY unit_id
              ORDER BY completed_at DESC, unit_work_completion_id DESC
            ) AS row_rank
          FROM unit_work_completions
          WHERE unit_id IN (${idChunk.map(() => '?').join(', ')})
            AND credit_source = ?
            AND grants_production_credit = 1
            ${reversalFilter}
            AND production_cycle_key IS NOT NULL
            AND production_cycle_key <> ''
        ) ranked_credits
        WHERE row_rank = 1
      `,
      [...idChunk, SYNCABLE_CREDIT_SOURCE]
    );

    for (const row of rows) {
      completionKeys.set(Number(row.unit_id), String(row.production_cycle_key || '').trim());
    }
  }

  for (const unitId of normalizedIds) {
    result.set(
      unitId,
      historyKeys.get(unitId) || completionKeys.get(unitId) || `production:initial:${unitId}`
    );
  }

  return result;
}

async function loadActiveManualCompletionRows(connection, unitIds) {
  const completionColumns = await getColumnSet(connection, 'unit_work_completions');

  if (!hasRequiredColumns(completionColumns, [
    'unit_work_completion_id',
    'unit_id',
    'production_weight_value',
    'credit_source'
  ])) {
    return { ready: false, rows: [], reason: 'Unit completion weight columns are unavailable.' };
  }

  const normalizedIds = Array.from(new Set((Array.isArray(unitIds) ? unitIds : [])
    .map(normalizePositiveInteger)
    .filter(Boolean)));

  if (normalizedIds.length === 0) {
    return { ready: true, rows: [], reason: '' };
  }

  const currentProductionCycleKeys = await loadCurrentProductionCycleKeys(
    connection,
    normalizedIds,
    completionColumns
  );
  const productionCycleAware = completionColumns.has('production_cycle_key')
    && completionColumns.has('grants_production_credit');
  const rows = [];

  for (const idChunk of chunk(normalizedIds)) {
    const reversedFilter = completionColumns.has('reversed_at') ? 'AND reversed_at IS NULL' : '';
    const productionSelect = productionCycleAware
      ? ', production_cycle_key, grants_production_credit'
      : '';
    const [chunkRows] = await connection.query(
      `
        SELECT unit_work_completion_id, unit_id, production_weight_value${productionSelect}
        FROM unit_work_completions
        WHERE credit_source = ?
          ${reversedFilter}
          AND unit_id IN (${idChunk.map(() => '?').join(', ')})
        ORDER BY unit_work_completion_id
      `,
      [SYNCABLE_CREDIT_SOURCE, ...idChunk]
    );

    if (!productionCycleAware) {
      rows.push(...chunkRows);
      continue;
    }

    rows.push(...chunkRows.filter((row) => (
      Number(row.grants_production_credit || 0) === 1
      && String(row.production_cycle_key || '').trim() === currentProductionCycleKeys.get(Number(row.unit_id))
    )));
  }

  return { ready: true, rows, reason: '' };
}

async function applyCompletionWeightUpdates(connection, updates) {
  const completionColumns = await getColumnSet(connection, 'unit_work_completions');
  const activeFilter = completionColumns.has('reversed_at') ? 'AND reversed_at IS NULL' : '';
  const updatesByWeight = new Map();

  for (const update of updates) {
    const key = Number(update.effectiveWeight).toFixed(2);
    if (!updatesByWeight.has(key)) updatesByWeight.set(key, []);
    updatesByWeight.get(key).push(update.completionId);
  }

  let affectedRows = 0;
  for (const [weight, completionIds] of updatesByWeight.entries()) {
    for (const idChunk of chunk(completionIds)) {
      const [result] = await connection.query(
        `
          UPDATE unit_work_completions
          SET production_weight_value = ?
          WHERE unit_work_completion_id IN (${idChunk.map(() => '?').join(', ')})
            AND credit_source = ?
            ${activeFilter}
        `,
        [weight, ...idChunk, SYNCABLE_CREDIT_SOURCE]
      );
      affectedRows += Number(result.affectedRows || 0);
    }
  }

  return affectedRows;
}

async function syncEffectiveManualCompletionWeights({
  connection = pool,
  unitIds = null,
  lotId = null,
  apply = true
} = {}) {
  const unitState = await loadCurrentUnitWeightRows(connection, { unitIds, lotId });

  if (!unitState.ready) {
    return {
      ready: false,
      reason: unitState.reason,
      unitsScanned: 0,
      completionsScanned: 0,
      unresolvedUnits: [],
      updates: [],
      unchanged: [],
      affectedRows: 0
    };
  }

  const normalizedUnitIds = unitState.rows.map((row) => Number(row.unit_id));
  const [completionState, productionWeightOptions] = await Promise.all([
    loadActiveManualCompletionRows(connection, normalizedUnitIds),
    productionWeightModel.listProductionWeightOptions(connection)
  ]);

  if (!completionState.ready) {
    return {
      ready: false,
      reason: completionState.reason,
      unitsScanned: unitState.rows.length,
      completionsScanned: 0,
      unresolvedUnits: [],
      updates: [],
      unchanged: [],
      affectedRows: 0
    };
  }

  const plan = buildCompletionWeightSyncPlan({
    unitRows: unitState.rows,
    completionRows: completionState.rows,
    productionWeightOptions
  });

  const affectedRows = apply && plan.updates.length > 0
    ? await applyCompletionWeightUpdates(connection, plan.updates)
    : 0;

  return {
    ready: true,
    reason: '',
    ...plan,
    affectedRows
  };
}

module.exports = {
  SYNCABLE_CREDIT_SOURCE,
  resolveEffectiveWeightForSyncRow,
  buildCompletionWeightSyncPlan,
  syncEffectiveManualCompletionWeights
};
