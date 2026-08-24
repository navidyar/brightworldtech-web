'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const HISTORY_TABLE = 'unit_lot_history';
const LOT_TABLE = 'lots';
const NAME_SNAPSHOT_COLUMNS = [
  { name: 'from_lot_name_snapshot', after: 'from_lot_id_snapshot' },
  { name: 'to_lot_name_snapshot', after: 'to_lot_id_snapshot' }
];
const ID_SNAPSHOT_COLUMNS = [
  { name: 'from_lot_id_snapshot', source: 'from_lot_id', after: 'from_lot_id' },
  { name: 'to_lot_id_snapshot', source: 'to_lot_id', after: 'to_lot_id' }
];
const HISTORY_LOT_COLUMNS = ['from_lot_id', 'to_lot_id'];
const INTEGER_TYPES = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint']);

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) === 1;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function getLotForeignKeys(connection) {
  const [rows] = await connection.query(
    `SELECT
       kcu.TABLE_NAME,
       kcu.COLUMN_NAME,
       kcu.CONSTRAINT_NAME,
       kcu.REFERENCED_TABLE_NAME,
       kcu.REFERENCED_COLUMN_NAME,
       rc.DELETE_RULE,
       rc.UPDATE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.TABLE_NAME = kcu.TABLE_NAME
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
       AND kcu.REFERENCED_TABLE_NAME = ?
     ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.CONSTRAINT_NAME`,
    [LOT_TABLE]
  );
  return rows;
}

function validateIdentifier(value, label) {
  const normalized = String(value || '');
  if (!/^[A-Za-z0-9_$]+$/.test(normalized)) {
    throw new Error(`Unsupported ${label} identifier: ${normalized}`);
  }
  return normalized;
}

function buildHistoryForeignKeyReplacement({ columnName, column, foreignKey }) {
  if (!column || !foreignKey) {
    return null;
  }

  const needsReplacement = String(column.IS_NULLABLE || '').toUpperCase() !== 'YES'
    || String(foreignKey.DELETE_RULE || '').toUpperCase() !== 'SET NULL';

  if (!needsReplacement) {
    return null;
  }

  const constraintName = validateIdentifier(foreignKey.CONSTRAINT_NAME, 'foreign-key constraint');
  const safeColumnName = validateIdentifier(columnName, 'column');
  const columnType = String(column.COLUMN_TYPE || '').trim();
  const deleteRule = String(foreignKey.DELETE_RULE || 'RESTRICT').toUpperCase();
  const safeDeleteRule = ['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL'].includes(deleteRule)
    ? deleteRule
    : 'RESTRICT';
  const updateRule = String(foreignKey.UPDATE_RULE || 'RESTRICT').toUpperCase();
  const safeUpdateRule = ['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL'].includes(updateRule)
    ? updateRule
    : 'RESTRICT';
  const referenceSql = `FOREIGN KEY (\`${safeColumnName}\`) REFERENCES \`${LOT_TABLE}\` (\`lot_id\`)`;

  return {
    columnName: safeColumnName,
    constraintName,
    modifyDdl: String(column.IS_NULLABLE || '').toUpperCase() === 'YES'
      ? null
      : `ALTER TABLE \`${HISTORY_TABLE}\` MODIFY COLUMN \`${safeColumnName}\` ${columnType} NULL DEFAULT NULL`,
    dropDdl: `ALTER TABLE \`${HISTORY_TABLE}\` DROP FOREIGN KEY \`${constraintName}\``,
    addDdl: `ALTER TABLE \`${HISTORY_TABLE}\` ADD CONSTRAINT \`${constraintName}\` ${referenceSql} ON DELETE SET NULL ON UPDATE ${safeUpdateRule}`,
    restoreDdl: `ALTER TABLE \`${HISTORY_TABLE}\` ADD CONSTRAINT \`${constraintName}\` ${referenceSql} ON DELETE ${safeDeleteRule} ON UPDATE ${safeUpdateRule}`
  };
}

async function replaceHistoryLotForeignKey(connection, replacement) {
  if (!replacement) {
    return;
  }

  if (replacement.modifyDdl) {
    await connection.query(replacement.modifyDdl);
  }

  // MySQL validates foreign-key symbols before applying a multi-clause ALTER.
  // Drop and recreate in separate statements so the same constraint name can
  // be reused reliably. If recreation fails, restore the original rule.
  await connection.query(replacement.dropDdl);

  try {
    await connection.query(replacement.addDdl);
  } catch (error) {
    try {
      await connection.query(replacement.restoreDdl);
    } catch (restoreError) {
      error.message = `${error.message} Restore attempt also failed: ${restoreError.message}`;
    }
    throw error;
  }
}

async function inspect(connection) {
  const blockingIssues = [];
  const operations = [];

  for (const tableName of [LOT_TABLE, HISTORY_TABLE]) {
    if (!await tableExists(connection, tableName)) {
      blockingIssues.push(`${tableName} is missing.`);
    }
  }

  if (blockingIssues.length > 0) {
    return { blockingIssues, operations, counts: {}, lotForeignKeys: [] };
  }

  const requiredColumns = [
    [LOT_TABLE, 'lot_id'],
    [LOT_TABLE, 'name'],
    [HISTORY_TABLE, 'unit_lot_history_id'],
    [HISTORY_TABLE, 'from_lot_id'],
    [HISTORY_TABLE, 'to_lot_id']
  ];

  for (const [tableName, columnName] of requiredColumns) {
    if (!await getColumn(connection, tableName, columnName)) {
      blockingIssues.push(`${tableName}.${columnName} is required.`);
    }
  }

  if (blockingIssues.length > 0) {
    return { blockingIssues, operations, counts: {}, lotForeignKeys: await getLotForeignKeys(connection) };
  }

  const columns = {};
  for (const columnName of HISTORY_LOT_COLUMNS) {
    const column = await getColumn(connection, HISTORY_TABLE, columnName);
    columns[columnName] = column;
    if (column && !INTEGER_TYPES.has(String(column.DATA_TYPE || '').toLowerCase())) {
      blockingIssues.push(`${HISTORY_TABLE}.${columnName} uses incompatible type ${column.COLUMN_TYPE}.`);
    }
    if (column && String(column.EXTRA || '').trim()) {
      blockingIssues.push(`${HISTORY_TABLE}.${columnName} has unsupported column attributes (${column.EXTRA}); refusing to rewrite it.`);
    }
  }

  for (const snapshotColumn of ID_SNAPSHOT_COLUMNS) {
    const sourceColumn = columns[snapshotColumn.source];
    const existing = await getColumn(connection, HISTORY_TABLE, snapshotColumn.name);
    if (!existing && sourceColumn) {
      operations.push({
        kind: 'add_snapshot_column',
        columnName: snapshotColumn.name,
        ddl: `ALTER TABLE \`${HISTORY_TABLE}\` ADD COLUMN \`${snapshotColumn.name}\` ${sourceColumn.COLUMN_TYPE} NULL DEFAULT NULL AFTER \`${snapshotColumn.after}\``
      });
      continue;
    }

    if (existing && !INTEGER_TYPES.has(String(existing.DATA_TYPE || '').toLowerCase())) {
      blockingIssues.push(`${HISTORY_TABLE}.${snapshotColumn.name} exists as ${existing.COLUMN_TYPE}; expected integer ID storage.`);
    }
  }

  for (const snapshotColumn of NAME_SNAPSHOT_COLUMNS) {
    const existing = await getColumn(connection, HISTORY_TABLE, snapshotColumn.name);
    if (!existing) {
      operations.push({
        kind: 'add_snapshot_column',
        columnName: snapshotColumn.name,
        ddl: `ALTER TABLE \`${HISTORY_TABLE}\` ADD COLUMN \`${snapshotColumn.name}\` VARCHAR(255) NULL AFTER \`${snapshotColumn.after}\``
      });
      continue;
    }

    const type = String(existing.DATA_TYPE || '').toLowerCase();
    if (!['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'].includes(type)) {
      blockingIssues.push(`${HISTORY_TABLE}.${snapshotColumn.name} exists as ${existing.COLUMN_TYPE}; expected text storage.`);
    }
  }

  const lotForeignKeys = await getLotForeignKeys(connection);
  const historyForeignKeys = {};
  for (const columnName of HISTORY_LOT_COLUMNS) {
    const matches = lotForeignKeys.filter((row) => (
      row.TABLE_NAME === HISTORY_TABLE
      && row.COLUMN_NAME === columnName
      && row.REFERENCED_COLUMN_NAME === 'lot_id'
    ));

    if (matches.length !== 1) {
      blockingIssues.push(`${HISTORY_TABLE}.${columnName} must have exactly one foreign key to lots.lot_id; found ${matches.length}.`);
    } else {
      historyForeignKeys[columnName] = matches[0];
    }
  }

  if (blockingIssues.length === 0) {
    const replacements = HISTORY_LOT_COLUMNS
      .map((columnName) => buildHistoryForeignKeyReplacement({
        columnName,
        column: columns[columnName],
        foreignKey: historyForeignKeys[columnName]
      }))
      .filter(Boolean);

    if (replacements.length > 0) {
      operations.push({ kind: 'replace_history_lot_foreign_keys', replacements });
    }
  }

  const [countRows] = await connection.query(
    `SELECT
       COUNT(*) AS history_rows,
       SUM(CASE WHEN from_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS from_lot_references,
       SUM(CASE WHEN to_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS to_lot_references
     FROM unit_lot_history`
  );

  return {
    blockingIssues,
    operations,
    lotForeignKeys,
    counts: {
      historyRows: Number(countRows[0]?.history_rows || 0),
      fromLotReferences: Number(countRows[0]?.from_lot_references || 0),
      toLotReferences: Number(countRows[0]?.to_lot_references || 0)
    }
  };
}

function printReport(report, mode) {
  console.log(`\nLot-history deletion migration (${mode})`);
  console.log(`Lot-move history rows: ${report.counts?.historyRows ?? 'unknown'}`);
  console.log(`from_lot_id references: ${report.counts?.fromLotReferences ?? 'unknown'}`);
  console.log(`to_lot_id references: ${report.counts?.toLotReferences ?? 'unknown'}`);

  if (report.lotForeignKeys?.length > 0) {
    console.log('\nCurrent foreign keys referencing lots:');
    report.lotForeignKeys.forEach((row) => {
      console.log(`- ${row.TABLE_NAME}.${row.COLUMN_NAME}: ${row.CONSTRAINT_NAME} (ON DELETE ${row.DELETE_RULE})`);
    });
  }

  if (report.blockingIssues?.length > 0) {
    console.log('\nBlocking issues:');
    report.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
    return;
  }

  if (report.operations.length === 0) {
    console.log('\nSchema already satisfies the Lot-history deletion policy.');
    return;
  }

  console.log('\nPlanned changes:');
  report.operations.forEach((operation) => console.log(`- ${operation.kind}`));
  console.log('- backfill historical from/to Lot ID and name snapshots before any live Lot reference can be cleared');
}

async function backfillLotNameSnapshots(connection) {
  await connection.query(
    `UPDATE unit_lot_history h
     LEFT JOIN lots from_lot ON from_lot.lot_id = h.from_lot_id
     LEFT JOIN lots to_lot ON to_lot.lot_id = h.to_lot_id
     SET
       h.from_lot_id_snapshot = COALESCE(h.from_lot_id_snapshot, h.from_lot_id),
       h.to_lot_id_snapshot = COALESCE(h.to_lot_id_snapshot, h.to_lot_id),
       h.from_lot_name_snapshot = COALESCE(h.from_lot_name_snapshot, from_lot.name),
       h.to_lot_name_snapshot = COALESCE(h.to_lot_name_snapshot, to_lot.name)
     WHERE
       (h.from_lot_id IS NOT NULL AND (h.from_lot_id_snapshot IS NULL OR h.from_lot_name_snapshot IS NULL))
       OR (h.to_lot_id IS NOT NULL AND (h.to_lot_id_snapshot IS NULL OR h.to_lot_name_snapshot IS NULL))`
  );
}

async function applyMigration(connection, initialReport) {
  if (initialReport.blockingIssues.length > 0) {
    throw new Error('Refusing to apply Lot-history deletion migration while blocking issues remain.');
  }

  for (const operation of initialReport.operations.filter((item) => item.kind === 'add_snapshot_column')) {
    await connection.query(operation.ddl);
  }

  await backfillLotNameSnapshots(connection);

  const refreshedReport = await inspect(connection);
  if (refreshedReport.blockingIssues.length > 0) {
    throw new Error(refreshedReport.blockingIssues.join(' '));
  }

  const foreignKeyOperation = refreshedReport.operations.find((item) => item.kind === 'replace_history_lot_foreign_keys');
  if (foreignKeyOperation) {
    for (const replacement of foreignKeyOperation.replacements) {
      await replaceHistoryLotForeignKey(connection, replacement);
    }
  }

  return inspect(connection);
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const initialReport = await inspect(connection);
    printReport(initialReport, APPLY ? 'preflight' : 'audit');

    if (initialReport.blockingIssues.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      return;
    }

    const finalReport = await applyMigration(connection, initialReport);
    console.log('\nLot-history deletion migration completed successfully.');
    printReport(finalReport, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildHistoryForeignKeyReplacement,
  replaceHistoryLotForeignKey,
  inspect,
  applyMigration
};
