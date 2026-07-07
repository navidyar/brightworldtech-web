const { pool } = require('./db');

const PASSWORD_LINK_EXPIRY_CATEGORY_CODE = 'security_settings';
const PASSWORD_LINK_EXPIRY_VALUE_CODE = 'password_link_expiry_hours';
const DEFAULT_PASSWORD_LINK_EXPIRY_HOURS = 1;
const MIN_PASSWORD_LINK_EXPIRY_HOURS = 1;
const MAX_PASSWORD_LINK_EXPIRY_HOURS = 24;

function normalizePasswordLinkExpiryHours(value) {
  const rawValue = String(value ?? '').trim();
  const hours = Number.parseInt(rawValue, 10);

  if (!/^\d+$/.test(rawValue) || !Number.isInteger(hours)) {
    return DEFAULT_PASSWORD_LINK_EXPIRY_HOURS;
  }

  if (hours < MIN_PASSWORD_LINK_EXPIRY_HOURS || hours > MAX_PASSWORD_LINK_EXPIRY_HOURS) {
    return DEFAULT_PASSWORD_LINK_EXPIRY_HOURS;
  }

  return hours;
}

async function getPasswordLinkExpiryHours() {
  const [rows] = await pool.query(
    `
      SELECT cv.value
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = ?
        AND cv.code = ?
        AND cv.is_active = 1
      LIMIT 1
    `,
    [PASSWORD_LINK_EXPIRY_CATEGORY_CODE, PASSWORD_LINK_EXPIRY_VALUE_CODE]
  );

  return normalizePasswordLinkExpiryHours(rows[0]?.value);
}

async function getConfigValueId(categoryCode, valueCode, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT cv.config_value_id
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code = ?
        AND cv.code = ?
      LIMIT 1
    `,
    [categoryCode, valueCode]
  );

  if (!rows[0]) {
    throw new Error(`Missing config value: ${categoryCode}.${valueCode}`);
  }

  return rows[0].config_value_id;
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

async function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.account_status_config_value_id,
        status.code AS account_status_code,
        u.first_name,
        u.last_name,
        u.email,
        u.password_hash,
        u.failed_login_count,
        u.locked_until,
        u.last_login_at,
        u.is_active
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      WHERE LOWER(u.email) = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return rows[0] || null;
}

async function getUserByIdWithRoles(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active,
        status.code AS account_status_code,
        GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS role_codes
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.user_id
      LEFT JOIN roles r
        ON r.role_id = ur.role_id
      WHERE u.user_id = ?
      GROUP BY
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active,
        status.code
      LIMIT 1
    `,
    [userId]
  );

  const user = rows[0] || null;

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

async function recordFailedLogin(email) {
  const normalizedEmail = normalizeEmail(email);

  await pool.query(
    `
      UPDATE users
      SET failed_login_count = failed_login_count + 1
      WHERE LOWER(email) = ?
    `,
    [normalizedEmail]
  );
}

async function createUserWithRoles({ firstName, lastName, email, roleCodes }) {
  const normalizedEmail = normalizeEmail(email);
  const primaryRoleCodes = Array.isArray(roleCodes) ? roleCodes.slice(0, 1) : [];
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const pendingStatusId = await getConfigValueId('account_statuses', 'pending_setup', connection);

    const [userResult] = await connection.query(
      `
        INSERT INTO users (
          account_status_config_value_id,
          first_name,
          last_name,
          email,
          is_active
        )
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          user_id = LAST_INSERT_ID(user_id),
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          updated_at = CURRENT_TIMESTAMP
      `,
      [pendingStatusId, firstName, lastName, normalizedEmail]
    );

    const userId = userResult.insertId;

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

    const linkTypeId = await getConfigValueId('password_link_types', linkTypeCode, connection);

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
        link_type.code AS link_type_code,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active,
        status.code AS account_status_code
      FROM user_password_links upl
      JOIN users u
        ON u.user_id = upl.user_id
      JOIN config_values link_type
        ON link_type.config_value_id = upl.link_type_config_value_id
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      WHERE upl.token_hash = ?
        AND upl.used_at IS NULL
        AND upl.revoked_at IS NULL
        AND upl.expires_at > NOW()
        AND u.is_active = 1
      LIMIT 1
    `,
    [tokenHash]
  );

  return rows[0] || null;
}

async function setPasswordFromLink({ userPasswordLinkId, userId, passwordHash }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const activeStatusId = await getConfigValueId('account_statuses', 'active', connection);

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
  getUserByEmail,
  getUserByIdWithRoles,
  recordSuccessfulLogin,
  recordFailedLogin,
  createUserWithRoles,
  createPasswordLink,
  getValidPasswordLink,
  setPasswordFromLink
};