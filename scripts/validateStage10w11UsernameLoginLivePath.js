'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const authModel = require('../models/authModel');
const { buildUsernameStem, isValidUsername } = require('../services/userUsernamePolicy');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertSchema(connection) {
  const [columnRows] = await connection.query(
    `
      SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'username'
      LIMIT 1
    `
  );
  const column = columnRows[0] || null;
  assert(column, 'users.username is missing. Run the Stage 10W.11 username migration first.');
  assert(column.DATA_TYPE === 'varchar' && Number(column.CHARACTER_MAXIMUM_LENGTH) >= 32, 'users.username has an incompatible type or length.');
  assert(column.IS_NULLABLE === 'NO', 'users.username must be NOT NULL.');

  const [indexRows] = await connection.query(
    `
      SELECT INDEX_NAME, NON_UNIQUE, COUNT(*) AS column_count,
             SUM(CASE WHEN COLUMN_NAME = 'username' THEN 1 ELSE 0 END) AS username_column_count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      GROUP BY INDEX_NAME, NON_UNIQUE
      HAVING NON_UNIQUE = 0
        AND column_count = 1
        AND username_column_count = 1
    `
  );
  assert(indexRows.length > 0, 'users.username does not have a unique single-column index.');
}

async function assertExistingUsers(connection) {
  const [rows] = await connection.query(
    `
      SELECT user_id, username
      FROM users
      ORDER BY user_id
    `
  );

  const usernames = rows.map((row) => String(row.username || '').trim().toUpperCase());
  assert(usernames.every(isValidUsername), 'At least one existing user has an invalid BWT username.');
  assert(new Set(usernames).size === usernames.length, 'Existing BWT usernames are not unique.');

  return rows.length;
}

function lettersFromNumber(value) {
  let remaining = Math.abs(Number(value) || 0);
  let output = '';

  for (let index = 0; index < 4; index += 1) {
    output += String.fromCharCode(65 + (remaining % 26));
    remaining = Math.floor(remaining / 26);
  }

  return output;
}

async function findUnusedFixture(connection) {
  const seed = Date.now() + process.pid;

  for (let offset = 0; offset < 676; offset += 1) {
    const letters = lettersFromNumber(seed + offset);
    const firstName = `${letters.slice(0, 2)}validate`;
    const lastName = `${letters.slice(2, 4)}user`;
    const stem = buildUsernameStem(firstName, lastName);
    const [rows] = await connection.query(
      `
        SELECT username
        FROM users
        WHERE username LIKE CONCAT(?, '%')
        LIMIT 1
      `,
      [stem]
    );

    if (rows.length === 0) {
      return { firstName, lastName, stem };
    }
  }

  throw new Error('Unable to find an unused four-letter username stem for live validation.');
}

async function getPendingStatusId(connection) {
  const [rows] = await connection.query(
    `
      SELECT cv.config_value_id
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = 'account_statuses'
        AND cv.code = 'pending_setup'
      LIMIT 1
    `
  );

  const statusId = Number(rows[0]?.config_value_id || 0);
  assert(statusId > 0, 'The pending_setup account status is missing.');
  return statusId;
}

async function verifyLookupAndCollision(connection) {
  const fixture = await findUnusedFixture(connection);
  const pendingStatusId = await getPendingStatusId(connection);
  const unique = `${Date.now()}-${process.pid}`;
  const email = `stage10w11-${unique}@example.invalid`;

  const [firstResult] = await connection.query(
    `
      INSERT INTO users (
        account_status_config_value_id,
        first_name,
        last_name,
        username,
        email,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [pendingStatusId, fixture.firstName, fixture.lastName, fixture.stem, email]
  );
  const firstUserId = Number(firstResult.insertId || 0);
  assert(firstUserId > 0, 'Unable to create the rollback-only username fixture.');

  const usernameMatch = await authModel.getUserByLoginIdentifier(fixture.stem.toLowerCase(), connection);
  const emailMatch = await authModel.getUserByLoginIdentifier(email.toUpperCase(), connection);
  assert(Number(usernameMatch?.user_id || 0) === firstUserId, 'Username login lookup did not resolve the temporary user.');
  assert(Number(emailMatch?.user_id || 0) === firstUserId, 'Email login lookup did not resolve the same temporary user.');

  const collisionUsername = await authModel.allocateUsernameWithConnection(
    { firstName: fixture.firstName, lastName: fixture.lastName },
    connection
  );
  assert(collisionUsername === `${fixture.stem}2`, `Expected duplicate username ${fixture.stem}2 but received ${collisionUsername}.`);

  const secondEmail = `stage10w11-duplicate-${unique}@example.invalid`;
  const [secondResult] = await connection.query(
    `
      INSERT INTO users (
        account_status_config_value_id,
        first_name,
        last_name,
        username,
        email,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [pendingStatusId, fixture.firstName, fixture.lastName, collisionUsername, secondEmail]
  );
  const secondUserId = Number(secondResult.insertId || 0);
  assert(secondUserId > 0 && secondUserId !== firstUserId, 'Unable to create the rollback-only collision fixture.');

  const collisionMatch = await authModel.getUserByLoginIdentifier(collisionUsername, connection);
  assert(Number(collisionMatch?.user_id || 0) === secondUserId, 'The suffixed username did not resolve the second temporary user.');

  return {
    stem: fixture.stem,
    collisionUsername
  };
}

async function main() {
  const connection = await pool.getConnection();

  try {
    await assertSchema(connection);
    const existingUserCount = await assertExistingUsers(connection);
    await connection.beginTransaction();

    try {
      const fixture = await verifyLookupAndCollision(connection);
      await connection.rollback();
      console.log(
        `Stage 10W.11 username live path verified across ${existingUserCount} existing user(s): `
        + `email and case-insensitive username login lookup resolve the same account, and duplicate ${fixture.stem} allocation produced ${fixture.collisionUsername}. `
        + 'All temporary users were rolled back.'
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
