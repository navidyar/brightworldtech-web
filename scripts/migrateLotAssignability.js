'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const CHECK_NAME = 'chk_lots_is_assignable';

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
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] || null;
}

async function getCheckConstraint(connection) {
  const [rows] = await connection.query(
    `SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, cc.CHECK_CLAUSE
     FROM information_schema.TABLE_CONSTRAINTS tc
     LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
       AND tc.TABLE_NAME = 'lots'
       AND tc.CONSTRAINT_NAME = ?
     LIMIT 1`,
    [CHECK_NAME]
  );

  if (rows[0] && rows[0].CONSTRAINT_TYPE !== 'CHECK') {
    throw new Error(`${CHECK_NAME} exists but is not a CHECK constraint.`);
  }

  return rows[0] || null;
}

async function inspect(connection) {
  if (!(await tableExists(connection, 'lots'))) {
    throw new Error('Lot assignability migration requires the existing lots table.');
  }

  for (const columnName of ['lot_id', 'parent_lot_id']) {
    if (!(await getColumn(connection, 'lots', columnName))) {
      throw new Error(`Lot assignability migration requires lots.${columnName}.`);
    }
  }

  const column = await getColumn(connection, 'lots', 'is_assignable');

  if (column && (
    !['tinyint', 'boolean'].includes(String(column.DATA_TYPE || '').toLowerCase())
    || String(column.IS_NULLABLE || '').toUpperCase() !== 'NO'
  )) {
    throw new Error('Existing lots.is_assignable is incompatible. Expected a NOT NULL TINYINT/BOOLEAN column; refusing destructive replacement.');
  }

  const [summaryRows] = await connection.query(
    `SELECT
       COUNT(*) AS lot_count,
       SUM(CASE WHEN parent_lot_id IS NULL THEN 1 ELSE 0 END) AS root_count
     FROM lots`
  );
  const [parentRows] = await connection.query(
    `SELECT COUNT(DISTINCT parent_lot_id) AS parent_count
     FROM lots
     WHERE parent_lot_id IS NOT NULL`
  );
  let invalidValueCount = 0;
  let assignableCount = null;
  let structuralCount = null;
  let parentLotsWithDirectUnits = null;
  let directUnitsInParentLots = null;

  if (column) {
    const [stateRows] = await connection.query(
      `SELECT
         SUM(CASE WHEN is_assignable = 1 THEN 1 ELSE 0 END) AS assignable_count,
         SUM(CASE WHEN is_assignable = 0 THEN 1 ELSE 0 END) AS structural_count,
         SUM(CASE WHEN is_assignable NOT IN (0, 1) THEN 1 ELSE 0 END) AS invalid_count
       FROM lots`
    );
    assignableCount = Number(stateRows[0]?.assignable_count || 0);
    structuralCount = Number(stateRows[0]?.structural_count || 0);
    invalidValueCount = Number(stateRows[0]?.invalid_count || 0);
  }

  if (invalidValueCount > 0) {
    throw new Error(`${invalidValueCount} Lot row(s) contain an invalid is_assignable value.`);
  }

  if (await tableExists(connection, 'units') && await getColumn(connection, 'units', 'lot_id')) {
    const [directUnitRows] = await connection.query(
      `SELECT
         COUNT(DISTINCT u.lot_id) AS parent_lots_with_direct_units,
         COUNT(*) AS direct_units_in_parent_lots
       FROM units u
       INNER JOIN (
         SELECT DISTINCT parent_lot_id AS lot_id
         FROM lots
         WHERE parent_lot_id IS NOT NULL
       ) parent_lots ON parent_lots.lot_id = u.lot_id`
    );
    parentLotsWithDirectUnits = Number(directUnitRows[0]?.parent_lots_with_direct_units || 0);
    directUnitsInParentLots = Number(directUnitRows[0]?.direct_units_in_parent_lots || 0);
  }

  return {
    column,
    checkConstraint: column ? await getCheckConstraint(connection) : null,
    lotCount: Number(summaryRows[0]?.lot_count || 0),
    rootCount: Number(summaryRows[0]?.root_count || 0),
    parentCount: Number(parentRows[0]?.parent_count || 0),
    assignableCount,
    structuralCount,
    parentLotsWithDirectUnits,
    directUnitsInParentLots
  };
}

function printReport(state, mode) {
  console.log(`\nLot assignability migration (${mode})`);
  console.log(`Lots: ${state.lotCount}`);
  console.log(`Hierarchy parents: ${state.parentCount}`);
  console.log(`is_assignable column: ${state.column ? 'present' : 'missing'}`);
  if (state.parentLotsWithDirectUnits !== null) {
    console.log(`Parent Lots already holding direct Units: ${state.parentLotsWithDirectUnits}`);
    console.log(`Direct Units already in parent Lots: ${state.directUnitsInParentLots}`);
  }

  if (state.column) {
    console.log(`Assignable Lots: ${state.assignableCount}`);
    console.log(`Structural Lots: ${state.structuralCount}`);
    console.log(`Check constraint: ${state.checkConstraint ? 'present' : 'missing'}`);
  } else {
    console.log('Planned initialization: existing parents -> Structural; existing leaf Lots -> Assignable.');
    if (state.directUnitsInParentLots > 0) {
      console.log('Existing direct Units in parent Lots will remain in place; those parents will initially block new assignments until explicitly enabled.');
    }
  }
}

async function applyMigration(connection, initialState) {
  if (!initialState.column) {
    await connection.query(
      `ALTER TABLE lots
         ADD COLUMN is_assignable TINYINT(1) NOT NULL DEFAULT 1`
    );

    await connection.query(
      `UPDATE lots l
       LEFT JOIN (
         SELECT DISTINCT parent_lot_id
         FROM lots
         WHERE parent_lot_id IS NOT NULL
       ) parent_ids ON parent_ids.parent_lot_id = l.lot_id
       SET l.is_assignable = CASE WHEN parent_ids.parent_lot_id IS NULL THEN 1 ELSE 0 END`
    );
  }

  const checkConstraint = await getCheckConstraint(connection);
  if (!checkConstraint) {
    await connection.query(
      `ALTER TABLE lots
         ADD CONSTRAINT ${CHECK_NAME} CHECK (is_assignable IN (0, 1))`
    );
  }

  return inspect(connection);
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const initialState = await inspect(connection);
    printReport(initialState, APPLY ? 'preflight' : 'dry-run');

    if (!APPLY) {
      return;
    }

    const finalState = await applyMigration(connection, initialState);
    console.log('\nLot assignability migration completed successfully.');
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
