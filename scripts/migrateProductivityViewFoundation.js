'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const EXPECTED_CATEGORY = Object.freeze({
  configCategoryId: 17,
  systemConfigCategoryId: SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTIVITY_TYPES,
  name: 'Productivity Types'
});
const EXPECTED_VALUES = Object.freeze([
  Object.freeze({
    configValueId: 84,
    systemConfigValueId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_FULL_UNIT,
    value: 'full_unit',
    label: 'Full Unit'
  }),
  Object.freeze({
    configValueId: 85,
    systemConfigValueId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_SUPPORT,
    value: 'support',
    label: 'Support Work'
  }),
  Object.freeze({
    configValueId: 86,
    systemConfigValueId: SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_QC,
    value: 'qc',
    label: 'QC Work'
  })
]);

async function assertSchema(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (
         'config_categories', 'config_values', 'system_config_categories',
         'system_config_values', 'productivity_events'
       )`
  );
  const columnsByTable = new Map();
  for (const row of rows) {
    const tableName = row.table_name || row.TABLE_NAME;
    const columnName = row.column_name || row.COLUMN_NAME;
    if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, new Set());
    columnsByTable.get(tableName).add(columnName);
  }
  const requiredColumns = {
    config_categories: ['config_category_id', 'name'],
    config_values: ['config_value_id', 'config_category_id', 'value', 'label', 'is_active', 'is_protected'],
    system_config_categories: ['system_config_category_id', 'config_category_id'],
    system_config_values: ['system_config_value_id', 'config_value_id'],
    productivity_events: ['user_id', 'credited_at', 'productivity_type_config_value_id', 'productivity_units']
  };
  const missing = [];
  for (const [tableName, columnNames] of Object.entries(requiredColumns)) {
    const available = columnsByTable.get(tableName) || new Set();
    for (const columnName of columnNames) {
      if (!available.has(columnName)) missing.push(`${tableName}.${columnName}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Productivity view foundation is missing required schema: ${missing.join(', ')}.`);
  }
}

async function loadState(connection) {
  const [categoryRows] = await connection.query(
    'SELECT config_category_id, name FROM config_categories WHERE config_category_id = ? LIMIT 1',
    [EXPECTED_CATEGORY.configCategoryId]
  );
  const valueIds = EXPECTED_VALUES.map((entry) => entry.configValueId);
  const [valueRows] = await connection.query(
    `SELECT config_value_id, config_category_id, value, label, is_active, is_protected
     FROM config_values
     WHERE config_value_id IN (${valueIds.map(() => '?').join(', ')})
     ORDER BY config_value_id`,
    valueIds
  );
  const [categoryBindingRows] = await connection.query(
    `SELECT system_config_category_id, config_category_id
     FROM system_config_categories
     WHERE system_config_category_id = ? OR config_category_id = ?`,
    [EXPECTED_CATEGORY.systemConfigCategoryId, EXPECTED_CATEGORY.configCategoryId]
  );
  const systemValueIds = EXPECTED_VALUES.map((entry) => entry.systemConfigValueId);
  const [valueBindingRows] = await connection.query(
    `SELECT system_config_value_id, config_value_id
     FROM system_config_values
     WHERE system_config_value_id IN (${systemValueIds.map(() => '?').join(', ')})
        OR config_value_id IN (${valueIds.map(() => '?').join(', ')})
     ORDER BY system_config_value_id`,
    [...systemValueIds, ...valueIds]
  );
  const [eventRows] = await connection.query('SELECT COUNT(*) AS event_count FROM productivity_events');
  const [viewRows] = await connection.query(
    `SELECT VIEW_DEFINITION AS view_definition
     FROM information_schema.VIEWS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tech_daily_productivity'`
  );
  let viewReadable = false;
  let viewError = '';
  try {
    await connection.query('SELECT COUNT(*) AS row_count FROM tech_daily_productivity');
    viewReadable = true;
  } catch (error) {
    viewError = error.message;
  }
  return {
    category: categoryRows[0] || null,
    values: valueRows,
    categoryBindings: categoryBindingRows,
    valueBindings: valueBindingRows,
    eventCount: Number(eventRows[0]?.event_count || eventRows[0]?.EVENT_COUNT || 0),
    viewDefinition: String(viewRows[0]?.view_definition || viewRows[0]?.VIEW_DEFINITION || ''),
    viewReadable,
    viewError
  };
}

function assertExpectedState(state) {
  if (
    !state.category
    || Number(state.category.config_category_id) !== EXPECTED_CATEGORY.configCategoryId
    || state.category.name !== EXPECTED_CATEGORY.name
  ) {
    throw new Error('Configuration category #17 is not the confirmed Productivity Types category.');
  }
  for (const expected of EXPECTED_VALUES) {
    const actual = state.values.find((row) => Number(row.config_value_id) === expected.configValueId);
    if (
      !actual
      || Number(actual.config_category_id) !== EXPECTED_CATEGORY.configCategoryId
      || actual.value !== expected.value
      || actual.label !== expected.label
      || Number(actual.is_active) !== 1
    ) {
      throw new Error(`Configuration value #${expected.configValueId} no longer matches the confirmed productivity identity.`);
    }
  }
  for (const row of state.categoryBindings) {
    if (
      Number(row.system_config_category_id) !== EXPECTED_CATEGORY.systemConfigCategoryId
      || Number(row.config_category_id) !== EXPECTED_CATEGORY.configCategoryId
    ) {
      throw new Error('A conflicting Productivity Types system-category binding exists.');
    }
  }
  for (const row of state.valueBindings) {
    const expected = EXPECTED_VALUES.find((entry) => (
      entry.systemConfigValueId === Number(row.system_config_value_id)
      || entry.configValueId === Number(row.config_value_id)
    ));
    if (
      !expected
      || expected.systemConfigValueId !== Number(row.system_config_value_id)
      || expected.configValueId !== Number(row.config_value_id)
    ) {
      throw new Error('A conflicting productivity system-value binding exists.');
    }
  }
}

function printState(state, mode) {
  const protectedValues = state.values.filter((row) => Number(row.is_protected) === 1).length;
  console.log(`\nProductivity view foundation (${mode})`);
  console.log(`Productivity category: #${EXPECTED_CATEGORY.configCategoryId} ${EXPECTED_CATEGORY.name}`);
  console.log(`Productivity values: ${state.values.length}/${EXPECTED_VALUES.length} confirmed`);
  console.log(`System category binding: ${state.categoryBindings.length ? 'present' : 'missing'}`);
  console.log(`System value bindings: ${state.valueBindings.length}/${EXPECTED_VALUES.length} present`);
  console.log(`Protected productivity values: ${protectedValues}/${EXPECTED_VALUES.length}`);
  console.log(`Productivity events: ${state.eventCount}`);
  console.log(`tech_daily_productivity: ${state.viewReadable ? 'readable' : 'invalid'}`);
  if (state.viewError) console.log(`View error: ${state.viewError}`);
}

async function applyBindings(connection) {
  await connection.beginTransaction();
  try {
    await connection.query(
      `INSERT INTO system_config_categories (system_config_category_id, config_category_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_category_id = VALUES(config_category_id)`,
      [EXPECTED_CATEGORY.systemConfigCategoryId, EXPECTED_CATEGORY.configCategoryId]
    );
    for (const expected of EXPECTED_VALUES) {
      await connection.query(
        `INSERT INTO system_config_values (system_config_value_id, config_value_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
        [expected.systemConfigValueId, expected.configValueId]
      );
    }
    await connection.query(
      `UPDATE config_values
       SET is_protected = 1
       WHERE config_value_id IN (${EXPECTED_VALUES.map(() => '?').join(', ')})`,
      EXPECTED_VALUES.map((entry) => entry.configValueId)
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function replaceView(connection) {
  await connection.query(`
    CREATE OR REPLACE ALGORITHM=UNDEFINED
    SQL SECURITY DEFINER
    VIEW tech_daily_productivity AS
    SELECT
      pe.user_id AS user_id,
      CAST(pe.credited_at AS DATE) AS productivity_date,
      SUM(CASE WHEN type_system.system_config_value_id = ${SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_FULL_UNIT}
        THEN pe.productivity_units ELSE 0 END) AS full_unit_productivity,
      SUM(CASE WHEN type_system.system_config_value_id = ${SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_SUPPORT}
        THEN pe.productivity_units ELSE 0 END) AS support_productivity,
      SUM(CASE WHEN type_system.system_config_value_id = ${SYSTEM_CONFIG_VALUE_IDS.PRODUCTIVITY_QC}
        THEN pe.productivity_units ELSE 0 END) AS qc_productivity,
      SUM(pe.productivity_units) AS weighted_productivity
    FROM productivity_events pe
    LEFT JOIN system_config_values type_system
      ON type_system.config_value_id = pe.productivity_type_config_value_id
    GROUP BY pe.user_id, CAST(pe.credited_at AS DATE)
  `);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    await assertSchema(connection);
    const before = await loadState(connection);
    assertExpectedState(before);
    printState(before, APPLY ? 'preflight before apply' : 'dry-run');
    if (!APPLY) {
      console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
      return;
    }
    await applyBindings(connection);
    await replaceView(connection);
    const after = await loadState(connection);
    assertExpectedState(after);
    printState(after, 'applied');
    if (
      after.categoryBindings.length !== 1
      || after.valueBindings.length !== EXPECTED_VALUES.length
      || after.values.some((row) => Number(row.is_protected) !== 1)
      || !after.viewReadable
      || !/system_config_values/i.test(after.viewDefinition)
      || /\.code\b/i.test(after.viewDefinition)
    ) {
      throw new Error('Productivity view foundation verification failed after apply.');
    }
    console.log('\nProductivity view foundation repaired successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
