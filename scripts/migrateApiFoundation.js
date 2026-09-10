'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');

const TABLE_DEFINITIONS = Object.freeze({
  api_tool_sessions: {
    requiredColumns: [
      'api_tool_session_id', 'user_id', 'tool_source', 'token_hash', 'created_at',
      'expires_at', 'last_used_at', 'revoked_at'
    ],
    ddl: `CREATE TABLE api_tool_sessions (
      api_tool_session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      tool_source ENUM('scantool', 'techtools') NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      last_used_at DATETIME NULL,
      revoked_at DATETIME NULL,
      PRIMARY KEY (api_tool_session_id),
      UNIQUE KEY uniq_api_tool_sessions_token_hash (token_hash),
      KEY idx_api_tool_sessions_user_source (user_id, tool_source, expires_at),
      CONSTRAINT fk_api_tool_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  },
  unit_tool_runs: {
    requiredColumns: [
      'tool_run_id', 'unit_id', 'tool_source', 'user_id', 'report_id', 'report_schema',
      'tool_version', 'collected_at', 'received_at', 'completed_at', 'production_cycle_key', 'status'
    ],
    ddl: `CREATE TABLE unit_tool_runs (
      tool_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id BIGINT NOT NULL,
      tool_source ENUM('scantool', 'techtools') NOT NULL,
      user_id INT NOT NULL,
      report_id VARCHAR(191) NOT NULL,
      report_schema VARCHAR(100) NULL,
      tool_version VARCHAR(100) NULL,
      collected_at DATETIME NULL,
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      production_cycle_key VARCHAR(191) NULL,
      status ENUM('in_progress', 'completed', 'failed') NOT NULL DEFAULT 'in_progress',
      PRIMARY KEY (tool_run_id),
      UNIQUE KEY uniq_unit_tool_runs_source_report (tool_source, report_id),
      KEY idx_unit_tool_runs_unit_received (unit_id, received_at),
      KEY idx_unit_tool_runs_user_received (user_id, received_at),
      KEY idx_unit_tool_runs_unit_cycle_source (unit_id, production_cycle_key, tool_source, status),
      CONSTRAINT fk_unit_tool_runs_unit
        FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE,
      CONSTRAINT fk_unit_tool_runs_user
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  }
});

async function tableExists(connection, tableName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS row_count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(row?.row_count || 0) === 1;
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function getIndexes(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.INDEX_NAME)));
}

async function countRows(connection, tableName) {
  if (!await tableExists(connection, tableName)) return null;
  const [[row]] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${tableName}\``);
  return Number(row?.row_count || 0);
}

async function inspect(connection) {
  for (const dependency of ['users', 'units']) {
    if (!await tableExists(connection, dependency)) {
      throw new Error(`API foundation requires the existing ${dependency} table.`);
    }
  }

  const operations = [];
  const blockingIssues = [];
  const tables = {};

  for (const [tableName, definition] of Object.entries(TABLE_DEFINITIONS)) {
    const exists = await tableExists(connection, tableName);
    tables[tableName] = {
      exists,
      rowCount: exists ? await countRows(connection, tableName) : 0
    };

    if (!exists) {
      operations.push({ kind: 'create_table', tableName, ddl: definition.ddl });
      continue;
    }

    const columns = await getColumns(connection, tableName);
    const missingColumns = definition.requiredColumns.filter((columnName) => !columns.has(columnName));
    if (missingColumns.length) {
      blockingIssues.push(`${tableName} exists but is missing required columns: ${missingColumns.join(', ')}.`);
    }
  }

  if (tables.api_tool_sessions.exists) {
    const indexes = await getIndexes(connection, 'api_tool_sessions');
    if (!indexes.has('uniq_api_tool_sessions_token_hash')) {
      blockingIssues.push('api_tool_sessions is missing uniq_api_tool_sessions_token_hash.');
    }
  }

  if (tables.unit_tool_runs.exists) {
    const indexes = await getIndexes(connection, 'unit_tool_runs');
    if (!indexes.has('uniq_unit_tool_runs_source_report')) {
      blockingIssues.push('unit_tool_runs is missing uniq_unit_tool_runs_source_report.');
    }
  }

  return { operations, blockingIssues, tables };
}

function printReport(report, mode) {
  console.log(`\nStage 10W79A API foundation (${mode})`);
  for (const [tableName, state] of Object.entries(report.tables)) {
    console.log(`${tableName}: ${state.exists ? `present (${state.rowCount} rows)` : 'not installed'}`);
  }

  if (report.operations.length) {
    console.log('\nPending schema operations:');
    report.operations.forEach((operation) => console.log(`- ${operation.kind}: ${operation.tableName}`));
  } else {
    console.log('\nAPI foundation schema is already installed.');
  }

  if (report.blockingIssues.length) {
    console.log('\nBlocking issues:');
    report.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (!APPLY) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const initial = await inspect(connection);
    printReport(initial, APPLY ? 'pre-apply' : 'dry-run');

    if (initial.blockingIssues.length) {
      throw new Error('Blocking API foundation schema issues must be resolved before applying.');
    }

    if (!APPLY) return;

    for (const operation of initial.operations) {
      await connection.query(operation.ddl);
    }

    const finalState = await inspect(connection);
    if (finalState.blockingIssues.length || finalState.operations.length) {
      throw new Error('API foundation verification failed after apply.');
    }

    printReport(finalState, 'post-apply');
    console.log('\nStage 10W79A API foundation applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message || error);
  try {
    await pool.end();
  } catch (_) {}
  process.exitCode = 1;
});
