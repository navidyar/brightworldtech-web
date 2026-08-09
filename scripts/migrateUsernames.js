'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { planUsernames } = require('../services/userUsernameMigrationPlanner');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');
const USERNAME_INDEX_NAME = 'uq_users_username';
const USERNAME_CHECK_NAME = 'chk_users_username_format';

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0]?.count || 0) === 1;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        CHARACTER_SET_NAME,
        COLLATION_NAME
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

async function getUsernameIndexState(connection) {
  const [rows] = await connection.query(
    `
      SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `
  );

  const indexes = new Map();

  for (const row of rows) {
    if (!indexes.has(row.INDEX_NAME)) {
      indexes.set(row.INDEX_NAME, {
        name: row.INDEX_NAME,
        nonUnique: Number(row.NON_UNIQUE),
        columns: []
      });
    }

    indexes.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }

  const namedIndex = indexes.get(USERNAME_INDEX_NAME) || null;
  const uniqueUsernameIndex = Array.from(indexes.values()).find((index) => (
    index.nonUnique === 0
    && index.columns.length === 1
    && index.columns[0] === 'username'
  )) || null;

  if (namedIndex && !(
    namedIndex.nonUnique === 0
    && namedIndex.columns.length === 1
    && namedIndex.columns[0] === 'username'
  )) {
    throw new Error(`${USERNAME_INDEX_NAME} exists but is not a unique single-column username index.`);
  }

  return {
    namedIndex,
    uniqueUsernameIndex
  };
}

async function getUsernameCheckState(connection) {
  const [rows] = await connection.query(
    `
      SELECT
        tc.CONSTRAINT_NAME,
        tc.CONSTRAINT_TYPE,
        cc.CHECK_CLAUSE
      FROM information_schema.TABLE_CONSTRAINTS tc
      LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
        ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
       AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
        AND tc.TABLE_NAME = 'users'
        AND tc.CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    [USERNAME_CHECK_NAME]
  );

  if (rows[0] && rows[0].CONSTRAINT_TYPE !== 'CHECK') {
    throw new Error(`${USERNAME_CHECK_NAME} exists but is not a CHECK constraint.`);
  }

  if (rows[0]) {
    const checkClause = String(rows[0].CHECK_CLAUSE || '').toUpperCase();
    if (!checkClause.includes('USERNAME') || !checkClause.includes('CHAR_LENGTH') || !checkClause.includes('[A-Z]{4}')) {
      throw new Error(`${USERNAME_CHECK_NAME} exists with an incompatible expression.`);
    }
  }

  return rows[0] || null;
}

async function assertBaseSchema(connection) {
  if (!(await tableExists(connection, 'users'))) {
    throw new Error('Username migration requires the existing users table.');
  }

  for (const columnName of ['user_id', 'first_name', 'last_name', 'email']) {
    if (!(await getColumn(connection, 'users', columnName))) {
      throw new Error(`Username migration requires users.${columnName}.`);
    }
  }

  const usernameColumn = await getColumn(connection, 'users', 'username');

  if (usernameColumn && (
    usernameColumn.DATA_TYPE !== 'varchar'
    || Number(usernameColumn.CHARACTER_MAXIMUM_LENGTH || 0) < 32
  )) {
    throw new Error('Existing users.username is incompatible. Expected VARCHAR(32) or larger; refusing destructive replacement.');
  }

  return usernameColumn;
}

async function loadUsers(connection, hasUsernameColumn) {
  const usernameExpression = hasUsernameColumn ? 'username' : 'NULL AS username';
  const [rows] = await connection.query(
    `
      SELECT user_id, first_name, last_name, ${usernameExpression}
      FROM users
      ORDER BY user_id
    `
  );

  return rows;
}

async function verifyUsernameData(connection) {
  const [summaryRows] = await connection.query(
    `
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN username IS NULL OR TRIM(username) = '' THEN 1 ELSE 0 END) AS missing_count,
        COUNT(DISTINCT UPPER(username)) AS unique_count
      FROM users
    `
  );

  const summary = summaryRows[0] || {};
  const totalCount = Number(summary.total_count || 0);
  const missingCount = Number(summary.missing_count || 0);
  const uniqueCount = Number(summary.unique_count || 0);

  if (missingCount !== 0) {
    throw new Error(`${missingCount} user(s) remain without a username.`);
  }

  if (uniqueCount !== totalCount) {
    throw new Error('Usernames are not unique after backfill.');
  }

  const [invalidRows] = await connection.query(
    `
      SELECT user_id, username
      FROM users
      WHERE CHAR_LENGTH(username) > 32
         OR username NOT REGEXP '^[A-Z]{4}([2-9]|[1-9][0-9]+)?$'
      ORDER BY user_id
      LIMIT 20
    `
  );

  if (invalidRows.length > 0) {
    throw new Error(`Invalid username format remains for user IDs: ${invalidRows.map((row) => row.user_id).join(', ')}.`);
  }

  return {
    totalCount,
    missingCount,
    uniqueCount
  };
}

async function inspect(connection) {
  const usernameColumn = await assertBaseSchema(connection);
  const users = await loadUsers(connection, Boolean(usernameColumn));
  const plan = planUsernames(users);
  const indexState = usernameColumn
    ? await getUsernameIndexState(connection)
    : { namedIndex: null, uniqueUsernameIndex: null };
  const checkState = usernameColumn ? await getUsernameCheckState(connection) : null;

  return {
    usernameColumn,
    users,
    plan,
    indexState,
    checkState
  };
}

function printReport(state, { mode = 'dry-run', showNoChanges = false } = {}) {
  const report = {
    mode,
    usersScanned: state.users.length,
    usernameColumnExists: Boolean(state.usernameColumn),
    usernameColumnNullable: state.usernameColumn ? state.usernameColumn.IS_NULLABLE === 'YES' : null,
    uniqueUsernameIndexExists: Boolean(state.indexState.uniqueUsernameIndex),
    usernameCheckExists: Boolean(state.checkState),
    plannedUpdates: state.plan.updates.length,
    updates: state.plan.updates,
    errors: state.plan.errors
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Mode: ${report.mode}`);
  console.log(`Users scanned: ${report.usersScanned}`);
  console.log(`Username column exists: ${report.usernameColumnExists ? 'yes' : 'no'}`);
  console.log(`Unique username index exists: ${report.uniqueUsernameIndexExists ? 'yes' : 'no'}`);
  console.log(`Username format check exists: ${report.usernameCheckExists ? 'yes' : 'no'}`);
  console.log(`Username updates planned: ${report.plannedUpdates}`);

  for (const update of report.updates) {
    console.log(`- user ${update.userId}: ${update.username} (${update.reason})`);
  }

  if (report.errors.length > 0) {
    console.log('\nBlocking issues:');
    for (const error of report.errors) {
      console.log(`- ${error}`);
    }
  }

  if (showNoChanges) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function applyMigration(connection, initialState) {
  if (!initialState.plan.isValid) {
    throw new Error('Username migration is blocked by the audit errors above.');
  }

  if (!initialState.usernameColumn) {
    await connection.query(
      `
        ALTER TABLE users
          ADD COLUMN username VARCHAR(32)
            CHARACTER SET ascii
            COLLATE ascii_general_ci
            NULL
            AFTER last_name
      `
    );
  }

  await connection.beginTransaction();

  try {
    for (const update of initialState.plan.updates) {
      const [result] = await connection.query(
        `
          UPDATE users
          SET username = ?
          WHERE user_id = ?
        `,
        [update.username, update.userId]
      );

      if (result.affectedRows !== 1) {
        throw new Error(`Unable to update username for user ${update.userId}.`);
      }
    }

    await verifyUsernameData(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  const usernameColumn = await getColumn(connection, 'users', 'username');
  const usernameColumnLength = Math.max(32, Number(usernameColumn?.CHARACTER_MAXIMUM_LENGTH || 32));

  if (
    !usernameColumn
    || usernameColumn.IS_NULLABLE === 'YES'
    || usernameColumn.CHARACTER_SET_NAME !== 'ascii'
    || usernameColumn.COLLATION_NAME !== 'ascii_general_ci'
  ) {
    await connection.query(
      `
        ALTER TABLE users
          MODIFY COLUMN username VARCHAR(${usernameColumnLength})
            CHARACTER SET ascii
            COLLATE ascii_general_ci
            NOT NULL
      `
    );
  }

  const indexState = await getUsernameIndexState(connection);

  if (!indexState.uniqueUsernameIndex) {
    await connection.query(
      `
        ALTER TABLE users
          ADD UNIQUE INDEX ${USERNAME_INDEX_NAME} (username)
      `
    );
  }

  const checkState = await getUsernameCheckState(connection);

  if (!checkState) {
    await connection.query(
      `
        ALTER TABLE users
          ADD CONSTRAINT ${USERNAME_CHECK_NAME}
          CHECK (
            CHAR_LENGTH(username) <= 32
            AND username REGEXP '^[A-Z]{4}([2-9]|[1-9][0-9]+)?$'
          )
      `
    );
  }

  await verifyUsernameData(connection);

  const finalState = await inspect(connection);

  if (!finalState.usernameColumn || finalState.usernameColumn.IS_NULLABLE !== 'NO') {
    throw new Error('users.username is not NOT NULL after migration.');
  }

  if (!finalState.indexState.uniqueUsernameIndex) {
    throw new Error('A unique username index is missing after migration.');
  }

  if (!finalState.checkState) {
    throw new Error('The username format CHECK constraint is missing after migration.');
  }

  if (!finalState.plan.isValid || finalState.plan.updates.length !== 0) {
    throw new Error('Username migration verification found remaining work.');
  }

  return finalState;
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const initialState = await inspect(connection);
    printReport(initialState, {
      mode: APPLY ? 'preflight' : 'dry-run',
      showNoChanges: !APPLY
    });

    if (!initialState.plan.isValid) {
      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      return;
    }

    const finalState = await applyMigration(connection, initialState);
    console.log('\nUsername migration completed successfully.');
    printReport(finalState, { mode: 'applied' });
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
