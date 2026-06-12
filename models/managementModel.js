const { pool } = require('./db');

function mapUserRow(row) {
  return {
    ...row,
    roles: row.role_codes ? row.role_codes.split(',') : [],
    is_active: Number(row.is_active) === 1,
    has_password: Number(row.has_password || 0) === 1,
    can_delete_pending_setup: Number(row.can_delete_pending_setup || 0) === 1
  };
}

async function getRoleId(roleCode, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT role_id
      FROM roles
      WHERE code = ?
        AND is_active = 1
      LIMIT 1
    `,
    [roleCode]
  );

  if (!rows[0]) {
    throw new Error(`Missing active role: ${roleCode}`);
  }

  return rows[0].role_id;
}

async function listUsers(options = {}) {
  const activeFilter = options.activeOnly === false ? 0 : 1;

  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        status.code AS account_status_code,
        status.label AS account_status_label,
        u.password_hash IS NOT NULL AS has_password,
        u.is_active,
        u.last_login_at,
        CASE
          WHEN status.code = 'pending_setup'
            AND u.password_hash IS NULL
            AND u.last_login_at IS NULL
          THEN 1
          ELSE 0
        END AS can_delete_pending_setup,
        u.created_at,
        u.updated_at,
        GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS role_codes,
        GROUP_CONCAT(r.name ORDER BY r.code SEPARATOR ', ') AS role_names
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.user_id
      LEFT JOIN roles r
        ON r.role_id = ur.role_id
      WHERE u.is_active = ?
      GROUP BY
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        status.code,
        status.label,
        u.password_hash,
        u.is_active,
        u.last_login_at,
        can_delete_pending_setup,
        u.created_at,
        u.updated_at
      ORDER BY u.last_name, u.first_name, u.email
    `,
    [activeFilter]
  );

  return rows.map(mapUserRow);
}

async function countUsersByActiveStatus() {
  const [rows] = await pool.query(`
    SELECT
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count
    FROM users
  `);

  return {
    activeCount: Number(rows[0]?.active_count || 0),
    inactiveCount: Number(rows[0]?.inactive_count || 0)
  };
}

async function listActiveRoles() {
  const [rows] = await pool.query(`
    SELECT
      role_id,
      code,
      name,
      description
    FROM roles
    WHERE is_active = 1
    ORDER BY
      CASE code
        WHEN 'admin' THEN 10
        WHEN 'management' THEN 20
        WHEN 'tech_lead' THEN 30
        WHEN 'tech' THEN 40
        WHEN 'qc' THEN 50
        WHEN 'packing' THEN 60
        WHEN 'warehouse' THEN 70
        WHEN 'sales' THEN 80
        ELSE 999
      END,
      name
  `);

  return rows;
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        status.code AS account_status_code,
        status.label AS account_status_label,
        u.password_hash IS NOT NULL AS has_password,
        u.is_active,
        u.last_login_at,
        CASE
          WHEN status.code = 'pending_setup'
            AND u.password_hash IS NULL
            AND u.last_login_at IS NULL
          THEN 1
          ELSE 0
        END AS can_delete_pending_setup,
        GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS role_codes,
        GROUP_CONCAT(r.name ORDER BY r.code SEPARATOR ', ') AS role_names
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
        status.code,
        status.label,
        u.password_hash,
        u.is_active,
        u.last_login_at,
        can_delete_pending_setup
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function updateUserWithRoles({ userId, firstName, lastName, email, roleCodes }) {
  const safeUserId = Number(userId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `,
      [firstName, lastName, email, safeUserId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return null;
    }

    await connection.query(
      `
        DELETE FROM user_roles
        WHERE user_id = ?
      `,
      [safeUserId]
    );

    for (const roleCode of roleCodes) {
      const roleId = await getRoleId(roleCode, connection);

      await connection.query(
        `
          INSERT IGNORE INTO user_roles (user_id, role_id)
          VALUES (?, ?)
        `,
        [safeUserId, roleId]
      );
    }

    await connection.commit();

    return getUserById(safeUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setUserActiveStatus({ userId, isActive }) {
  const safeUserId = Number(userId);
  const activeValue = isActive ? 1 : 0;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `
        UPDATE users
        SET
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `,
      [activeValue, safeUserId]
    );

    if (!isActive) {
      await connection.query(
        `
          UPDATE user_password_links
          SET revoked_at = NOW()
          WHERE user_id = ?
            AND used_at IS NULL
            AND revoked_at IS NULL
        `,
        [safeUserId]
      );
    }

    await connection.commit();

    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deactivateUser(userId) {
  return setUserActiveStatus({ userId, isActive: false });
}

async function reactivateUser(userId) {
  return setUserActiveStatus({ userId, isActive: true });
}

async function deletePendingSetupUser(userId) {
  const safeUserId = Number(userId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT
          u.user_id,
          status.code AS account_status_code,
          u.password_hash IS NOT NULL AS has_password,
          u.last_login_at
        FROM users u
        LEFT JOIN config_values status
          ON status.config_value_id = u.account_status_config_value_id
        WHERE u.user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [safeUserId]
    );

    const user = rows[0];

    if (!user) {
      await connection.rollback();
      return { deleted: false, reason: 'not_found' };
    }

    const canDeletePendingSetup = user.account_status_code === 'pending_setup'
      && Number(user.has_password) !== 1
      && !user.last_login_at;

    if (!canDeletePendingSetup) {
      await connection.rollback();
      return { deleted: false, reason: 'not_allowed' };
    }

    await connection.query(
      `
        DELETE FROM user_password_links
        WHERE user_id = ?
      `,
      [safeUserId]
    );

    await connection.query(
      `
        DELETE FROM user_roles
        WHERE user_id = ?
      `,
      [safeUserId]
    );

    const [deleteResult] = await connection.query(
      `
        DELETE FROM users
        WHERE user_id = ?
        LIMIT 1
      `,
      [safeUserId]
    );

    await connection.commit();

    return {
      deleted: deleteResult.affectedRows > 0,
      reason: deleteResult.affectedRows > 0 ? null : 'not_found'
    };
  } catch (error) {
    await connection.rollback();

    if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451)) {
      return { deleted: false, reason: 'has_links' };
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listUsers,
  countUsersByActiveStatus,
  listActiveRoles,
  getUserById,
  updateUserWithRoles,
  deactivateUser,
  reactivateUser,
  deletePendingSetupUser
};
