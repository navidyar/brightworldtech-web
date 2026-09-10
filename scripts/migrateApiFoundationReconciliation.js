'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const LOT_POLICY_COLUMNS = Object.freeze([
  'allow_manual_create_update',
  'allow_scantools',
  'allow_techtools',
  'require_scantools_before_completion',
  'require_techtools_before_completion'
]);

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeIdentifierComparableValue(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return normalized || null;
}

async function tableExists(connection, tableName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(row?.row_count || 0) === 1;
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.column_name || row.COLUMN_NAME || '')));
}

async function indexExists(connection, tableName, indexName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(row?.row_count || 0) > 0;
}

async function assertPrerequisites(connection) {
  const required = {
    lots: ['lot_id', 'parent_lot_id'],
    units: ['unit_id'],
    unit_identifiers: ['unit_id', 'identifier_type_config_value_id', 'identifier_value', 'normalized_value', 'is_primary'],
    unit_specifications: ['unit_id'],
    unit_field_sources: ['unit_id', 'field_key', 'source_code'],
    unit_tool_runs: ['tool_run_id', 'unit_id', 'tool_source', 'report_id', 'status'],
    config_values: ['config_value_id', 'config_category_id'],
    system_config_categories: ['system_config_category_id', 'config_category_id'],
    system_config_values: ['system_config_value_id', 'config_value_id']
  };

  const missing = [];
  for (const [tableName, columns] of Object.entries(required)) {
    if (!await tableExists(connection, tableName)) {
      missing.push(`${tableName} table`);
      continue;
    }
    const available = await getColumnSet(connection, tableName);
    for (const columnName of columns) {
      if (!available.has(columnName)) missing.push(`${tableName}.${columnName}`);
    }
  }
  if (missing.length) {
    throw new Error(`Foundation reconciliation prerequisites are missing: ${missing.join(', ')}.`);
  }
}

async function getIdentifierCategoryId(connection) {
  const [rows] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES]
  );
  const id = Number(rows[0]?.config_category_id || 0);
  if (!id) throw new Error('Unit Identifier Types system category binding is missing.');
  return id;
}

async function getUuidIdentifierTypeId(connection) {
  const [rows] = await connection.query(
    `SELECT config_value_id
       FROM system_config_values
      WHERE system_config_value_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_SYSTEM_UUID]
  );
  return Number(rows[0]?.config_value_id || 0) || null;
}

async function findUuidIdentifierTypeByLabel(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumns = ['label', 'name', 'value', 'code'].filter((column) => columns.has(column));
  if (!labelColumns.length) return null;
  const clauses = labelColumns.map((column) => `LOWER(TRIM(${q(column)})) IN ('system uuid', 'uuid', 'system_uuid')`);
  const [rows] = await connection.query(
    `SELECT config_value_id
       FROM config_values
      WHERE config_category_id = ? AND (${clauses.join(' OR ')})
      ORDER BY config_value_id
      LIMIT 1`,
    [categoryId]
  );
  return Number(rows[0]?.config_value_id || 0) || null;
}

async function createUuidIdentifierType(connection, categoryId) {
  const columns = await getColumnSet(connection, 'config_values');
  const fields = ['config_category_id'];
  const values = [categoryId];
  for (const column of ['label', 'name', 'value']) {
    if (columns.has(column)) {
      fields.push(column);
      values.push('System UUID');
    }
  }
  if (columns.has('code')) {
    fields.push('code');
    values.push('system_uuid');
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push('Protected System UUID identity value used by BWTDallas manual entry and Tool identity resolution.');
  }
  if (columns.has('sort_order')) {
    const [[row]] = await connection.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order FROM config_values WHERE config_category_id = ?',
      [categoryId]
    );
    fields.push('sort_order');
    values.push(Number(row?.next_sort_order || 10));
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (columns.has('is_protected')) {
    fields.push('is_protected');
    values.push(1);
  }
  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureUuidIdentifierBinding(connection) {
  const categoryId = await getIdentifierCategoryId(connection);
  let configValueId = await getUuidIdentifierTypeId(connection);
  if (configValueId) {
    const [[row]] = await connection.query(
      'SELECT config_category_id FROM config_values WHERE config_value_id = ? LIMIT 1',
      [configValueId]
    );
    if (Number(row?.config_category_id || 0) !== categoryId) {
      throw new Error(`System UUID binding ${SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_SYSTEM_UUID} points outside Unit Identifier Types.`);
    }
  } else {
    configValueId = await findUuidIdentifierTypeByLabel(connection, categoryId);
    if (!configValueId) configValueId = await createUuidIdentifierType(connection, categoryId);
    await connection.query(
      `INSERT INTO system_config_values (system_config_value_id, config_value_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
      [SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_SYSTEM_UUID, configValueId]
    );
  }

  const columns = await getColumnSet(connection, 'config_values');
  if (columns.has('is_active')) {
    await connection.query('UPDATE config_values SET is_active = 1 WHERE config_value_id = ?', [configValueId]);
  }
  if (columns.has('is_protected')) {
    await connection.query('UPDATE config_values SET is_protected = 1 WHERE config_value_id = ?', [configValueId]);
  }
  return configValueId;
}

async function countLegacyUuidRows(connection) {
  const columns = await getColumnSet(connection, 'unit_specifications');
  if (!columns.has('system_uuid')) return 0;
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
       FROM unit_specifications
      WHERE NULLIF(TRIM(system_uuid), '') IS NOT NULL`
  );
  return Number(row?.row_count || 0);
}

async function findLegacyUuidConflicts(connection, identifierTypeId) {
  const columns = await getColumnSet(connection, 'unit_specifications');
  if (!columns.has('system_uuid') || !identifierTypeId) return [];
  const [legacyRows] = await connection.query(
    `SELECT unit_id, system_uuid
       FROM unit_specifications
      WHERE NULLIF(TRIM(system_uuid), '') IS NOT NULL
      ORDER BY unit_id`
  );
  const conflicts = [];
  for (const row of legacyRows) {
    const expected = normalizeIdentifierComparableValue(row.system_uuid);
    if (!expected) continue;
    const [currentRows] = await connection.query(
      `SELECT identifier_value, normalized_value
         FROM unit_identifiers
        WHERE unit_id = ? AND identifier_type_config_value_id = ?`,
      [row.unit_id, identifierTypeId]
    );
    if (currentRows.some((current) => String(current.normalized_value || '') !== expected)) {
      conflicts.push(Number(row.unit_id));
    }
  }
  return conflicts;
}

async function migrateLegacyUuidRows(connection, identifierTypeId) {
  const columns = await getColumnSet(connection, 'unit_specifications');
  if (!columns.has('system_uuid')) return { copied: 0, existing: 0 };

  const conflicts = await findLegacyUuidConflicts(connection, identifierTypeId);
  if (conflicts.length) {
    throw new Error(`Legacy System UUID migration has conflicting UUID identity on Unit ID(s): ${conflicts.join(', ')}.`);
  }

  const [legacyRows] = await connection.query(
    `SELECT unit_id, system_uuid
       FROM unit_specifications
      WHERE NULLIF(TRIM(system_uuid), '') IS NOT NULL
      ORDER BY unit_id`
  );
  let copied = 0;
  let existing = 0;
  for (const row of legacyRows) {
    const identifierValue = String(row.system_uuid || '').trim().toUpperCase();
    const normalizedValue = normalizeIdentifierComparableValue(identifierValue);
    if (!normalizedValue) continue;
    const [currentRows] = await connection.query(
      `SELECT unit_identifier_id
         FROM unit_identifiers
        WHERE unit_id = ? AND identifier_type_config_value_id = ? AND normalized_value = ?
        LIMIT 1`,
      [row.unit_id, identifierTypeId, normalizedValue]
    );
    if (currentRows.length) {
      existing += 1;
      continue;
    }
    await connection.query(
      `INSERT INTO unit_identifiers (
         unit_id, identifier_type_config_value_id, identifier_value, normalized_value, is_primary
       ) VALUES (?, ?, ?, ?, 0)`,
      [row.unit_id, identifierTypeId, identifierValue, normalizedValue]
    );
    copied += 1;
  }

  const unresolved = await findLegacyUuidConflicts(connection, identifierTypeId);
  if (unresolved.length) throw new Error('Legacy System UUID verification failed after copy.');
  await connection.query('ALTER TABLE unit_specifications DROP COLUMN system_uuid');
  return { copied, existing };
}

async function ensureLotPolicyColumns(connection) {
  let columns = await getColumnSet(connection, 'lots');
  for (const columnName of LOT_POLICY_COLUMNS) {
    if (columns.has(columnName)) continue;
    await connection.query(`ALTER TABLE lots ADD COLUMN ${q(columnName)} TINYINT(1) NULL DEFAULT NULL`);
    columns = await getColumnSet(connection, 'lots');
  }
}

async function ensureManualOverrideCycleColumn(connection) {
  const columns = await getColumnSet(connection, 'unit_field_sources');
  if (!columns.has('override_production_cycle_key')) {
    await connection.query(
      'ALTER TABLE unit_field_sources ADD COLUMN override_production_cycle_key VARCHAR(191) NULL AFTER source_code'
    );
  }
}

async function ensureToolRunCycleColumn(connection) {
  const columns = await getColumnSet(connection, 'unit_tool_runs');
  if (!columns.has('production_cycle_key')) {
    await connection.query(
      'ALTER TABLE unit_tool_runs ADD COLUMN production_cycle_key VARCHAR(191) NULL AFTER completed_at'
    );
  }
  const indexName = 'idx_unit_tool_runs_unit_cycle_source';
  if (!await indexExists(connection, 'unit_tool_runs', indexName)) {
    await connection.query(
      `ALTER TABLE unit_tool_runs ADD KEY ${q(indexName)} (unit_id, production_cycle_key, tool_source, status)`
    );
  }
}

async function inspect(connection) {
  const uuidIdentifierTypeId = await getUuidIdentifierTypeId(connection);
  const lotsColumns = await getColumnSet(connection, 'lots');
  const sourceColumns = await getColumnSet(connection, 'unit_field_sources');
  const runColumns = await getColumnSet(connection, 'unit_tool_runs');
  const specColumns = await getColumnSet(connection, 'unit_specifications');
  const legacyUuidRows = await countLegacyUuidRows(connection);
  const legacyUuidConflicts = uuidIdentifierTypeId
    ? await findLegacyUuidConflicts(connection, uuidIdentifierTypeId)
    : [];

  return {
    uuidIdentifierTypeId,
    legacyUuidColumn: specColumns.has('system_uuid'),
    legacyUuidRows,
    legacyUuidConflicts,
    missingLotPolicyColumns: LOT_POLICY_COLUMNS.filter((columnName) => !lotsColumns.has(columnName)),
    manualOverrideCycleColumn: sourceColumns.has('override_production_cycle_key'),
    toolRunCycleColumn: runColumns.has('production_cycle_key'),
    toolRunCycleIndex: await indexExists(connection, 'unit_tool_runs', 'idx_unit_tool_runs_unit_cycle_source')
  };
}

function printState(state, mode) {
  console.log(`\nBWTDallas API foundation reconciliation (${mode})`);
  console.log(`System UUID identifier binding (${SYSTEM_CONFIG_VALUE_IDS.IDENTIFIER_SYSTEM_UUID}): ${state.uuidIdentifierTypeId || 'missing'}`);
  console.log(`Legacy unit_specifications.system_uuid: ${state.legacyUuidColumn ? `present (${state.legacyUuidRows} populated row(s))` : 'removed'}`);
  console.log(`Lot Tool policy columns: ${state.missingLotPolicyColumns.length ? `missing ${state.missingLotPolicyColumns.join(', ')}` : 'present'}`);
  console.log(`unit_field_sources override cycle: ${state.manualOverrideCycleColumn ? 'present' : 'missing'}`);
  console.log(`unit_tool_runs production cycle: ${state.toolRunCycleColumn ? 'present' : 'missing'}`);
  console.log(`unit_tool_runs cycle/source index: ${state.toolRunCycleIndex ? 'present' : 'missing'}`);
  if (state.legacyUuidConflicts.length) {
    console.log(`Legacy UUID conflicts: Unit ID(s) ${state.legacyUuidConflicts.join(', ')}`);
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    await assertPrerequisites(connection);
    const before = await inspect(connection);
    printState(before, APPLY ? 'before apply' : 'dry-run');

    if (!APPLY) {
      const pending = [
        !before.uuidIdentifierTypeId && 'create/protect System UUID identifier binding',
        before.legacyUuidColumn && 'migrate legacy System UUID values to unit_identifiers and remove duplicate column',
        before.missingLotPolicyColumns.length && 'add inherited Lot Tool policy columns',
        !before.manualOverrideCycleColumn && 'add current-cycle manual override protection key',
        (!before.toolRunCycleColumn || !before.toolRunCycleIndex) && 'add server-owned Tool receipt production-cycle association'
      ].filter(Boolean);
      console.log(pending.length ? `\nPending operations:\n- ${pending.join('\n- ')}` : '\nNo schema operations are pending.');
      console.log('No database changes were made.');
      return;
    }

    const uuidIdentifierTypeId = await ensureUuidIdentifierBinding(connection);
    const uuidMigration = await migrateLegacyUuidRows(connection, uuidIdentifierTypeId);
    await ensureLotPolicyColumns(connection);
    await ensureManualOverrideCycleColumn(connection);
    await ensureToolRunCycleColumn(connection);

    const after = await inspect(connection);
    if (!after.uuidIdentifierTypeId
      || after.legacyUuidColumn
      || after.missingLotPolicyColumns.length
      || !after.manualOverrideCycleColumn
      || !after.toolRunCycleColumn
      || !after.toolRunCycleIndex
      || after.legacyUuidConflicts.length) {
      throw new Error('API foundation reconciliation verification failed after apply.');
    }

    printState(after, 'after apply');
    console.log(`Legacy UUID rows copied: ${uuidMigration.copied}; already present: ${uuidMigration.existing}.`);
    console.log('\nAPI foundation reconciliation applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
