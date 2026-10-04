const { pool } = require('../models/db');
const { normalizeTimeZone } = require('../utils/timeZone');

const DEFAULT_TIME_ZONE = 'America/Chicago';

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}


async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0]?.COLUMN_TYPE || null;
}

async function inspect(connection) {
  if (!await tableExists(connection, 'users')) throw new Error('Missing required users table.');
  const userIdType = await getColumnType(connection, 'users', 'user_id');
  if (!userIdType) throw new Error('Could not resolve users.user_id type.');

  const exists = await tableExists(connection, 'application_settings');
  let row = null;

  if (exists) {
    const [rows] = await connection.query(
      `SELECT application_settings_id, default_time_zone
       FROM application_settings
       WHERE application_settings_id = 1
       LIMIT 1`
    );
    row = rows[0] || null;
  }

  return { exists, row, userIdType };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const connection = await pool.getConnection();

  try {
    const before = await inspect(connection);
    console.log(`Application timezone foundation (${apply ? 'apply' : 'dry-run'})`);
    console.log(`Settings table: ${before.exists ? 'present' : 'missing'}`);
    console.log(`Settings row: ${before.row ? 'present' : 'missing'}`);

    if (before.row && !normalizeTimeZone(before.row.default_time_zone, null)) {
      throw new Error(`Stored default time zone is invalid: ${before.row.default_time_zone}`);
    }

    if (!apply) {
      console.log(`Default for a new installation: ${DEFAULT_TIME_ZONE}`);
      return;
    }

    await connection.beginTransaction();

    if (!before.exists) {
      await connection.query(`
        CREATE TABLE application_settings (
          application_settings_id TINYINT UNSIGNED NOT NULL,
          default_time_zone VARCHAR(120) NOT NULL,
          updated_by_user_id ${before.userIdType} NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (application_settings_id),
          CONSTRAINT fk_application_settings_updated_by
            FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
            ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!before.row) {
      await connection.query(
        `INSERT INTO application_settings (application_settings_id, default_time_zone)
         VALUES (1, ?)`,
        [DEFAULT_TIME_ZONE]
      );
    }

    await connection.commit();

    const after = await inspect(connection);
    if (!after.exists || !after.row || !normalizeTimeZone(after.row.default_time_zone, null)) {
      throw new Error('Application timezone foundation verification failed after apply.');
    }

    console.log(`Application default time zone: ${after.row.default_time_zone}`);
    console.log('Application timezone foundation applied successfully.');
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
