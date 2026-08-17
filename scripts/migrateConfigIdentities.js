'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  CATEGORY_BINDINGS,
  VALUE_BINDINGS
} = require('../config/configIdentityRegistry');
const { getPlanErrors, planConfigIdentityBindings } = require('../services/configIdentityMigrationPlanner');
const { buildLegacyCodeRemovalDecision, groupIndexes } = require('../services/configIdentityFinalizationPolicy');
const { evaluateBindingTableSchema, evaluateProtectedColumnDefinition } = require('../services/configIdentityBindingSchemaPolicy');

const APPLY = process.argv.includes('--apply');
const FINALIZE = process.argv.includes('--finalize');

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

async function countRows(connection, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)}`);
  return Number(rows[0]?.row_count || 0);
}

async function loadConfigCategories(connection) {
  const columns = await getColumnSet(connection, 'config_categories');
  const codeExpression = columns.has('code') ? 'code' : 'NULL AS code';
  const [rows] = await connection.query(`SELECT config_category_id, ${codeExpression} FROM config_categories ORDER BY config_category_id`);
  return rows.map((row) => ({ id: Number(row.config_category_id), code: row.code || '' }));
}

async function loadConfigValues(connection) {
  const columns = await getColumnSet(connection, 'config_values');
  const codeExpression = columns.has('code') ? 'code' : 'NULL AS code';
  const [rows] = await connection.query(`SELECT config_value_id, config_category_id, ${codeExpression} FROM config_values ORDER BY config_value_id`);
  return rows.map((row) => ({
    id: Number(row.config_value_id),
    categoryId: Number(row.config_category_id),
    code: row.code || ''
  }));
}

async function loadExistingCategoryBindings(connection) {
  if (!await tableExists(connection, 'system_config_categories')) return new Map();
  const [rows] = await connection.query(
    'SELECT system_config_category_id, config_category_id FROM system_config_categories ORDER BY system_config_category_id'
  );
  return new Map(rows.map((row) => [Number(row.system_config_category_id), Number(row.config_category_id)]));
}

async function loadExistingValueBindings(connection) {
  if (!await tableExists(connection, 'system_config_values')) return new Map();
  const [rows] = await connection.query(
    'SELECT system_config_value_id, config_value_id FROM system_config_values ORDER BY system_config_value_id'
  );
  return new Map(rows.map((row) => [Number(row.system_config_value_id), Number(row.config_value_id)]));
}

async function inspect(connection) {
  for (const tableName of ['config_categories', 'config_values']) {
    if (!await tableExists(connection, tableName)) {
      throw new Error(`Configuration ID migration requires ${tableName}.`);
    }
  }

  const categoryColumns = await getColumnSet(connection, 'config_categories');
  const valueColumns = await getColumnSet(connection, 'config_values');
  const categoryIdDefinition = await getColumnDefinition(connection, 'config_categories', 'config_category_id');
  const valueIdDefinition = await getColumnDefinition(connection, 'config_values', 'config_value_id');
  const protectedDefinition = valueColumns.has('is_protected')
    ? await getColumnDefinition(connection, 'config_values', 'is_protected')
    : null;
  const protectedColumnIssues = protectedDefinition ? evaluateProtectedColumnDefinition(protectedDefinition) : [];
  if (!categoryIdDefinition || !valueIdDefinition) {
    throw new Error('Configuration primary key columns are missing.');
  }

  const categoryBindingTablePresent = await tableExists(connection, 'system_config_categories');
  const valueBindingTablePresent = await tableExists(connection, 'system_config_values');
  let categoryBindingSchemaIssues = [];
  let valueBindingSchemaIssues = [];
  let categoryBindingRowCount = 0;
  let valueBindingRowCount = 0;

  if (categoryBindingTablePresent) {
    categoryBindingRowCount = await countRows(connection, 'system_config_categories');
    categoryBindingSchemaIssues = evaluateBindingTableSchema(
      await getBindingTableMetadata(connection, 'system_config_categories'),
      {
        systemColumn: 'system_config_category_id',
        configColumn: 'config_category_id',
        configColumnType: String(categoryIdDefinition.COLUMN_TYPE || ''),
        referencedTable: 'config_categories',
        referencedColumn: 'config_category_id'
      }
    );
  }
  if (valueBindingTablePresent) {
    valueBindingRowCount = await countRows(connection, 'system_config_values');
    valueBindingSchemaIssues = evaluateBindingTableSchema(
      await getBindingTableMetadata(connection, 'system_config_values'),
      {
        systemColumn: 'system_config_value_id',
        configColumn: 'config_value_id',
        configColumnType: String(valueIdDefinition.COLUMN_TYPE || ''),
        referencedTable: 'config_values',
        referencedColumn: 'config_value_id'
      }
    );
  }

  const categoryBindings = categoryBindingTablePresent && categoryBindingSchemaIssues.length === 0
    ? await loadExistingCategoryBindings(connection)
    : new Map();
  const valueBindings = valueBindingTablePresent && valueBindingSchemaIssues.length === 0
    ? await loadExistingValueBindings(connection)
    : new Map();
  const configCategories = await loadConfigCategories(connection);
  const configValues = await loadConfigValues(connection);
  const plan = planConfigIdentityBindings({
    categories: configCategories,
    values: configValues,
    persistedCategoryBindings: categoryBindings,
    persistedValueBindings: valueBindings
  });

  let protectedCount = null;
  let unprotectedSystemValueCount = null;
  if (valueColumns.has('is_protected')) {
    const [rows] = await connection.query('SELECT COUNT(*) AS protected_count FROM config_values WHERE is_protected = 1');
    protectedCount = Number(rows[0]?.protected_count || 0);

    if (valueBindingTablePresent && valueBindingSchemaIssues.length === 0) {
      const [unprotectedRows] = await connection.query(`
        SELECT COUNT(*) AS row_count
        FROM system_config_values scv
        INNER JOIN config_values cv ON cv.config_value_id = scv.config_value_id
        WHERE COALESCE(cv.is_protected, 0) <> 1
      `);
      unprotectedSystemValueCount = Number(unprotectedRows[0]?.row_count || 0);
    }
  }

  return {
    categoryCount: await countRows(connection, 'config_categories'),
    valueCount: await countRows(connection, 'config_values'),
    categoryCodePresent: categoryColumns.has('code'),
    valueCodePresent: valueColumns.has('code'),
    protectedColumnPresent: valueColumns.has('is_protected'),
    protectedColumnIssues,
    protectedCount,
    unprotectedSystemValueCount,
    categoryBindingTablePresent,
    valueBindingTablePresent,
    categoryBindingSchemaIssues,
    valueBindingSchemaIssues,
    categoryBindingRowCount,
    valueBindingRowCount,
    categoryBindings,
    valueBindings,
    ...plan
  };
}

function printState(state, mode) {
  console.log(`\nConfiguration ID foundation (${mode})`);
  console.log(`Config categories: ${state.categoryCount}`);
  console.log(`Config values: ${state.valueCount}`);
  console.log(`config_categories.code: ${state.categoryCodePresent ? 'present' : 'removed'}`);
  console.log(`config_values.code: ${state.valueCodePresent ? 'present' : 'removed'}`);
  console.log(`config_values.is_protected: ${state.protectedColumnPresent ? `present (${state.protectedCount} protected)` : 'missing'}`);
  if (state.protectedColumnIssues.length) {
    console.log(`ERROR - config_values.is_protected schema issues: ${state.protectedColumnIssues.join('; ')}`);
  }
  if (state.unprotectedSystemValueCount !== null) {
    console.log(`Unprotected bound system values: ${state.unprotectedSystemValueCount}`);
  }
  console.log(`System category bindings: ${state.categoryBindings.size}/${CATEGORY_BINDINGS.length} persisted; ${state.resolvedCategories.size}/${CATEGORY_BINDINGS.length} resolvable`);
  console.log(`System value bindings: ${state.valueBindings.size}/${VALUE_BINDINGS.length} persisted; ${state.resolvedValues.size}/${VALUE_BINDINGS.length} resolvable`);
  if (state.categoryBindingSchemaIssues.length) {
    console.log(`${state.categoryBindingRowCount > 0 ? 'ERROR' : 'NOTICE'} - system_config_categories schema issues (${state.categoryBindingRowCount} row(s)): ${state.categoryBindingSchemaIssues.join('; ')}`);
  }
  if (state.valueBindingSchemaIssues.length) {
    console.log(`${state.valueBindingRowCount > 0 ? 'ERROR' : 'NOTICE'} - system_config_values schema issues (${state.valueBindingRowCount} row(s)): ${state.valueBindingSchemaIssues.join('; ')}`);
  }

  if (state.missingCategories.length) {
    console.log(`Optional/unavailable system categories: ${state.missingCategories.map((entry) => entry.name).join(', ')}`);
  }
  if (state.missingOptionalValues.length) {
    console.log(`Optional/unavailable system values: ${state.missingOptionalValues.map((entry) => entry.name).join(', ')}`);
  }
  if (state.missingRequiredValues.length) {
    console.log(`ERROR - missing required system values: ${state.missingRequiredValues.map((entry) => entry.name).join(', ')}`);
  }
  if (state.duplicateCategoryTargets.length) {
    console.log(`ERROR - duplicate system category targets: ${JSON.stringify(state.duplicateCategoryTargets)}`);
  }
  if (state.duplicateValueTargets.length) {
    console.log(`ERROR - duplicate system value targets: ${JSON.stringify(state.duplicateValueTargets)}`);
  }
  if (state.ambiguousCategories.length) {
    console.log(`ERROR - ambiguous system categories: ${JSON.stringify(state.ambiguousCategories)}`);
  }
  if (state.ambiguousValues.length) {
    console.log(`ERROR - ambiguous system values: ${JSON.stringify(state.ambiguousValues)}`);
  }
  if (state.invalidPersistedCategories.length || state.invalidPersistedValues.length) {
    console.log(`ERROR - invalid persisted system bindings: ${JSON.stringify([...state.invalidPersistedCategories, ...state.invalidPersistedValues])}`);
  }
  if (state.unknownPersistedCategoryBindings.length || state.unknownPersistedValueBindings.length) {
    console.log(`ERROR - unknown persisted system bindings: ${JSON.stringify([...state.unknownPersistedCategoryBindings, ...state.unknownPersistedValueBindings])}`);
  }
}

function assertSafeToApply(state) {
  const planErrors = getPlanErrors(state);
  if (state.protectedColumnIssues.length) {
    planErrors.push('config_values.is_protected has an incompatible schema.');
  }
  if (state.categoryBindingSchemaIssues.length && state.categoryBindingRowCount > 0) {
    planErrors.push('system_config_categories is populated but has an incompatible schema.');
  }
  if (state.valueBindingSchemaIssues.length && state.valueBindingRowCount > 0) {
    planErrors.push('system_config_values is populated but has an incompatible schema.');
  }
  if (planErrors.length) {
    throw new Error(`${planErrors.join(' ')} Resolve the audit errors before applying this migration.`);
  }

  const categoryBindingsUsable = state.categoryBindingTablePresent && state.categoryBindingSchemaIssues.length === 0;
  const valueBindingsUsable = state.valueBindingTablePresent && state.valueBindingSchemaIssues.length === 0;
  if ((!state.categoryCodePresent || !state.valueCodePresent)
      && (!categoryBindingsUsable || !valueBindingsUsable)) {
    throw new Error('Legacy code columns are already missing but numeric system binding tables are missing or incompatible. Refusing an unsafe repair.');
  }
}

async function getColumnDefinition(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function getBindingTableMetadata(connection, tableName) {
  const [columnRows, indexRows, foreignKeyRows] = await Promise.all([
    connection.query(
      `SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type, IS_NULLABLE AS is_nullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [tableName]
    ).then(([rows]) => rows),
    connection.query(
      `SELECT INDEX_NAME AS index_name, NON_UNIQUE AS non_unique,
              SEQ_IN_INDEX AS seq_in_index, COLUMN_NAME AS column_name
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [tableName]
    ).then(([rows]) => rows),
    connection.query(
      `SELECT
         kcu.CONSTRAINT_NAME AS constraint_name,
         kcu.COLUMN_NAME AS column_name,
         kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
         kcu.REFERENCED_COLUMN_NAME AS referenced_column_name,
         rc.UPDATE_RULE AS update_rule,
         rc.DELETE_RULE AS delete_rule
       FROM information_schema.KEY_COLUMN_USAGE kcu
       INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE kcu.TABLE_SCHEMA = DATABASE()
         AND kcu.TABLE_NAME = ?
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
      [tableName]
    ).then(([rows]) => rows)
  ]);

  const indexes = groupIndexes(indexRows);
  const primaryRows = indexRows
    .filter((row) => String(row.index_name || row.INDEX_NAME || '').toUpperCase() === 'PRIMARY')
    .sort((a, b) => Number(a.seq_in_index || a.SEQ_IN_INDEX || 0) - Number(b.seq_in_index || b.SEQ_IN_INDEX || 0));

  return {
    columns: columnRows.map((row) => ({
      name: row.column_name || row.COLUMN_NAME,
      type: row.column_type || row.COLUMN_TYPE,
      nullable: row.is_nullable || row.IS_NULLABLE
    })),
    primaryKeyColumns: primaryRows.map((row) => row.column_name || row.COLUMN_NAME),
    uniqueIndexes: indexes.filter((index) => Number(index.nonUnique) === 0),
    foreignKeys: foreignKeyRows.map((row) => ({
      name: row.constraint_name || row.CONSTRAINT_NAME,
      columnName: row.column_name || row.COLUMN_NAME,
      referencedTableName: row.referenced_table_name || row.REFERENCED_TABLE_NAME,
      referencedColumnName: row.referenced_column_name || row.REFERENCED_COLUMN_NAME,
      updateRule: row.update_rule || row.UPDATE_RULE,
      deleteRule: row.delete_rule || row.DELETE_RULE
    }))
  };
}

async function ensureBindingTable(connection, {
  tableName,
  systemColumn,
  configColumn,
  configColumnType,
  referencedTable,
  referencedColumn,
  createSql
}) {
  const schemaSpec = {
    systemColumn,
    configColumn,
    configColumnType,
    referencedTable,
    referencedColumn
  };

  if (await tableExists(connection, tableName)) {
    const issues = evaluateBindingTableSchema(await getBindingTableMetadata(connection, tableName), schemaSpec);
    if (issues.length) {
      const rowCount = await countRows(connection, tableName);
      if (rowCount > 0) {
        throw new Error(`${tableName} exists with ${rowCount} row(s) but has an incompatible schema: ${issues.join('; ')}. Refusing to replace a populated binding table.`);
      }
      await connection.query(`DROP TABLE ${quoteIdentifier(tableName)}`);
    }
  }

  if (!await tableExists(connection, tableName)) {
    await connection.query(createSql);
  }

  const verificationIssues = evaluateBindingTableSchema(await getBindingTableMetadata(connection, tableName), schemaSpec);
  if (verificationIssues.length) {
    throw new Error(`${tableName} schema verification failed after creation: ${verificationIssues.join('; ')}.`);
  }
}

async function createBindingTables(connection) {
  const categoryIdColumn = await getColumnDefinition(connection, 'config_categories', 'config_category_id');
  const valueIdColumn = await getColumnDefinition(connection, 'config_values', 'config_value_id');
  if (!categoryIdColumn || !valueIdColumn) {
    throw new Error('Configuration primary key columns are missing.');
  }
  const categoryIdType = String(categoryIdColumn.COLUMN_TYPE || '').trim();
  const valueIdType = String(valueIdColumn.COLUMN_TYPE || '').trim();
  if (!categoryIdType || !valueIdType) {
    throw new Error('Could not determine configuration primary key column types.');
  }

  await ensureBindingTable(connection, {
    tableName: 'system_config_categories',
    systemColumn: 'system_config_category_id',
    configColumn: 'config_category_id',
    configColumnType: categoryIdType,
    referencedTable: 'config_categories',
    referencedColumn: 'config_category_id',
    createSql: `
      CREATE TABLE system_config_categories (
        system_config_category_id SMALLINT UNSIGNED NOT NULL,
        config_category_id ${categoryIdType} NOT NULL,
        PRIMARY KEY (system_config_category_id),
        UNIQUE KEY uq_system_config_categories_config_category (config_category_id),
        CONSTRAINT fk_system_config_categories_category
          FOREIGN KEY (config_category_id) REFERENCES config_categories(config_category_id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `
  });

  await ensureBindingTable(connection, {
    tableName: 'system_config_values',
    systemColumn: 'system_config_value_id',
    configColumn: 'config_value_id',
    configColumnType: valueIdType,
    referencedTable: 'config_values',
    referencedColumn: 'config_value_id',
    createSql: `
      CREATE TABLE system_config_values (
        system_config_value_id SMALLINT UNSIGNED NOT NULL,
        config_value_id ${valueIdType} NOT NULL,
        PRIMARY KEY (system_config_value_id),
        UNIQUE KEY uq_system_config_values_config_value (config_value_id),
        CONSTRAINT fk_system_config_values_value
          FOREIGN KEY (config_value_id) REFERENCES config_values(config_value_id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `
  });
}

async function ensureProtectedColumn(connection) {
  const definition = await getColumnDefinition(connection, 'config_values', 'is_protected');
  if (!definition) {
    await connection.query('ALTER TABLE config_values ADD COLUMN is_protected TINYINT(1) NOT NULL DEFAULT 0');
    return;
  }

  const issues = evaluateProtectedColumnDefinition(definition);
  if (issues.length) {
    throw new Error(`config_values.is_protected exists with an incompatible schema: ${issues.join('; ')}. Refusing to alter it automatically.`);
  }
}

async function applyBindings(connection, state) {
  for (const [systemId, configId] of state.resolvedCategories) {
    await connection.query(
      `INSERT INTO system_config_categories (system_config_category_id, config_category_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_category_id = VALUES(config_category_id)`,
      [systemId, configId]
    );
  }
  for (const [systemId, configId] of state.resolvedValues) {
    await connection.query(
      `INSERT INTO system_config_values (system_config_value_id, config_value_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
      [systemId, configId]
    );
  }
  await connection.query(`
    UPDATE config_values cv
    JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
    SET cv.is_protected = 1
  `);
}

async function applyFoundation(connection, state) {
  assertSafeToApply(state);
  await createBindingTables(connection);
  await ensureProtectedColumn(connection);
  // Re-inspect after table/column creation so the persisted state participates in validation.
  const refreshed = await inspect(connection);
  assertSafeToApply(refreshed);
  await applyBindings(connection, refreshed);
}

async function getIndexRows(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME AS index_name, NON_UNIQUE AS non_unique,
            SEQ_IN_INDEX AS seq_in_index, COLUMN_NAME AS column_name
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tableName]
  );
  return rows;
}

async function getForeignKeysUsingColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT
       CONSTRAINT_NAME AS constraint_name,
       TABLE_NAME AS table_name,
       COLUMN_NAME AS column_name,
       REFERENCED_TABLE_NAME AS referenced_table_name,
       REFERENCED_COLUMN_NAME AS referenced_column_name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IS NOT NULL
       AND (
         (TABLE_NAME = ? AND COLUMN_NAME = ?)
         OR (REFERENCED_TABLE_NAME = ? AND REFERENCED_COLUMN_NAME = ?)
       )
     ORDER BY CONSTRAINT_NAME`,
    [tableName, columnName, tableName, columnName]
  );
  return rows.map((row) => ({
    name: String(row.constraint_name || row.CONSTRAINT_NAME || ''),
    direction: String(row.table_name || row.TABLE_NAME || '') === tableName ? 'outgoing' : 'incoming',
    tableName: String(row.table_name || row.TABLE_NAME || ''),
    columnName: String(row.column_name || row.COLUMN_NAME || ''),
    referencedTableName: String(row.referenced_table_name || row.REFERENCED_TABLE_NAME || ''),
    referencedColumnName: String(row.referenced_column_name || row.REFERENCED_COLUMN_NAME || '')
  }));
}

async function getCheckConstraints(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT tc.CONSTRAINT_NAME AS constraint_name, cc.CHECK_CLAUSE AS check_clause
     FROM information_schema.TABLE_CONSTRAINTS tc
     INNER JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
       AND tc.TABLE_NAME = ?
       AND tc.CONSTRAINT_TYPE = 'CHECK'
     ORDER BY tc.CONSTRAINT_NAME`,
    [tableName]
  );
  return rows.map((row) => ({
    name: String(row.constraint_name || row.CONSTRAINT_NAME || ''),
    expression: String(row.check_clause || row.CHECK_CLAUSE || '')
  }));
}

async function getGeneratedColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name, GENERATION_EXPRESSION AS generation_expression
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND NULLIF(TRIM(GENERATION_EXPRESSION), '') IS NOT NULL
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows.map((row) => ({
    name: String(row.column_name || row.COLUMN_NAME || ''),
    expression: String(row.generation_expression || row.GENERATION_EXPRESSION || '')
  }));
}

const APPROVED_LEGACY_CODE_COMPOSITE_INDEXES = Object.freeze({
  'config_values.code': [
    { name: 'uq_config_values_category_code', nonUnique: 0, columns: ['config_category_id', 'code'] }
  ]
});

async function buildLegacyCodeColumnRemovalPlan(connection, tableName, columnName) {
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) {
    return { tableName, columnName, present: false, safe: true, droppableIndexes: [], blockers: [] };
  }

  const decision = buildLegacyCodeRemovalDecision({
    indexRows: await getIndexRows(connection, tableName),
    foreignKeys: await getForeignKeysUsingColumn(connection, tableName, columnName),
    checkConstraints: await getCheckConstraints(connection, tableName),
    generatedColumns: await getGeneratedColumns(connection, tableName),
    approvedCompositeIndexes: APPROVED_LEGACY_CODE_COMPOSITE_INDEXES[`${tableName}.${columnName}`] || [],
    columnName
  });
  const blockers = [];
  if (decision.foreignKeys.length) {
    blockers.push(`foreign keys: ${decision.foreignKeys.map((fk) => `${fk.name} (${fk.direction})`).join(', ')}`);
  }
  if (decision.compositeIndexes.length) {
    blockers.push(`composite indexes: ${decision.compositeIndexes.map((index) => `${index.name} [${index.columns.join(', ')}]`).join(', ')}`);
  }
  if (decision.checkConstraints.length) {
    blockers.push(`check constraints: ${decision.checkConstraints.map((constraint) => constraint.name).join(', ')}`);
  }
  if (decision.generatedColumns.length) {
    blockers.push(`generated columns: ${decision.generatedColumns.map((column) => column.name).join(', ')}`);
  }

  return {
    tableName,
    columnName,
    present: true,
    safe: decision.safe,
    droppableIndexes: decision.droppableIndexes,
    blockers
  };
}

async function finalizeFoundation(connection, state) {
  assertSafeToApply(state);
  if (!state.categoryBindingTablePresent || !state.valueBindingTablePresent) {
    throw new Error('System configuration binding tables must be applied before finalization.');
  }
  if (state.categoryBindings.size !== state.resolvedCategories.size || state.valueBindings.size !== state.resolvedValues.size) {
    throw new Error('All resolvable system identities must be persisted before finalization.');
  }
  if (!state.protectedColumnPresent) {
    throw new Error('config_values.is_protected must exist before finalization.');
  }
  if (Number(state.unprotectedSystemValueCount || 0) !== 0) {
    throw new Error('Every bound system configuration value must be protected before finalization.');
  }

  const removalPlans = [];
  for (const [tableName, columnName] of [['config_values', 'code'], ['config_categories', 'code']]) {
    removalPlans.push(await buildLegacyCodeColumnRemovalPlan(connection, tableName, columnName));
  }
  const blockedPlans = removalPlans.filter((plan) => !plan.safe);
  if (blockedPlans.length) {
    throw new Error(`Legacy configuration code removal is blocked. ${blockedPlans.map((plan) => `${plan.tableName}.${plan.columnName}: ${plan.blockers.join('; ')}`).join(' | ')}`);
  }

  for (const plan of removalPlans) {
    if (!plan.present) continue;
    for (const index of plan.droppableIndexes) {
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(plan.tableName)} DROP INDEX ${quoteIdentifier(index.name)}`
      );
    }
    await connection.query(`ALTER TABLE ${quoteIdentifier(plan.tableName)} DROP COLUMN ${quoteIdentifier(plan.columnName)}`);
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    let state = await inspect(connection);
    printState(state, FINALIZE ? 'pre-finalize' : APPLY ? 'preflight' : 'dry-run');

    if (!APPLY && !FINALIZE) {
      assertSafeToApply(state);
      return;
    }

    if (FINALIZE) {
      await finalizeFoundation(connection, state);
      state = await inspect(connection);
      console.log('\nConfiguration code columns removed successfully.');
      printState(state, 'finalized');
      return;
    }

    await applyFoundation(connection, state);
    state = await inspect(connection);
    console.log('\nConfiguration ID bindings/protection applied successfully. Legacy code columns are intentionally still present for the compatibility checkpoint.');
    printState(state, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
