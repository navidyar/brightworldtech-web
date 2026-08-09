'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');
const TARGET_PRECISION = 20;
const TARGET_SCALE = 2;
const TARGETS = [
  { tableName: 'lots', columnName: 'default_production_weight' },
  { tableName: 'units', columnName: 'production_weight_override' },
  { tableName: 'unit_work_completions', columnName: 'production_weight_value' }
];

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function escapeSqlLiteral(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
      SELECT
        DATA_TYPE,
        COLUMN_TYPE,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA,
        COLUMN_COMMENT
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

async function getMaximumValue(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT MAX(${escapeIdentifier(columnName)}) AS maximum_value FROM ${escapeIdentifier(tableName)}`
  );
  return rows[0]?.maximum_value ?? null;
}

function buildColumnDefinition(column, targetPrecision, targetScale) {
  const unsigned = String(column.COLUMN_TYPE || '').toLowerCase().includes('unsigned') ? ' UNSIGNED' : '';
  const nullable = column.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL';
  let defaultClause = '';

  if (column.COLUMN_DEFAULT !== null && column.COLUMN_DEFAULT !== undefined) {
    const defaultValue = String(column.COLUMN_DEFAULT);
    defaultClause = /^-?\d+(?:\.\d+)?$/.test(defaultValue)
      ? ` DEFAULT ${defaultValue}`
      : ` DEFAULT ${escapeSqlLiteral(defaultValue)}`;
  } else if (column.IS_NULLABLE === 'YES') {
    defaultClause = ' DEFAULT NULL';
  }

  const commentClause = column.COLUMN_COMMENT
    ? ` COMMENT ${escapeSqlLiteral(column.COLUMN_COMMENT)}`
    : '';

  return `DECIMAL(${targetPrecision},${targetScale})${unsigned}${nullable}${defaultClause}${commentClause}`;
}

async function inspect(connection) {
  const targets = [];
  const blockingIssues = [];

  for (const target of TARGETS) {
    const column = await getColumn(connection, target.tableName, target.columnName);
    if (!column) {
      blockingIssues.push(`${target.tableName}.${target.columnName} is missing.`);
      targets.push({ ...target, exists: false, needsChange: false });
      continue;
    }

    const dataType = String(column.DATA_TYPE || '').toLowerCase();
    if (!['decimal', 'numeric'].includes(dataType)) {
      blockingIssues.push(
        `${target.tableName}.${target.columnName} uses ${column.COLUMN_TYPE}; expected DECIMAL/NUMERIC before a safe widening migration.`
      );
    }

    const precision = Number(column.NUMERIC_PRECISION || 0);
    const scale = Number(column.NUMERIC_SCALE || 0);
    const targetScale = Math.max(TARGET_SCALE, scale);
    const targetPrecision = Math.max(TARGET_PRECISION, precision + Math.max(0, targetScale - scale));
    if (targetPrecision > 65) {
      blockingIssues.push(`${target.tableName}.${target.columnName} cannot be widened safely within MySQL's DECIMAL(65) limit.`);
    }
    const needsChange = ['decimal', 'numeric'].includes(dataType)
      && targetPrecision <= 65
      && (precision < targetPrecision || scale < targetScale);
    const maximumValue = await getMaximumValue(connection, target.tableName, target.columnName);

    targets.push({
      ...target,
      exists: true,
      columnType: column.COLUMN_TYPE,
      precision,
      scale,
      targetPrecision,
      targetScale,
      nullable: column.IS_NULLABLE === 'YES',
      maximumValue,
      needsChange,
      definition: needsChange ? buildColumnDefinition(column, targetPrecision, targetScale) : ''
    });
  }

  return { targets, blockingIssues };
}

function printReport(report) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Mode: ${APPLY ? 'apply' : 'dry-run'}`);
  console.log(`Target capacity: DECIMAL(${TARGET_PRECISION},${TARGET_SCALE})`);
  console.log('Application maximum: none');

  for (const target of report.targets) {
    if (!target.exists) {
      console.log(`- ${target.tableName}.${target.columnName}: missing`);
      continue;
    }
    console.log(
      `- ${target.tableName}.${target.columnName}: ${target.columnType}; maximum stored ${target.maximumValue ?? 'none'}; ${target.needsChange ? `widen to DECIMAL(${target.targetPrecision},${target.targetScale})` : 'already sufficient'}`
    );
  }

  if (report.blockingIssues.length > 0) {
    console.log('\nBlocking issues:');
    for (const issue of report.blockingIssues) console.log(`- ${issue}`);
  }

  if (!APPLY) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const report = await inspect(connection);

    if (report.blockingIssues.length > 0) {
      printReport(report);
      process.exitCode = 1;
      return;
    }

    if (APPLY) {
      for (const target of report.targets.filter((entry) => entry.needsChange)) {
        await connection.query(
          `ALTER TABLE ${escapeIdentifier(target.tableName)} MODIFY COLUMN ${escapeIdentifier(target.columnName)} ${target.definition}`
        );
      }
      const verified = await inspect(connection);
      if (verified.blockingIssues.length > 0 || verified.targets.some((entry) => entry.needsChange)) {
        throw new Error('Production weight capacity verification failed after migration.');
      }
      printReport(verified);
    } else {
      printReport(report);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
