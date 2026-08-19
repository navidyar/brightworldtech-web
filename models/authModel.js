const { pool } = require('./db');
const { getConfigValueIdBySystemId, getConfigValueBySystemId } = require('./configLookupModel');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const { buildUsernameStem, nextAvailableUsername, normalizeUsername } = require('../services/userUsernamePolicy');
const {
  DEFAULT_PASSWORD_LINK_EXPIRY_HOURS,
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  normalizePasswordLinkExpiryHours
} = require('../services/passwordLinkExpiryPolicy');

const ACCOUNT_STATUS_CODE_BY_SYSTEM_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_ACTIVE]: 'active',
  [SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP]: 'pending_setup'
});
const PASSWORD_LINK_CODE_BY_SYSTEM_ID = Object.freeze({
  [SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP]: 'password_setup',
  [SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_RESET]: 'password_reset'
});
const PASSWORD_LINK_SYSTEM_ID_BY_CODE = Object.freeze({
  initial_password_setup: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP,
  password_setup: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP,
  setup: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP,
  password_reset: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_RESET,
  reset: SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_RESET
});

async function getPasswordLinkExpiryHours() {
  const value = await getConfigValueBySystemId(SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_EXPIRY_HOURS);
  return normalizePasswordLinkExpiryHours(value?.value);
}

async function getSystemConfigValueId(systemConfigValueId, connection = pool) {
  const configValueId = await getConfigValueIdBySystemId(systemConfigValueId, connection);
  if (!configValueId) throw new Error(`Missing system config value ID ${systemConfigValueId}.`);
  return configValueId;
}

async function getRoleId(roleCode, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT role_id
      FROM roles
      WHERE code = ?
      LIMIT 1
    `,
    [roleCode]
  );

  if (!rows[0]) {
    throw new Error(`Missing role: ${roleCode}`);
  }

  return rows[0].role_id;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeLoginIdentifier(identifier) {
  return String(identifier || '').trim();
}

function normalizeAuthUser(row) {
  if (!row) return null;
  const accountStatusSystemId = Number(row.account_status_system_config_value_id || 0);
  return {
    ...row,
    account_status_code: ACCOUNT_STATUS_CODE_BY_SYSTEM_ID[accountStatusSystemId] || ''
  };
}

function normalizePasswordLink(row) {
  if (!row) return null;
  const normalized = normalizeAuthUser(row);
  const linkTypeSystemId = Number(row.link_type_system_config_value_id || 0);
  return {
    ...normalized,
    link_type_code: PASSWORD_LINK_CODE_BY_SYSTEM_ID[linkTypeSystemId] || ''
  };
}

async function getUserByLoginIdentifier(identifier, connection = pool) {
  const normalizedIdentifier = normalizeLoginIdentifier(identifier);
  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const normalizedUsername = normalizeUsername(normalizedIdentifier);

  const [rows] = await connection.query(
    `
      SELECT
        u.user_id,
        u.account_status_config_value_id,
        status_system.system_config_value_id AS account_status_system_config_value_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.password_hash,
        u.failed_login_count,
        u.locked_until,
        u.last_login_at,
        u.is_active
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      WHERE LOWER(u.email) = ?
        OR u.username = ?
      LIMIT 1
    `,
    [normalizedEmail, normalizedUsername]
  );

  return normalizeAuthUser(rows[0]);
}

async function getUserByEmail(email, connection = pool) {
  const normalizedEmail = normalizeEmail(email);

  const [rows] = await connection.query(
    `
      SELECT
        u.user_id,
        u.account_status_config_value_id,
        status_system.system_config_value_id AS account_status_system_config_value_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.password_hash,
        u.failed_login_count,
        u.locked_until,
        u.last_login_at,
        u.is_active
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      WHERE LOWER(u.email) = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return normalizeAuthUser(rows[0]);
}

async function getUserByIdWithRoles(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.is_active,
        status_system.system_config_value_id AS account_status_system_config_value_id,
        GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS role_codes
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.user_id
      LEFT JOIN roles r
        ON r.role_id = ur.role_id
      WHERE u.user_id = ?
      GROUP BY
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.is_active,
        status_system.system_config_value_id
      LIMIT 1
    `,
    [userId]
  );

  const user = normalizeAuthUser(rows[0]);

  if (!user) {
    return null;
  }

  return {
    ...user,
    roles: user.role_codes ? user.role_codes.split(',') : []
  };
}

async function recordSuccessfulLogin(userId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [updateResult] = await connection.query(
      `
        UPDATE users
        SET
          failed_login_count = 0,
          locked_until = NULL,
          last_login_at = NOW()
        WHERE user_id = ?
      `,
      [userId]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error('Unable to record login for a missing user.');
    }

    await connection.query(
      `
        INSERT INTO user_login_activity (
          user_id,
          primary_role_code,
          logged_in_at
        )
        SELECT
          u.user_id,
          COALESCE(
            (
              SELECT r.code
              FROM user_roles ur
              INNER JOIN roles r
                ON r.role_id = ur.role_id
              WHERE ur.user_id = u.user_id
                AND r.is_active = 1
              ORDER BY
                CASE r.code
                  WHEN 'admin' THEN 10
                  WHEN 'management' THEN 20
                  WHEN 'tech_lead' THEN 30
                  WHEN 'qc' THEN 35
                  WHEN 'tech' THEN 40
                  ELSE 999
                END,
                r.code
              LIMIT 1
            ),
            'unknown'
          ) AS primary_role_code,
          NOW()
        FROM users u
        WHERE u.user_id = ?
      `,
      [userId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordFailedLogin(identifier, connection = pool) {
  const normalizedIdentifier = normalizeLoginIdentifier(identifier);
  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const normalizedUsername = normalizeUsername(normalizedIdentifier);

  await connection.query(
    `
      UPDATE users
      SET failed_login_count = failed_login_count + 1
      WHERE LOWER(email) = ?
        OR username = ?
    `,
    [normalizedEmail, normalizedUsername]
  );
}

async function allocateUsernameWithConnection({ firstName, lastName }, connection) {
  const stem = buildUsernameStem(firstName, lastName);
  const [rows] = await connection.query(
    `
      SELECT username
      FROM users
      WHERE username = ?
        OR username LIKE CONCAT(?, '%')
      FOR UPDATE
    `,
    [stem, stem]
  );

  return nextAvailableUsername(stem, rows.map((row) => row.username));
}

async function createUserWithRoles({ firstName, lastName, email, roleCodes }) {
  const normalizedEmail = normalizeEmail(email);
  const primaryRoleCodes = Array.isArray(roleCodes) ? roleCodes.slice(0, 1) : [];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const pendingStatusId = await getSystemConfigValueId(SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP, connection);
    const [existingRows] = await connection.query(
      `
        SELECT user_id, username
        FROM users
        WHERE LOWER(email) = ?
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedEmail]
    );

    let userId;

    if (existingRows[0]) {
      userId = Number(existingRows[0].user_id);
      const username = existingRows[0].username
        ? normalizeUsername(existingRows[0].username)
        : await allocateUsernameWithConnection({ firstName, lastName }, connection);

      await connection.query(
        `
          UPDATE users
          SET
            first_name = ?,
            last_name = ?,
            username = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
        [firstName, lastName, username, userId]
      );
    } else {
      const username = await allocateUsernameWithConnection({ firstName, lastName }, connection);
      const [userResult] = await connection.query(
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
        [pendingStatusId, firstName, lastName, username, normalizedEmail]
      );

      userId = Number(userResult.insertId);
    }

    await connection.query(
      `
        DELETE FROM user_roles
        WHERE user_id = ?
      `,
      [userId]
    );

    for (const roleCode of primaryRoleCodes) {
      const roleId = await getRoleId(roleCode, connection);

      await connection.query(
        `
          INSERT IGNORE INTO user_roles (user_id, role_id)
          VALUES (?, ?)
        `,
        [userId, roleId]
      );
    }

    await connection.commit();

    return getUserByIdWithRoles(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPasswordLink({ userId, linkTypeCode, tokenHash, expiresAt, createdByUserId = null }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const linkTypeId = await getSystemConfigValueId(PASSWORD_LINK_SYSTEM_ID_BY_CODE[linkTypeCode], connection);

    await connection.query(
      `
        UPDATE user_password_links
        SET revoked_at = NOW()
        WHERE user_id = ?
          AND link_type_config_value_id = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
      `,
      [userId, linkTypeId]
    );

    await connection.query(
      `
        INSERT INTO user_password_links (
          user_id,
          link_type_config_value_id,
          token_hash,
          expires_at,
          created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [userId, linkTypeId, tokenHash, expiresAt, createdByUserId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getValidPasswordLink(tokenHash) {
  const [rows] = await pool.query(
    `
      SELECT
        upl.user_password_link_id,
        upl.user_id,
        upl.expires_at,
        link_type_system.system_config_value_id AS link_type_system_config_value_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.is_active,
        status_system.system_config_value_id AS account_status_system_config_value_id
      FROM user_password_links upl
      JOIN users u
        ON u.user_id = upl.user_id
      JOIN config_values link_type
        ON link_type.config_value_id = upl.link_type_config_value_id
      LEFT JOIN system_config_values link_type_system
        ON link_type_system.config_value_id = link_type.config_value_id
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      WHERE upl.token_hash = ?
        AND upl.used_at IS NULL
        AND upl.revoked_at IS NULL
        AND upl.expires_at > NOW()
        AND u.is_active = 1
      LIMIT 1
    `,
    [tokenHash]
  );

  return normalizePasswordLink(rows[0]);
}

async function setPasswordFromLink({ userPasswordLinkId, userId, passwordHash }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const activeStatusId = await getSystemConfigValueId(SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_ACTIVE, connection);

    await connection.query(
      `
        UPDATE users
        SET
          password_hash = ?,
          account_status_config_value_id = ?,
          password_updated_at = NOW(),
          failed_login_count = 0,
          locked_until = NULL,
          is_active = 1
        WHERE user_id = ?
      `,
      [passwordHash, activeStatusId, userId]
    );

    await connection.query(
      `
        UPDATE user_password_links
        SET used_at = NOW()
        WHERE user_password_link_id = ?
          AND user_id = ?
          AND used_at IS NULL
      `,
      [userPasswordLinkId, userId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  DEFAULT_PASSWORD_LINK_EXPIRY_HOURS,
  MIN_PASSWORD_LINK_EXPIRY_HOURS,
  MAX_PASSWORD_LINK_EXPIRY_HOURS,
  normalizePasswordLinkExpiryHours,
  getPasswordLinkExpiryHours,
  normalizeEmail,
  normalizeLoginIdentifier,
  getUserByLoginIdentifier,
  getUserByEmail,
  getUserByIdWithRoles,
  recordSuccessfulLogin,
  recordFailedLogin,
  allocateUsernameWithConnection,
  createUserWithRoles,
  createPasswordLink,
  getValidPasswordLink,
  setPasswordFromLink
};