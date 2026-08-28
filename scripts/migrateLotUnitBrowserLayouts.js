'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const LAYOUT_TABLE = 'lot_unit_browser_layouts';
const COLUMN_TABLE = 'lot_unit_browser_columns';

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [tableName]
  );
  return Boolean(rows[0]);
}

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] ? String(rows[0].COLUMN_TYPE) : null;
}

async function getColumnRows(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows;
}

async function getForeignKeys(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT
       kcu.CONSTRAINT_NAME,
       kcu.COLUMN_NAME,
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
       AND kcu.TABLE_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    [tableName]
  );
  return rows;
}

async function countRows(connection, tableName) {
  if (!await tableExists(connection, tableName)) return 0;
  const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${tableName}\``);
  return Number(rows[0]?.row_count || 0);
}

function assertColumns(tableName, rows, expected) {
  const byName = new Map(rows.map((row) => [String(row.COLUMN_NAME), row]));

  for (const [columnName, check] of Object.entries(expected)) {
    const row = byName.get(columnName);
    if (!row || !check(row)) {
      throw new Error(`Stage 10W73A found an incompatible ${tableName}.${columnName} column.`);
    }
  }
}

function assertForeignKey(foreignKeys, {
  constraintName,
  columnName,
  referencedTable,
  referencedColumn,
  deleteRule,
  updateRule
}) {
  const match = foreignKeys.find((row) => String(row.CONSTRAINT_NAME) === constraintName);

  if (!match
    || String(match.COLUMN_NAME) !== columnName
    || String(match.REFERENCED_TABLE_NAME) !== referencedTable
    || String(match.REFERENCED_COLUMN_NAME) !== referencedColumn
    || String(match.DELETE_RULE).toUpperCase() !== deleteRule
    || String(match.UPDATE_RULE).toUpperCase() !== updateRule) {
    throw new Error(`Stage 10W73A found an incompatible ${constraintName} foreign key.`);
  }
}

async function assertCompatibleSchema(connection, lotIdType, userIdType) {
  const [layoutColumns, columnColumns, layoutForeignKeys, columnForeignKeys] = await Promise.all([
    getColumnRows(connection, LAYOUT_TABLE),
    getColumnRows(connection, COLUMN_TABLE),
    getForeignKeys(connection, LAYOUT_TABLE),
    getForeignKeys(connection, COLUMN_TABLE)
  ]);

  assertColumns(LAYOUT_TABLE, layoutColumns, {
    lot_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === lotIdType.toLowerCase() && row.COLUMN_KEY === 'PRI',
    created_by_user_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === userIdType.toLowerCase() && row.IS_NULLABLE === 'YES',
    updated_by_user_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === userIdType.toLowerCase() && row.IS_NULLABLE === 'YES',
    created_at: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'datetime(6)' && row.IS_NULLABLE === 'NO',
    updated_at: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'datetime(6)' && row.IS_NULLABLE === 'NO'
  });

  assertColumns(COLUMN_TABLE, columnColumns, {
    lot_unit_browser_column_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'bigint unsigned' && row.COLUMN_KEY === 'PRI' && /auto_increment/i.test(String(row.EXTRA)),
    lot_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === lotIdType.toLowerCase() && row.IS_NULLABLE === 'NO',
    column_key: (row) => /^varchar\(100\)$/i.test(String(row.COLUMN_TYPE))
      && row.IS_NULLABLE === 'NO'
      && String(row.CHARACTER_SET_NAME).toLowerCase() === 'ascii'
      && String(row.COLLATION_NAME).toLowerCase() === 'ascii_bin',
    is_visible: (row) => /^tinyint\(1\)$/i.test(String(row.COLUMN_TYPE)) && row.IS_NULLABLE === 'NO',
    sort_order: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'int unsigned' && row.IS_NULLABLE === 'NO',
    created_by_user_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === userIdType.toLowerCase() && row.IS_NULLABLE === 'YES',
    updated_by_user_id: (row) => String(row.COLUMN_TYPE).toLowerCase() === userIdType.toLowerCase() && row.IS_NULLABLE === 'YES',
    created_at: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'datetime(6)' && row.IS_NULLABLE === 'NO',
    updated_at: (row) => String(row.COLUMN_TYPE).toLowerCase() === 'datetime(6)' && row.IS_NULLABLE === 'NO'
  });

  assertForeignKey(layoutForeignKeys, {
    constraintName: 'fk_lot_unit_browser_layouts_lot',
    columnName: 'lot_id',
    referencedTable: 'lots',
    referencedColumn: 'lot_id',
    deleteRule: 'CASCADE',
    updateRule: 'CASCADE'
  });
  assertForeignKey(layoutForeignKeys, {
    constraintName: 'fk_lot_unit_browser_layouts_created_by',
    columnName: 'created_by_user_id',
    referencedTable: 'users',
    referencedColumn: 'user_id',
    deleteRule: 'SET NULL',
    updateRule: 'CASCADE'
  });
  assertForeignKey(layoutForeignKeys, {
    constraintName: 'fk_lot_unit_browser_layouts_updated_by',
    columnName: 'updated_by_user_id',
    referencedTable: 'users',
    referencedColumn: 'user_id',
    deleteRule: 'SET NULL',
    updateRule: 'CASCADE'
  });
  assertForeignKey(columnForeignKeys, {
    constraintName: 'fk_lot_unit_browser_columns_layout',
    columnName: 'lot_id',
    referencedTable: LAYOUT_TABLE,
    referencedColumn: 'lot_id',
    deleteRule: 'CASCADE',
    updateRule: 'CASCADE'
  });
  assertForeignKey(columnForeignKeys, {
    constraintName: 'fk_lot_unit_browser_columns_created_by',
    columnName: 'created_by_user_id',
    referencedTable: 'users',
    referencedColumn: 'user_id',
    deleteRule: 'SET NULL',
    updateRule: 'CASCADE'
  });
  assertForeignKey(columnForeignKeys, {
    constraintName: 'fk_lot_unit_browser_columns_updated_by',
    columnName: 'updated_by_user_id',
    referencedTable: 'users',
    referencedColumn: 'user_id',
    deleteRule: 'SET NULL',
    updateRule: 'CASCADE'
  });

  const [uniqueRows] = await connection.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     GROUP BY INDEX_NAME, NON_UNIQUE`,
    [COLUMN_TABLE]
  );
  const uniqueLotColumn = uniqueRows.some((row) => (
    Number(row.NON_UNIQUE) === 0 && String(row.columns_list) === 'lot_id,column_key'
  ));

  if (!uniqueLotColumn) {
    throw new Error('Stage 10W73A found no compatible unique (lot_id, column_key) index.');
  }
}

async function inspect(connection) {
  const requiredTables = ['lots', 'users'];
  const missingRequiredTables = [];

  for (const tableName of requiredTables) {
    if (!await tableExists(connection, tableName)) missingRequiredTables.push(tableName);
  }

  const lotIdType = missingRequiredTables.includes('lots') ? null : await getColumnType(connection, 'lots', 'lot_id');
  const userIdType = missingRequiredTables.includes('users') ? null : await getColumnType(connection, 'users', 'user_id');
  const hasLayoutTable = await tableExists(connection, LAYOUT_TABLE);
  const hasColumnTable = await tableExists(connection, COLUMN_TABLE);

  if (!lotIdType && !missingRequiredTables.includes('lots')) missingRequiredTables.push('lots.lot_id');
  if (!userIdType && !missingRequiredTables.includes('users')) missingRequiredTables.push('users.user_id');

  if (hasLayoutTable !== hasColumnTable) {
    throw new Error('Stage 10W73A found a partial Unit Browser layout schema. Stop for manual inspection.');
  }

  if (hasLayoutTable && hasColumnTable && lotIdType && userIdType) {
    await assertCompatibleSchema(connection, lotIdType, userIdType);
  }

  return {
    missingRequiredTables,
    lotIdType,
    userIdType,
    hasLayoutTable,
    hasColumnTable,
    layoutCount: await countRows(connection, LAYOUT_TABLE),
    columnCount: await countRows(connection, COLUMN_TABLE)
  };
}

function printReport(report, label) {
  console.log(`\nStage 10W73A Unit Browser layout migration (${label})`);
  console.log(`- ${LAYOUT_TABLE}: ${report.hasLayoutTable ? `ready (${report.layoutCount} row(s))` : 'missing'}`);
  console.log(`- ${COLUMN_TABLE}: ${report.hasColumnTable ? `ready (${report.columnCount} row(s))` : 'missing'}`);
  console.log(`- lots.lot_id type: ${report.lotIdType || 'missing'}`);
  console.log(`- users.user_id type: ${report.userIdType || 'missing'}`);
  if (report.missingRequiredTables.length > 0) {
    console.log(`- blocking: missing ${report.missingRequiredTables.join(', ')}`);
  }
  if (!APPLY && report.missingRequiredTables.length === 0) {
    console.log('\nNo database changes were made. Re-run with --apply only after reviewing this report.');
  }
}

async function createSchema(connection, lotIdType, userIdType) {
  let createdLayoutTable = false;

  try {
    await connection.query(`
    CREATE TABLE ${LAYOUT_TABLE} (
      lot_id ${lotIdType} NOT NULL,
      created_by_user_id ${userIdType} NULL,
      updated_by_user_id ${userIdType} NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (lot_id),
      KEY idx_lot_unit_browser_layouts_created_by (created_by_user_id),
      KEY idx_lot_unit_browser_layouts_updated_by (updated_by_user_id),
      CONSTRAINT fk_lot_unit_browser_layouts_lot
        FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_lot_unit_browser_layouts_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_lot_unit_browser_layouts_updated_by
        FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB
    `);
    createdLayoutTable = true;

    await connection.query(`
    CREATE TABLE ${COLUMN_TABLE} (
      lot_unit_browser_column_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lot_id ${lotIdType} NOT NULL,
      column_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      is_visible TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT UNSIGNED NOT NULL,
      created_by_user_id ${userIdType} NULL,
      updated_by_user_id ${userIdType} NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (lot_unit_browser_column_id),
      UNIQUE KEY uq_lot_unit_browser_columns_lot_key (lot_id, column_key),
      KEY idx_lot_unit_browser_columns_order (lot_id, sort_order, lot_unit_browser_column_id),
      KEY idx_lot_unit_browser_columns_created_by (created_by_user_id),
      KEY idx_lot_unit_browser_columns_updated_by (updated_by_user_id),
      CONSTRAINT fk_lot_unit_browser_columns_layout
        FOREIGN KEY (lot_id) REFERENCES ${LAYOUT_TABLE}(lot_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_lot_unit_browser_columns_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_lot_unit_browser_columns_updated_by
        FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT chk_lot_unit_browser_columns_visible CHECK (is_visible IN (0, 1))
    ) ENGINE=InnoDB
    `);
  } catch (error) {
    if (createdLayoutTable) {
      await connection.query(`DROP TABLE IF EXISTS ${COLUMN_TABLE}`);
      await connection.query(`DROP TABLE IF EXISTS ${LAYOUT_TABLE}`);
    }
    throw error;
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const before = await inspect(connection);
    printReport(before, APPLY ? 'preflight' : 'audit');

    if (before.missingRequiredTables.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (!APPLY) return;

    if (!before.hasLayoutTable && !before.hasColumnTable) {
      await createSchema(connection, before.lotIdType, before.userIdType);
    }

    const after = await inspect(connection);
    if (!after.hasLayoutTable || !after.hasColumnTable) {
      throw new Error('Stage 10W73A Unit Browser layout migration verification failed.');
    }

    printReport(after, 'applied');
    console.log('\nStage 10W73A migration completed successfully. No Lot received a direct Browser customization and no Units Browser rendering was changed.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
