'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function countRows(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return Number(rows[0]?.row_count || 0);
}

async function listLegacyMultipleCreditUnits(connection) {
  const [rows] = await connection.query(
    `
      SELECT unit_id, COUNT(*) AS completion_count
      FROM unit_work_completions
      WHERE credit_source = 'manual_completion'
        AND reversed_at IS NULL
      GROUP BY unit_id
      HAVING COUNT(*) > 1
      ORDER BY completion_count DESC, unit_id
      LIMIT 25
    `
  );

  return rows.map((row) => ({
    unitId: Number(row.unit_id),
    completionCount: Number(row.completion_count || 0)
  }));
}

async function inspect(connection) {
  const blockingIssues = [];
  const operations = [];
  const requiredTables = ['lots', 'unit_lot_history', 'unit_work_completions'];

  for (const tableName of requiredTables) {
    if (!await tableExists(connection, tableName)) {
      blockingIssues.push(`${tableName} is missing.`);
    }
  }

  if (blockingIssues.length > 0) {
    return { blockingIssues, operations, counts: {} };
  }

  const requiredColumns = [
    ['lots', 'lot_id'],
    ['unit_lot_history', 'unit_lot_history_id'],
    ['unit_lot_history', 'unit_id'],
    ['unit_lot_history', 'to_lot_id'],
    ['unit_work_completions', 'unit_work_completion_id'],
    ['unit_work_completions', 'unit_id'],
    ['unit_work_completions', 'credit_source'],
    ['unit_work_completions', 'reversed_at']
  ];

  for (const [tableName, columnName] of requiredColumns) {
    if (!await getColumn(connection, tableName, columnName)) {
      blockingIssues.push(`${tableName}.${columnName} is required before production-cycle migration.`);
    }
  }

  const targetColumns = [
    {
      tableName: 'lots',
      columnName: 'start_new_production_cycle_on_move',
      expectedTypes: ['tinyint'],
      ddl: `ALTER TABLE lots ADD COLUMN start_new_production_cycle_on_move TINYINT(1) NOT NULL DEFAULT 0`
    },
    {
      tableName: 'unit_lot_history',
      columnName: 'starts_new_production_cycle',
      expectedTypes: ['tinyint'],
      ddl: `ALTER TABLE unit_lot_history ADD COLUMN starts_new_production_cycle TINYINT(1) NOT NULL DEFAULT 0`
    },
    {
      tableName: 'unit_lot_history',
      columnName: 'production_cycle_key',
      expectedTypes: ['varchar'],
      ddl: `ALTER TABLE unit_lot_history ADD COLUMN production_cycle_key VARCHAR(191) NULL`
    },
    {
      tableName: 'unit_work_completions',
      columnName: 'production_cycle_key',
      expectedTypes: ['varchar'],
      ddl: `ALTER TABLE unit_work_completions ADD COLUMN production_cycle_key VARCHAR(191) NULL`
    },
    {
      tableName: 'unit_work_completions',
      columnName: 'grants_production_credit',
      expectedTypes: ['tinyint'],
      ddl: `ALTER TABLE unit_work_completions ADD COLUMN grants_production_credit TINYINT(1) NOT NULL DEFAULT 1`
    }
  ];

  for (const target of targetColumns) {
    const column = await getColumn(connection, target.tableName, target.columnName);
    if (!column) {
      operations.push({ kind: 'add_column', ...target });
      continue;
    }

    if (!target.expectedTypes.includes(String(column.DATA_TYPE || '').toLowerCase())) {
      blockingIssues.push(
        `${target.tableName}.${target.columnName} already exists as ${column.COLUMN_TYPE}; refusing to overwrite an incompatible column.`
      );
    }
  }

  const generatedColumn = await getColumn(
    connection,
    'unit_work_completions',
    'active_production_credit_cycle_key'
  );
  if (!generatedColumn) {
    operations.push({
      kind: 'add_generated_column',
      tableName: 'unit_work_completions',
      columnName: 'active_production_credit_cycle_key',
      ddl: `ALTER TABLE unit_work_completions ADD COLUMN active_production_credit_cycle_key VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN credit_source = 'manual_completion' AND reversed_at IS NULL AND grants_production_credit = 1 THEN production_cycle_key ELSE NULL END) STORED`
    });
  } else if (!String(generatedColumn.EXTRA || '').toLowerCase().includes('generated')) {
    blockingIssues.push(
      'unit_work_completions.active_production_credit_cycle_key already exists but is not a generated column; refusing to replace it.'
    );
  }

  const indexes = [
    {
      tableName: 'unit_lot_history',
      indexName: 'idx_unit_lot_history_production_cycle',
      ddl: `ALTER TABLE unit_lot_history ADD KEY idx_unit_lot_history_production_cycle (unit_id, production_cycle_key)`
    },
    {
      tableName: 'unit_work_completions',
      indexName: 'idx_unit_work_completions_production_cycle',
      ddl: `ALTER TABLE unit_work_completions ADD KEY idx_unit_work_completions_production_cycle (unit_id, production_cycle_key)`
    },
    {
      tableName: 'unit_work_completions',
      indexName: 'uniq_unit_work_completions_active_production_credit',
      ddl: `ALTER TABLE unit_work_completions ADD UNIQUE KEY uniq_unit_work_completions_active_production_credit (active_production_credit_cycle_key)`
    }
  ];

  for (const target of indexes) {
    if (!await indexExists(connection, target.tableName, target.indexName)) {
      operations.push({ kind: 'add_index', ...target });
    }
  }

  const legacyMultipleCreditUnits = await listLegacyMultipleCreditUnits(connection);
  const counts = {
    workCompletions: await countRows(connection, 'SELECT COUNT(*) AS row_count FROM unit_work_completions'),
    legacyCompletionKeysNeeded: await getColumn(connection, 'unit_work_completions', 'production_cycle_key')
      ? await countRows(
        connection,
        `SELECT COUNT(*) AS row_count FROM unit_work_completions WHERE production_cycle_key IS NULL OR production_cycle_key = ''`
      )
      : null,
    newCycleLots: await getColumn(connection, 'lots', 'start_new_production_cycle_on_move')
      ? await countRows(connection, 'SELECT COUNT(*) AS row_count FROM lots WHERE start_new_production_cycle_on_move = 1')
      : 0,
    unitsWithMultipleLegacyManualCredits: await countRows(
      connection,
      `
        SELECT COUNT(*) AS row_count
        FROM (
          SELECT unit_id
          FROM unit_work_completions
          WHERE credit_source = 'manual_completion'
            AND reversed_at IS NULL
          GROUP BY unit_id
          HAVING COUNT(*) > 1
        ) multiple_credit_units
      `
    )
  };

  return { blockingIssues, operations, counts, legacyMultipleCreditUnits };
}

function printReport(report) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'audit', ...report }, null, 2));
    return;
  }

  console.log(`Mode: ${APPLY ? 'apply' : 'audit'}`);
  console.log(`Existing work-completion rows: ${report.counts?.workCompletions ?? 'unknown'}`);
  console.log(`Legacy completion rows needing production-cycle keys: ${report.counts?.legacyCompletionKeysNeeded ?? 'column not installed yet'}`);
  console.log(`Lots currently configured to start a new production cycle on move: ${report.counts?.newCycleLots ?? 0}`);

  console.log(`Units with multiple existing active manual completion credits: ${report.counts?.unitsWithMultipleLegacyManualCredits ?? 0}`);
  if (Array.isArray(report.legacyMultipleCreditUnits) && report.legacyMultipleCreditUnits.length > 0) {
    console.log('Existing multiple-credit Units are preserved intentionally; the migration cannot safely guess which historical credits were legitimate rework. The first 25 are listed below.');
    report.legacyMultipleCreditUnits.forEach((entry) => {
      console.log(`- Unit ${entry.unitId}: ${entry.completionCount} active manual completion credits`);
    });
  }

  if (report.operations.length > 0) {
    console.log('\nPending schema operations:');
    report.operations.forEach((operation) => {
      console.log(`- ${operation.kind}: ${operation.tableName}.${operation.columnName || operation.indexName}`);
    });
  } else {
    console.log('\nProduction-cycle schema is already installed.');
  }

  if (report.blockingIssues.length > 0) {
    console.log('\nBlocking issues:');
    report.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (!APPLY) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function backfillLegacyCompletionKeys(connection) {
  const productionCycleColumn = await getColumn(connection, 'unit_work_completions', 'production_cycle_key');
  const grantsColumn = await getColumn(connection, 'unit_work_completions', 'grants_production_credit');
  if (!productionCycleColumn || !grantsColumn) {
    throw new Error('Production-cycle completion columns were not created successfully.');
  }

  await connection.query(
    `
      UPDATE unit_work_completions
      SET
        production_cycle_key = CONCAT('legacy:', unit_id, ':', unit_work_completion_id),
        grants_production_credit = 1
      WHERE production_cycle_key IS NULL
         OR production_cycle_key = ''
    `
  );
}

async function applyMigration(connection, initialReport) {
  for (const operation of initialReport.operations.filter((entry) => entry.kind === 'add_column')) {
    await connection.query(operation.ddl);
  }

  await backfillLegacyCompletionKeys(connection);

  for (const operation of initialReport.operations.filter((entry) => entry.kind === 'add_generated_column')) {
    await connection.query(operation.ddl);
  }

  for (const operation of initialReport.operations.filter((entry) => entry.kind === 'add_index')) {
    await connection.query(operation.ddl);
  }

  const remainingNullKeys = await countRows(
    connection,
    `SELECT COUNT(*) AS row_count FROM unit_work_completions WHERE production_cycle_key IS NULL OR production_cycle_key = ''`
  );
  if (remainingNullKeys !== 0) {
    throw new Error(`Production-cycle backfill left ${remainingNullKeys} completion rows without a cycle key.`);
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const initialReport = await inspect(connection);
    if (initialReport.blockingIssues.length > 0) {
      printReport(initialReport);
      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      printReport(initialReport);
      return;
    }

    await applyMigration(connection, initialReport);
    const verified = await inspect(connection);
    if (verified.blockingIssues.length > 0 || verified.operations.length > 0) {
      throw new Error('Production-cycle schema verification failed after migration.');
    }

    printReport(verified);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
