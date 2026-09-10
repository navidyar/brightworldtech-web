'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const RETIRED_CAMERA_CATEGORY_SYSTEM_ID = 9;
const RETIRED_PHYSICAL_CAMERA_REQUIREMENT_SYSTEM_ID = 320;
function quoteIdentifier(value) {
  return `\`${String(value || '').replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) === 1;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count || 0) === 1;
}

async function countWhere(connection, tableName, whereSql = '', params = []) {
  if (!await tableExists(connection, tableName)) return null;
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)}${whereSql ? ` WHERE ${whereSql}` : ''}`,
    params
  );
  return Number(row?.row_count || 0);
}

async function getSystemBinding(connection, tableName, systemColumn, configColumn, systemId) {
  if (!await tableExists(connection, tableName)) return null;
  const [rows] = await connection.query(
    `SELECT ${quoteIdentifier(configColumn)} AS config_id
     FROM ${quoteIdentifier(tableName)}
     WHERE ${quoteIdentifier(systemColumn)} = ?
     LIMIT 1`,
    [systemId]
  );
  return rows[0]?.config_id ? Number(rows[0].config_id) : null;
}

async function getViewReferences(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.VIEWS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         LOWER(VIEW_DEFINITION) LIKE '%hardware_notes%'
         OR LOWER(VIEW_DEFINITION) LIKE '%cosmetic_notes%'
         OR LOWER(VIEW_DEFINITION) LIKE '%physical_camera_status_config_value_id%'
       )
     ORDER BY TABLE_NAME`
  );
  return rows.map((row) => row.table_name);
}

async function inspect(connection) {
  for (const tableName of ['units', 'unit_specifications', 'config_categories', 'config_values', 'system_config_categories', 'system_config_values']) {
    if (!await tableExists(connection, tableName)) {
      throw new Error(`Legacy Unit field removal requires the existing ${tableName} table.`);
    }
  }

  const cameraCategoryId = await getSystemBinding(
    connection,
    'system_config_categories',
    'system_config_category_id',
    'config_category_id',
    RETIRED_CAMERA_CATEGORY_SYSTEM_ID
  );
  const physicalCameraRequirementTypeId = await getSystemBinding(
    connection,
    'system_config_values',
    'system_config_value_id',
    'config_value_id',
    RETIRED_PHYSICAL_CAMERA_REQUIREMENT_SYSTEM_ID
  );

  const state = {
    unitHardwareNotesColumn: await columnExists(connection, 'units', 'hardware_notes'),
    unitCosmeticNotesColumn: await columnExists(connection, 'units', 'cosmetic_notes'),
    physicalCameraColumn: await columnExists(connection, 'unit_specifications', 'physical_camera_status_config_value_id'),
    hardwareNotesRows: null,
    cosmeticNotesRows: null,
    physicalCameraRows: null,
    cameraCategoryId,
    cameraCategoryValueCount: cameraCategoryId
      ? await countWhere(connection, 'config_values', 'config_category_id = ?', [cameraCategoryId])
      : 0,
    physicalCameraRequirementTypeId,
    physicalCameraRequirementCount: physicalCameraRequirementTypeId
      ? await countWhere(connection, 'lot_requirements', 'requirement_type_config_value_id = ?', [physicalCameraRequirementTypeId])
      : 0,
    physicalCameraSuppressionCount: physicalCameraRequirementTypeId
      ? await countWhere(connection, 'lot_requirement_inheritance_suppressions', 'requirement_type_config_value_id = ?', [physicalCameraRequirementTypeId])
      : 0,
    physicalCameraFormRuleCount: await countWhere(connection, 'lot_unit_form_field_rules', 'field_key = ?', ['physical_camera_status']),
    physicalCameraFieldSourceCount: await countWhere(connection, 'unit_field_sources', 'field_key = ?', ['physical_camera_status']),
    viewReferences: await getViewReferences(connection)
  };

  if (state.unitHardwareNotesColumn) {
    state.hardwareNotesRows = await countWhere(connection, 'units', "hardware_notes IS NOT NULL AND TRIM(hardware_notes) <> ''");
  }
  if (state.unitCosmeticNotesColumn) {
    state.cosmeticNotesRows = await countWhere(connection, 'units', "cosmetic_notes IS NOT NULL AND TRIM(cosmetic_notes) <> ''");
  }
  if (state.physicalCameraColumn) {
    state.physicalCameraRows = await countWhere(connection, 'unit_specifications', 'physical_camera_status_config_value_id IS NOT NULL');
  }

  return state;
}

function printReport(state, mode) {
  console.log(`\nLegacy Unit field removal (${mode})`);
  console.log(`units.hardware_notes: ${state.unitHardwareNotesColumn ? `present (${state.hardwareNotesRows} populated)` : 'removed'}`);
  console.log(`units.cosmetic_notes: ${state.unitCosmeticNotesColumn ? `present (${state.cosmeticNotesRows} populated)` : 'removed'}`);
  console.log(`unit_specifications.physical_camera_status_config_value_id: ${state.physicalCameraColumn ? `present (${state.physicalCameraRows} populated)` : 'removed'}`);
  console.log(`Retired Camera Statuses category binding: ${state.cameraCategoryId ? `present -> config category ${state.cameraCategoryId} (${state.cameraCategoryValueCount} values)` : 'removed'}`);
  console.log(`Retired Physical Camera requirement binding: ${state.physicalCameraRequirementTypeId ? `present -> config value ${state.physicalCameraRequirementTypeId}` : 'removed'}`);
  console.log(`Physical Camera Lot requirements: ${state.physicalCameraRequirementCount ?? 'table unavailable'}`);
  console.log(`Physical Camera inheritance suppressions: ${state.physicalCameraSuppressionCount ?? 'table unavailable'}`);
  console.log(`Physical Camera Unit Form rules: ${state.physicalCameraFormRuleCount ?? 'table unavailable'}`);
  console.log(`Physical Camera field-source rows: ${state.physicalCameraFieldSourceCount ?? 'table unavailable'}`);
  console.log(`Dependent DB views: ${state.viewReferences.length ? state.viewReferences.join(', ') : 'none'}`);
}

async function dropColumnAndForeignKeys(connection, tableName, columnName) {
  if (!await columnExists(connection, tableName, columnName)) return;

  const [foreignKeys] = await connection.query(
    `SELECT DISTINCT CONSTRAINT_NAME AS constraint_name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName, columnName]
  );

  for (const row of foreignKeys) {
    await connection.query(
      `ALTER TABLE ${quoteIdentifier(tableName)} DROP FOREIGN KEY ${quoteIdentifier(row.constraint_name)}`
    );
  }

  await connection.query(
    `ALTER TABLE ${quoteIdentifier(tableName)} DROP COLUMN ${quoteIdentifier(columnName)}`
  );
}

async function deleteIfPresent(connection, tableName, whereSql, params) {
  if (!await tableExists(connection, tableName)) return 0;
  const [result] = await connection.query(
    `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${whereSql}`,
    params
  );
  return Number(result.affectedRows || 0);
}

async function applyMigration(connection, initialState) {
  if (initialState.viewReferences.length) {
    throw new Error(`Refusing schema cleanup while dependent DB view(s) still reference retired columns: ${initialState.viewReferences.join(', ')}`);
  }

  const requirementTypeId = initialState.physicalCameraRequirementTypeId;
  if (requirementTypeId) {
    await deleteIfPresent(connection, 'lot_requirement_inheritance_suppressions', 'requirement_type_config_value_id = ?', [requirementTypeId]);
    await deleteIfPresent(connection, 'lot_requirements', 'requirement_type_config_value_id = ?', [requirementTypeId]);
  }
  await deleteIfPresent(connection, 'lot_unit_form_field_rules', 'field_key = ?', ['physical_camera_status']);
  await deleteIfPresent(connection, 'unit_field_sources', 'field_key = ?', ['physical_camera_status']);

  await dropColumnAndForeignKeys(connection, 'unit_specifications', 'physical_camera_status_config_value_id');
  await dropColumnAndForeignKeys(connection, 'units', 'hardware_notes');
  await dropColumnAndForeignKeys(connection, 'units', 'cosmetic_notes');

  if (requirementTypeId) {
    await deleteIfPresent(connection, 'system_config_values', 'system_config_value_id = ?', [RETIRED_PHYSICAL_CAMERA_REQUIREMENT_SYSTEM_ID]);
    await deleteIfPresent(connection, 'config_values', 'config_value_id = ?', [requirementTypeId]);
  } else {
    await deleteIfPresent(connection, 'system_config_values', 'system_config_value_id = ?', [RETIRED_PHYSICAL_CAMERA_REQUIREMENT_SYSTEM_ID]);
  }

  const cameraCategoryId = initialState.cameraCategoryId;
  if (cameraCategoryId) {
    const [cameraValues] = await connection.query(
      'SELECT config_value_id FROM config_values WHERE config_category_id = ? ORDER BY config_value_id',
      [cameraCategoryId]
    );
    const valueIds = cameraValues.map((row) => Number(row.config_value_id)).filter(Boolean);
    if (valueIds.length) {
      const placeholders = valueIds.map(() => '?').join(', ');
      await connection.query(`DELETE FROM system_config_values WHERE config_value_id IN (${placeholders})`, valueIds);
      await connection.query(`DELETE FROM config_values WHERE config_value_id IN (${placeholders})`, valueIds);
    }
    await deleteIfPresent(connection, 'system_config_categories', 'system_config_category_id = ?', [RETIRED_CAMERA_CATEGORY_SYSTEM_ID]);
    await deleteIfPresent(connection, 'config_categories', 'config_category_id = ?', [cameraCategoryId]);
  } else {
    await deleteIfPresent(connection, 'system_config_categories', 'system_config_category_id = ?', [RETIRED_CAMERA_CATEGORY_SYSTEM_ID]);
  }

  return inspect(connection);
}

function assertApplied(state) {
  const failures = [];
  if (state.unitHardwareNotesColumn) failures.push('units.hardware_notes still exists');
  if (state.unitCosmeticNotesColumn) failures.push('units.cosmetic_notes still exists');
  if (state.physicalCameraColumn) failures.push('unit_specifications.physical_camera_status_config_value_id still exists');
  if (state.cameraCategoryId) failures.push('retired Camera Statuses category binding still exists');
  if (state.physicalCameraRequirementTypeId) failures.push('retired Physical Camera requirement binding still exists');
  if (Number(state.physicalCameraRequirementCount || 0) > 0) failures.push('Physical Camera Lot requirements remain');
  if (Number(state.physicalCameraSuppressionCount || 0) > 0) failures.push('Physical Camera inheritance suppressions remain');
  if (Number(state.physicalCameraFormRuleCount || 0) > 0) failures.push('Physical Camera Unit Form rules remain');
  if (Number(state.physicalCameraFieldSourceCount || 0) > 0) failures.push('Physical Camera field-source rows remain');
  if (state.viewReferences.length) failures.push('dependent DB views remain');
  if (failures.length) throw new Error(`Legacy Unit field removal incomplete: ${failures.join('; ')}.`);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const initialState = await inspect(connection);
    printReport(initialState, APPLY ? 'preflight' : 'dry-run');
    if (!APPLY) return;

    const finalState = await applyMigration(connection, initialState);
    assertApplied(finalState);
    console.log('\nLegacy Unit field removal completed successfully.');
    printReport(finalState, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
