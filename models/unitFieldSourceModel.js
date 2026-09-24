'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const productionCycleModel = require('./productionCycleModel');

async function tableExists(connection) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_field_sources' LIMIT 1`
  );
  return Boolean(rows[0]);
}

async function hasOverrideCycleColumn(connection) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'unit_field_sources'
        AND COLUMN_NAME = 'override_production_cycle_key'
      LIMIT 1`
  );
  return Boolean(rows[0]);
}

async function recordTechEditSource(connection, { unitId, fieldKey, sourceNote = 'Saved from Tech Unit form.', userId = null }) {
  if (!await tableExists(connection)) return;
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId || !fieldKey) return;

  if (!await hasOverrideCycleColumn(connection)) {
    await connection.query(
      `INSERT INTO unit_field_sources (unit_id, field_key, source_code, source_note, updated_by_user_id, updated_at)
       VALUES (?, ?, 'tech_edit', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE source_code = VALUES(source_code), source_note = VALUES(source_note), updated_by_user_id = VALUES(updated_by_user_id), updated_at = NOW()`,
      [safeUnitId, fieldKey, sourceNote || null, normalizePositiveInteger(userId)]
    );
    return;
  }

  const currentCycleKey = await productionCycleModel.getCurrentProductionCycleKey(safeUnitId, connection);
  const [rows] = await connection.query(
    `SELECT source_code, override_production_cycle_key
       FROM unit_field_sources
      WHERE unit_id = ? AND field_key = ?
      LIMIT 1`,
    [safeUnitId, fieldKey]
  );
  const existing = rows[0] || null;
  const activeOverride = existing
    && String(existing.source_code || '').trim().toLowerCase() === 'manual_override'
    && String(existing.override_production_cycle_key || '').trim() === String(currentCycleKey || '').trim();

  if (activeOverride) return;

  await connection.query(
    `INSERT INTO unit_field_sources (
       unit_id, field_key, source_code, source_note, updated_by_user_id,
       override_production_cycle_key, updated_at
     ) VALUES (?, ?, 'tech_edit', ?, ?, NULL, NOW())
     ON DUPLICATE KEY UPDATE
       source_code = VALUES(source_code),
       source_note = VALUES(source_note),
       updated_by_user_id = VALUES(updated_by_user_id),
       override_production_cycle_key = NULL,
       updated_at = NOW()`,
    [safeUnitId, fieldKey, sourceNote || null, normalizePositiveInteger(userId)]
  );
}

async function setManualOverride(connection, { unitId, fieldKey, sourceNote = 'Explicit manual override.', userId = null }) {
  if (!await tableExists(connection) || !await hasOverrideCycleColumn(connection)) {
    throw new Error('Cycle-scoped manual override storage is not installed.');
  }
  const safeUnitId = normalizePositiveInteger(unitId);
  if (!safeUnitId || !fieldKey) throw new Error('A valid Unit and field are required for manual override.');
  const cycleKey = await productionCycleModel.getCurrentProductionCycleKey(safeUnitId, connection);
  if (!cycleKey) throw new Error('BWTDallas could not resolve the current production cycle for this Unit.');

  await connection.query(
    `INSERT INTO unit_field_sources (
       unit_id, field_key, source_code, source_note, updated_by_user_id,
       override_production_cycle_key, updated_at
     ) VALUES (?, ?, 'manual_override', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       source_code = VALUES(source_code),
       source_note = VALUES(source_note),
       updated_by_user_id = VALUES(updated_by_user_id),
       override_production_cycle_key = VALUES(override_production_cycle_key),
       updated_at = NOW()`,
    [safeUnitId, fieldKey, sourceNote || null, normalizePositiveInteger(userId), cycleKey]
  );

  return cycleKey;
}

async function releaseManualOverride(connection, options) {
  return recordTechEditSource(connection, {
    ...options,
    sourceNote: options?.sourceNote || 'Explicit manual override released.'
  });
}

module.exports = {
  recordTechEditSource,
  setManualOverride,
  releaseManualOverride
};
