'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const TARGETS = [
  {
    columnName: 'phone',
    definition: 'VARCHAR(50) NULL',
    expectedType: 'varchar',
    minimumLength: 50,
    afterColumn: 'email'
  },
  {
    columnName: 'personal_email',
    definition: 'VARCHAR(255) NULL',
    expectedType: 'varchar',
    minimumLength: 255,
    afterColumn: 'phone'
  },
  {
    columnName: 'start_date',
    definition: 'DATE NULL',
    expectedType: 'date',
    afterColumn: 'personal_email'
  },
  {
    columnName: 'end_date',
    definition: 'DATE NULL',
    expectedType: 'date',
    afterColumn: 'start_date'
  }
];

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
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
  return Boolean(rows[0]);
}

async function getColumn(connection, columnName) {
  const [rows] = await connection.query(
    `
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [columnName]
  );
  return rows[0] || null;
}

async function getUserCounts(connection, availableColumns) {
  const selectParts = ['COUNT(*) AS total_users'];

  for (const target of TARGETS) {
    if (!availableColumns.has(target.columnName)) continue;
    const populatedCondition = target.expectedType === 'varchar'
      ? `${escapeIdentifier(target.columnName)} IS NOT NULL AND ${escapeIdentifier(target.columnName)} <> ''`
      : `${escapeIdentifier(target.columnName)} IS NOT NULL`;
    selectParts.push(
      `SUM(CASE WHEN ${populatedCondition} THEN 1 ELSE 0 END) AS ${escapeIdentifier(`${target.columnName}_populated`)}`
    );
  }

  const [rows] = await connection.query(`SELECT ${selectParts.join(', ')} FROM users`);
  return rows[0] || { total_users: 0 };
}

async function inspect(connection) {
  const blockingIssues = [];
  const columns = [];
  const plannedChanges = [];

  if (!await tableExists(connection, 'users')) {
    return {
      blockingIssues: ['users table is missing.'],
      columns,
      plannedChanges,
      counts: { total_users: 0 }
    };
  }

  const availableColumns = new Set();

  for (const target of TARGETS) {
    const column = await getColumn(connection, target.columnName);

    if (!column) {
      columns.push({ ...target, exists: false });
      plannedChanges.push(`add_${target.columnName}`);
      continue;
    }

    availableColumns.add(target.columnName);
    const dataType = String(column.DATA_TYPE || '').toLowerCase();
    const nullable = column.IS_NULLABLE === 'YES';
    const baseCompatible = dataType === target.expectedType && nullable;
    let compatible = baseCompatible;

    if (!baseCompatible) {
      blockingIssues.push(
        `users.${target.columnName} already exists as ${column.COLUMN_TYPE} ${nullable ? 'NULL' : 'NOT NULL'}; expected a nullable ${target.definition}.`
      );
    } else if (target.expectedType === 'varchar') {
      const currentLength = Number(column.CHARACTER_MAXIMUM_LENGTH || 0);
      if (currentLength < target.minimumLength) {
        plannedChanges.push(`widen_${target.columnName}`);
        compatible = false;
      }
    }

    columns.push({
      ...target,
      exists: true,
      columnType: column.COLUMN_TYPE,
      nullable,
      compatible
    });
  }

  const counts = await getUserCounts(connection, availableColumns);
  return { blockingIssues, columns, plannedChanges, counts };
}

function printReport(report, label) {
  console.log(`\nUser profile fields migration (${label})`);
  console.log(`Users: ${Number(report.counts.total_users || 0)}`);

  for (const target of report.columns) {
    const populatedKey = `${target.columnName}_populated`;
    const populated = Number(report.counts[populatedKey] || 0);
    console.log(
      `- users.${target.columnName}: ${target.exists ? target.columnType : 'missing'}${target.exists ? `; populated ${populated}` : ''}`
    );
  }

  if (report.plannedChanges.length > 0) {
    console.log('\nPlanned changes:');
    for (const change of report.plannedChanges) console.log(`- ${change}`);
  } else if (report.blockingIssues.length === 0) {
    console.log('\nSchema already satisfies the optional user-profile field policy.');
  }

  if (report.blockingIssues.length > 0) {
    console.log('\nBlocking issues:');
    for (const issue of report.blockingIssues) console.log(`- ${issue}`);
  }

  if (!APPLY && report.blockingIssues.length === 0 && report.plannedChanges.length > 0) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function applyMigration(connection, report) {
  for (const target of TARGETS) {
    if (report.plannedChanges.includes(`add_${target.columnName}`)) {
      await connection.query(
        `ALTER TABLE users ADD COLUMN ${escapeIdentifier(target.columnName)} ${target.definition} AFTER ${escapeIdentifier(target.afterColumn)}`
      );
      continue;
    }

    if (report.plannedChanges.includes(`widen_${target.columnName}`)) {
      await connection.query(
        `ALTER TABLE users MODIFY COLUMN ${escapeIdentifier(target.columnName)} ${target.definition}`
      );
    }
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const preflight = await inspect(connection);
    printReport(preflight, APPLY ? 'preflight' : 'audit');

    if (preflight.blockingIssues.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (!APPLY) return;

    await applyMigration(connection, preflight);
    const verified = await inspect(connection);

    if (verified.blockingIssues.length > 0 || verified.plannedChanges.length > 0) {
      throw new Error('User profile fields verification failed after migration.');
    }

    console.log('\nUser profile fields migration completed successfully.');
    printReport(verified, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
