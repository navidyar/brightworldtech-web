const { pool } = require('./db');
const accessPolicy = require('../config/accessPolicy');
const { assertProtectedAdminInvariant } = require('../config/protectedAdmin');
const userManagementAudit = require('./userManagementAuditModel');
const permissionManagementModel = require('./permissionManagementModel');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const { normalizeUserListSort, sortUserRows } = require('../utils/managementUserSort');
const { formatUtcSqlDateTime } = require('../utils/timeZone');
const { getLoginInactivityState } = require('../services/loginInactivityPolicy');

function roleAssignmentAuditState(userId, roles) {
  const safeRoles = Array.isArray(roles) ? roles : [];
  return {
    userId: Number(userId),
    roleIds: safeRoles.map((role) => Number(role.role_id)).sort((a, b) => a - b),
    roles: safeRoles.map((role) => ({
      roleId: Number(role.role_id),
      name: role.name,
      systemKey: role.system_key || null
    })).sort((a, b) => a.roleId - b.roleId)
  };
}

function getPasswordLinkStatus(row) {
  if (!row || !row.latest_password_link_expires_at) {
    return null;
  }

  if (row.latest_password_link_used_at) {
    return 'used';
  }

  if (row.latest_password_link_revoked_at) {
    return 'revoked';
  }

  const expiresAt = new Date(row.latest_password_link_expires_at);

  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return 'expired';
  }

  return 'active';
}

function mapUserRow(row) {
  const roles = row.role_codes ? row.role_codes.split(',') : [];
  const roleNames = row.role_names ? row.role_names.split(', ') : [];
  const primaryRoleCode = accessPolicy.getPrimaryRole(roles);
  const primaryRoleIndex = roles.indexOf(primaryRoleCode);
  const primaryRoleName = primaryRoleIndex >= 0 ? roleNames[primaryRoleIndex] : row.primary_role_name || primaryRoleCode || '';
  const accountStatusSystemId = Number(row.account_status_system_config_value_id || 0);
  const linkTypeSystemId = Number(row.latest_password_link_type_system_config_value_id || 0);
  const accountStatusCode = accountStatusSystemId === SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_ACTIVE
    ? 'active'
    : accountStatusSystemId === SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP ? 'pending_setup' : '';
  const latestPasswordLinkTypeCode = linkTypeSystemId === SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_RESET
    ? 'password_reset'
    : linkTypeSystemId === SYSTEM_CONFIG_VALUE_IDS.PASSWORD_LINK_SETUP ? 'password_setup' : '';

  const mapped = {
    ...row,
    roles,
    account_status_code: accountStatusCode,
    latest_password_link_type_code: latestPasswordLinkTypeCode,
    primary_role_code: primaryRoleCode,
    primary_role_name: primaryRoleName,
    role_count: Number(row.role_count || roles.length || 0),
    is_active: Number(row.is_active) === 1,
    has_password: Number(row.has_password || 0) === 1,
    can_delete_pending_setup: accountStatusSystemId === SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP
      && Number(row.has_password || 0) !== 1
      && !row.last_login_at,
    latest_password_link_status: getPasswordLinkStatus(row),
    monitor_login_inactivity: row.login_inactivity_override === 'allow' || (row.login_inactivity_override !== 'deny' && Number(row.login_inactivity_role_grant || 0) === 1)
  };
  const inactivity = getLoginInactivityState({
    monitored: mapped.monitor_login_inactivity,
    isActive: mapped.is_active,
    accountStatusCode: mapped.account_status_code,
    lastLoginAt: mapped.last_login_at,
    startDate: mapped.start_date,
    createdAt: mapped.created_at
  });
  return { ...mapped, login_inactivity_business_days: inactivity.businessDays, login_inactivity_overdue: inactivity.overdue };
}

function getRoleOrderSql(alias = 'r') {
  return `
    CASE ${alias}.code
      WHEN 'admin' THEN 10
      WHEN 'management' THEN 20
      WHEN 'tech_lead' THEN 30
      WHEN 'qc' THEN 35
      WHEN 'tech' THEN 40
      ELSE 999
    END
  `;
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
  const activeOnly = options.activeOnly !== false;
  const activeFilter = activeOnly ? 1 : 0;
  const sort = normalizeUserListSort(options.sort);

  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.personal_email,
        u.phone,
        DATE_FORMAT(u.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(u.end_date, '%Y-%m-%d') AS end_date,
        status_system.system_config_value_id AS account_status_system_config_value_id,
        status.label AS account_status_label,
        u.password_hash IS NOT NULL AS has_password,
        u.is_active,
        u.last_login_at,
        (SELECT upo.effect
         FROM user_permission_overrides upo
         INNER JOIN permissions monitor_p ON monitor_p.permission_id = upo.permission_id
         WHERE upo.user_id = u.user_id AND monitor_p.permission_key = 'users.login_inactivity.monitor'
         LIMIT 1) AS login_inactivity_override,
        EXISTS(
          SELECT 1 FROM user_roles monitor_ur
          INNER JOIN roles monitor_r ON monitor_r.role_id = monitor_ur.role_id AND monitor_r.is_active = 1
          INNER JOIN role_permissions monitor_rp ON monitor_rp.role_id = monitor_r.role_id
          INNER JOIN permissions monitor_p2 ON monitor_p2.permission_id = monitor_rp.permission_id AND monitor_p2.is_active = 1
          WHERE monitor_ur.user_id = u.user_id AND monitor_p2.permission_key = 'users.login_inactivity.monitor'
        ) AS login_inactivity_role_grant,
        latest_upl.expires_at AS latest_password_link_expires_at,
        latest_upl.used_at AS latest_password_link_used_at,
        latest_upl.revoked_at AS latest_password_link_revoked_at,
        latest_link_type_system.system_config_value_id AS latest_password_link_type_system_config_value_id,
        u.created_at,
        u.updated_at,
        GROUP_CONCAT(r.code ORDER BY ${getRoleOrderSql('r')} SEPARATOR ',') AS role_codes,
        GROUP_CONCAT(r.name ORDER BY ${getRoleOrderSql('r')} SEPARATOR ', ') AS role_names,
        COUNT(DISTINCT r.role_id) AS role_count
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.user_id
      LEFT JOIN roles r
        ON r.role_id = ur.role_id
      LEFT JOIN user_password_links latest_upl
        ON latest_upl.user_password_link_id = (
          SELECT MAX(upl_lookup.user_password_link_id)
          FROM user_password_links upl_lookup
          WHERE upl_lookup.user_id = u.user_id
        )
      LEFT JOIN config_values latest_link_type
        ON latest_link_type.config_value_id = latest_upl.link_type_config_value_id
      LEFT JOIN system_config_values latest_link_type_system
        ON latest_link_type_system.config_value_id = latest_link_type.config_value_id
      WHERE u.is_active = ?
      GROUP BY
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.personal_email,
        u.phone,
        u.start_date,
        u.end_date,
        status_system.system_config_value_id,
        status.label,
        u.password_hash,
        u.is_active,
        u.last_login_at,
        latest_upl.expires_at,
        latest_upl.used_at,
        latest_upl.revoked_at,
        latest_link_type_system.system_config_value_id,
        u.created_at,
        u.updated_at
      ORDER BY u.last_name, u.first_name, u.email
    `,
    [activeFilter]
  );

  return sortUserRows(rows.map(mapUserRow), { sort, activeOnly });
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

async function listAssignableAccountRoles() {
  const roleCodes = accessPolicy.ACCOUNT_ROLE_CODES;
  const placeholders = roleCodes.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        role_id,
        code,
        name,
        description
      FROM roles
      WHERE is_active = 1
        AND code IN (${placeholders})
      ORDER BY ${getRoleOrderSql('roles')}, name
    `,
    roleCodes
  );

  return rows;
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.personal_email,
        u.phone,
        DATE_FORMAT(u.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(u.end_date, '%Y-%m-%d') AS end_date,
        status_system.system_config_value_id AS account_status_system_config_value_id,
        status.label AS account_status_label,
        u.password_hash IS NOT NULL AS has_password,
        u.is_active,
        u.last_login_at,
        latest_upl.expires_at AS latest_password_link_expires_at,
        latest_upl.used_at AS latest_password_link_used_at,
        latest_upl.revoked_at AS latest_password_link_revoked_at,
        latest_link_type_system.system_config_value_id AS latest_password_link_type_system_config_value_id,
        GROUP_CONCAT(r.code ORDER BY ${getRoleOrderSql('r')} SEPARATOR ',') AS role_codes,
        GROUP_CONCAT(r.name ORDER BY ${getRoleOrderSql('r')} SEPARATOR ', ') AS role_names,
        COUNT(DISTINCT r.role_id) AS role_count
      FROM users u
      LEFT JOIN config_values status
        ON status.config_value_id = u.account_status_config_value_id
      LEFT JOIN system_config_values status_system
        ON status_system.config_value_id = status.config_value_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.user_id
      LEFT JOIN roles r
        ON r.role_id = ur.role_id
      LEFT JOIN user_password_links latest_upl
        ON latest_upl.user_password_link_id = (
          SELECT MAX(upl_lookup.user_password_link_id)
          FROM user_password_links upl_lookup
          WHERE upl_lookup.user_id = u.user_id
        )
      LEFT JOIN config_values latest_link_type
        ON latest_link_type.config_value_id = latest_upl.link_type_config_value_id
      LEFT JOIN system_config_values latest_link_type_system
        ON latest_link_type_system.config_value_id = latest_link_type.config_value_id
      WHERE u.user_id = ?
      GROUP BY
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.personal_email,
        u.phone,
        u.start_date,
        u.end_date,
        status_system.system_config_value_id,
        status.label,
        u.password_hash,
        u.is_active,
        u.last_login_at,
        latest_upl.expires_at,
        latest_upl.used_at,
        latest_upl.revoked_at,
        latest_link_type_system.system_config_value_id
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] ? mapUserRow(rows[0]) : null;
}

async function updateUserProfile({ userId, firstName, lastName, email, personalEmail = null, phone = null, startDate = null, endDate = null, actorUserId = null }) {
  const safeUserId = Number(userId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const before = await userManagementAudit.getSnapshot(connection, safeUserId);
    const [result] = await connection.query(
    `
      UPDATE users
      SET
        first_name = ?,
        last_name = ?,
        email = ?,
        personal_email = ?,
        phone = ?,
        start_date = ?,
        end_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
    [firstName, lastName, email, personalEmail, phone, startDate, endDate, safeUserId]
  );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return null;
    }
    const after = await userManagementAudit.getSnapshot(connection, safeUserId);
    await userManagementAudit.writeEvent(connection, {
      actorUserId, targetUserId: safeUserId, action: 'user_profile_updated', before, after
    });
    await connection.commit();
    return getUserById(safeUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUserWithRoles({ userId, firstName, lastName, email, personalEmail = null, phone = null, startDate = null, endDate = null, roleCodes, actorUserId = null }) {
  const safeUserId = Number(userId);
  try {
    assertProtectedAdminInvariant({ userId: safeUserId, roleCodes });
  } catch (error) {
    await userManagementAudit.recordBlocked({ actorUserId, targetUserId: safeUserId, action: 'user_role_change_blocked', reason: error.message });
    throw error;
  }
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const before = await userManagementAudit.getSnapshot(connection, safeUserId);
    const beforePermissionRoles = await permissionManagementModel.getUserRoles(safeUserId, connection);

    const [result] = await connection.query(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          personal_email = ?,
          phone = ?,
          start_date = ?,
          end_date = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `,
      [firstName, lastName, email, personalEmail, phone, startDate, endDate, safeUserId]
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

    const after = await userManagementAudit.getSnapshot(connection, safeUserId);
    const changes = userManagementAudit.diffSnapshots(before, after);
    await userManagementAudit.writeEvent(connection, {
      actorUserId, targetUserId: safeUserId,
      action: changes.roles ? 'user_roles_updated' : 'user_profile_updated', before, after
    });
    if (changes.roles) {
      const afterPermissionRoles = await permissionManagementModel.getUserRoles(safeUserId, connection);
      await permissionManagementModel.writeAuditEvent(connection, {
        actorUserId,
        eventType: 'user_roles_replaced',
        targetUserId: safeUserId,
        beforeState: roleAssignmentAuditState(safeUserId, beforePermissionRoles),
        afterState: roleAssignmentAuditState(safeUserId, afterPermissionRoles)
      });
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

async function setUserActiveStatus({ userId, isActive, actorUserId = null }) {
  const safeUserId = Number(userId);
  try {
    assertProtectedAdminInvariant({ userId: safeUserId, isActive });
  } catch (error) {
    await userManagementAudit.recordBlocked({ actorUserId, targetUserId: safeUserId, action: 'user_deactivation_blocked', reason: error.message });
    throw error;
  }
  const activeValue = isActive ? 1 : 0;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const before = await userManagementAudit.getSnapshot(connection, safeUserId);

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

    if (result.affectedRows > 0) {
      const after = await userManagementAudit.getSnapshot(connection, safeUserId);
      await userManagementAudit.writeEvent(connection, {
        actorUserId, targetUserId: safeUserId,
        action: isActive ? 'user_activated' : 'user_deactivated', before, after
      });
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

async function deactivateUser(userId, actorUserId = null) {
  return setUserActiveStatus({ userId, isActive: false, actorUserId });
}

async function reactivateUser(userId, actorUserId = null) {
  return setUserActiveStatus({ userId, isActive: true, actorUserId });
}

async function deletePendingSetupUser(userId, actorUserId = null) {
  const safeUserId = Number(userId);
  try {
    assertProtectedAdminInvariant({ userId: safeUserId, deleting: true });
  } catch (error) {
    await userManagementAudit.recordBlocked({ actorUserId, targetUserId: safeUserId, action: 'user_deletion_blocked', reason: error.message });
    throw error;
  }
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT
          u.user_id,
          status_system.system_config_value_id AS account_status_system_config_value_id,
          u.password_hash IS NOT NULL AS has_password,
          u.last_login_at
        FROM users u
        LEFT JOIN config_values status
          ON status.config_value_id = u.account_status_config_value_id
        LEFT JOIN system_config_values status_system
          ON status_system.config_value_id = status.config_value_id
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

    const canDeletePendingSetup = Number(user.account_status_system_config_value_id) === SYSTEM_CONFIG_VALUE_IDS.ACCOUNT_PENDING_SETUP
      && Number(user.has_password) !== 1
      && !user.last_login_at;

    if (!canDeletePendingSetup) {
      await connection.rollback();
      return { deleted: false, reason: 'not_allowed' };
    }

    const before = await userManagementAudit.getSnapshot(connection, safeUserId);

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

    if (deleteResult.affectedRows > 0) {
      await userManagementAudit.writeEvent(connection, {
        actorUserId, targetUserId: safeUserId, action: 'user_deleted', before
      });
    }

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


function formatRoleLabel(roleCode) {
  const labels = {
    admin: 'Admin',
    management: 'Management',
    tech_lead: 'Tech Lead',
    qc: 'Quality Control',
    tech: 'Tech',
    unknown: 'Unknown'
  };

  return labels[roleCode] || String(roleCode || 'Unknown')
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

async function listLoginActivityForDay({ startAt, endAt }) {
  const startAtUtc = formatUtcSqlDateTime(startAt);
  const endAtUtc = formatUtcSqlDateTime(endAt);

  const [rows] = await pool.query(
    `
      SELECT
        ula.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            ula.primary_role_code
            ORDER BY ula.logged_in_at ASC, ula.user_login_activity_id ASC
            SEPARATOR ','
          ),
          ',',
          1
        ) AS first_login_role_code,
        DATE_FORMAT(MIN(ula.logged_in_at), '%Y-%m-%dT%H:%i:%s.000Z') AS first_login_at,
        DATE_FORMAT(MAX(ula.logged_in_at), '%Y-%m-%dT%H:%i:%s.000Z') AS last_login_at,
        COUNT(*) AS successful_login_count
      FROM user_login_activity ula
      INNER JOIN users u
        ON u.user_id = ula.user_id
      WHERE ula.logged_in_at >= ?
        AND ula.logged_in_at < ?
      GROUP BY
        ula.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email
      ORDER BY
        first_login_at ASC,
        u.last_name ASC,
        u.first_name ASC,
        u.email ASC
    `,
    [startAtUtc, endAtUtc]
  );

  return rows.map((row) => ({
    ...row,
    first_login_role_label: formatRoleLabel(row.first_login_role_code),
    successful_login_count: Number(row.successful_login_count || 0)
  }));
}

async function listUserLoginActivityForDay({ userId, startAt, endAt }) {
  const startAtUtc = formatUtcSqlDateTime(startAt);
  const endAtUtc = formatUtcSqlDateTime(endAt);

  const [rows] = await pool.query(
    `
      SELECT
        ula.user_login_activity_id,
        ula.user_id,
        ula.primary_role_code,
        DATE_FORMAT(ula.logged_in_at, '%Y-%m-%dT%H:%i:%s.000Z') AS logged_in_at
      FROM user_login_activity ula
      WHERE ula.user_id = ?
        AND ula.logged_in_at >= ?
        AND ula.logged_in_at < ?
      ORDER BY
        ula.logged_in_at ASC,
        ula.user_login_activity_id ASC
    `,
    [userId, startAtUtc, endAtUtc]
  );

  return rows.map((row) => ({
    ...row,
    role_label: formatRoleLabel(row.primary_role_code)
  }));
}

module.exports = {
  listUsers,
  countUsersByActiveStatus,
  listAssignableAccountRoles,
  getUserById,
  updateUserProfile,
  updateUserWithRoles,
  deactivateUser,
  reactivateUser,
  deletePendingSetupUser,
  listLoginActivityForDay,
  listUserLoginActivityForDay
};
