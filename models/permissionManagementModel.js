'use strict';

const crypto = require('crypto');
const { pool } = require('./db');

function mapRoleRow(row) {
  if (!row) return null;
  return {
    ...row,
    role_id: Number(row.role_id),
    is_active: Number(row.is_active) === 1,
    assignment_count: row.assignment_count === undefined ? undefined : Number(row.assignment_count || 0),
    permission_count: row.permission_count === undefined ? undefined : Number(row.permission_count || 0)
  };
}

function createInternalRoleCode() {
  return `custom_${crypto.randomBytes(12).toString('hex')}`;
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listRoles(connection = pool) {
  const [rows] = await connection.query(
    `SELECT
       r.role_id,
       r.code,
       r.system_key,
       r.name,
       r.description,
       r.is_active,
       COUNT(DISTINCT ur.user_id) AS assignment_count,
       COUNT(DISTINCT rp.permission_id) AS permission_count
     FROM roles r
     LEFT JOIN user_roles ur ON ur.role_id = r.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.role_id
     GROUP BY r.role_id, r.code, r.system_key, r.name, r.description, r.is_active
     ORDER BY CASE WHEN r.system_key = 'super_admin' THEN 0 ELSE 1 END, r.name, r.role_id`
  );
  return rows.map(mapRoleRow);
}

async function getRoleById(roleId, connection = pool, { forUpdate = false } = {}) {
  const [rows] = await connection.query(
    `SELECT role_id, code, system_key, name, description, is_active
     FROM roles
     WHERE role_id = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [Number(roleId)]
  );
  return mapRoleRow(rows[0]);
}

async function getRolePermissionKeys(roleId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT p.permission_key
     FROM role_permissions rp
     INNER JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE rp.role_id = ?
       AND p.is_active = 1
     ORDER BY p.permission_key`,
    [Number(roleId)]
  );
  return rows.map((row) => row.permission_key);
}

async function listPermissionCatalog(connection = pool) {
  const [rows] = await connection.query(
    `SELECT permission_id, permission_key, permission_group, name, description, sort_order, is_active
     FROM permissions
     WHERE is_active = 1
     ORDER BY sort_order, permission_id`
  );
  return rows.map((row) => ({ ...row, permission_id: Number(row.permission_id), is_active: Number(row.is_active) === 1 }));
}

async function assertPermissionKeysExist(permissionKeys, connection = pool) {
  if (permissionKeys.length === 0) return;
  const placeholders = permissionKeys.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT permission_key
     FROM permissions
     WHERE is_active = 1
       AND permission_key IN (${placeholders})`,
    permissionKeys
  );
  const found = new Set(rows.map((row) => row.permission_key));
  const missing = permissionKeys.filter((permissionKey) => !found.has(permissionKey));
  if (missing.length > 0) {
    const error = new Error(`Inactive or missing permission key(s): ${missing.join(', ')}`);
    error.code = 'PERMISSION_CATALOG_MISMATCH';
    throw error;
  }
}

async function createRole({ name, description = null, isActive = true }, connection) {
  const code = createInternalRoleCode();
  const [result] = await connection.query(
    `INSERT INTO roles (code, system_key, name, description, is_active)
     VALUES (?, NULL, ?, ?, ?)`,
    [code, name, description, isActive ? 1 : 0]
  );
  return getRoleById(result.insertId, connection);
}

async function updateRole({ roleId, name, description = null, isActive }, connection) {
  await connection.query(
    `UPDATE roles
     SET name = ?, description = ?, is_active = ?
     WHERE role_id = ?`,
    [name, description, isActive ? 1 : 0, Number(roleId)]
  );
  return getRoleById(roleId, connection);
}

async function replaceRolePermissions({ roleId, permissionKeys, actorUserId = null }, connection) {
  await assertPermissionKeysExist(permissionKeys, connection);
  await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [Number(roleId)]);
  for (const permissionKey of permissionKeys) {
    await connection.query(
      `INSERT INTO role_permissions (role_id, permission_id, granted_by_user_id)
       SELECT ?, permission_id, ?
       FROM permissions
       WHERE permission_key = ?
         AND is_active = 1`,
      [Number(roleId), Number(actorUserId) > 0 ? Number(actorUserId) : null, permissionKey]
    );
  }
}

async function getRoleAssignedUsers(roleId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email, u.is_active
     FROM user_roles ur
     INNER JOIN users u ON u.user_id = ur.user_id
     WHERE ur.role_id = ?
     ORDER BY u.last_name, u.first_name, u.user_id`,
    [Number(roleId)]
  );
  return rows.map((row) => ({ ...row, user_id: Number(row.user_id), is_active: Number(row.is_active) === 1 }));
}

async function deleteRoleAssignments(roleId, connection) {
  await connection.query('DELETE FROM user_roles WHERE role_id = ?', [Number(roleId)]);
}

async function addRolesToUsers(userIds, roleIds, connection) {
  for (const userId of userIds) {
    for (const roleId of roleIds) {
      await connection.query(
        'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [Number(userId), Number(roleId)]
      );
    }
  }
}

async function deleteRole(roleId, connection) {
  await connection.query('DELETE FROM roles WHERE role_id = ?', [Number(roleId)]);
}

async function getUserById(userId, connection = pool, { forUpdate = false } = {}) {
  const [rows] = await connection.query(
    `SELECT user_id, first_name, last_name, email, is_active
     FROM users
     WHERE user_id = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [Number(userId)]
  );
  const row = rows[0];
  return row ? { ...row, user_id: Number(row.user_id), is_active: Number(row.is_active) === 1 } : null;
}

async function getUserRoles(userId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT r.role_id, r.code, r.system_key, r.name, r.description, r.is_active
     FROM user_roles ur
     INNER JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY r.name, r.role_id`,
    [Number(userId)]
  );
  return rows.map(mapRoleRow);
}

async function getRolesByIds(roleIds, connection = pool, { forUpdate = false } = {}) {
  if (roleIds.length === 0) return [];
  const placeholders = roleIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT role_id, code, system_key, name, description, is_active
     FROM roles
     WHERE role_id IN (${placeholders})
     ORDER BY name, role_id${forUpdate ? ' FOR UPDATE' : ''}`,
    roleIds.map(Number)
  );
  return rows.map(mapRoleRow);
}

async function replaceUserRoles({ userId, roleIds }, connection) {
  await connection.query('DELETE FROM user_roles WHERE user_id = ?', [Number(userId)]);
  for (const roleId of roleIds) {
    await connection.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [Number(userId), Number(roleId)]
    );
  }
}

async function countActiveSuperAdminUsers(connection = pool) {
  const [[row]] = await connection.query(
    `SELECT COUNT(DISTINCT u.user_id) AS count
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.user_id
     INNER JOIN roles r ON r.role_id = ur.role_id
     WHERE u.is_active = 1
       AND r.is_active = 1
       AND r.system_key = 'super_admin'`
  );
  return Number(row && row.count || 0);
}

async function getUserPermissionOverrides(userId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT p.permission_key, upo.effect, upo.created_at, upo.updated_at
     FROM user_permission_overrides upo
     INNER JOIN permissions p ON p.permission_id = upo.permission_id
     WHERE upo.user_id = ?
       AND p.is_active = 1
     ORDER BY p.permission_key`,
    [Number(userId)]
  );
  return rows;
}

async function setUserPermissionOverride({ userId, permissionKey, effect, actorUserId = null }, connection) {
  await assertPermissionKeysExist([permissionKey], connection);
  await connection.query(
    `INSERT INTO user_permission_overrides (
       user_id, permission_id, effect, created_by_user_id, updated_by_user_id
     )
     SELECT ?, permission_id, ?, ?, ?
     FROM permissions
     WHERE permission_key = ?
       AND is_active = 1
     ON DUPLICATE KEY UPDATE
       effect = VALUES(effect),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(userId), effect,
      Number(actorUserId) > 0 ? Number(actorUserId) : null,
      Number(actorUserId) > 0 ? Number(actorUserId) : null,
      permissionKey
    ]
  );
}

async function removeUserPermissionOverride({ userId, permissionKey }, connection) {
  await connection.query(
    `DELETE upo
     FROM user_permission_overrides upo
     INNER JOIN permissions p ON p.permission_id = upo.permission_id
     WHERE upo.user_id = ?
       AND p.permission_key = ?`,
    [Number(userId), permissionKey]
  );
}

async function getUserPermissionOverride(userId, permissionKey, connection = pool) {
  const [rows] = await connection.query(
    `SELECT p.permission_key, upo.effect
     FROM user_permission_overrides upo
     INNER JOIN permissions p ON p.permission_id = upo.permission_id
     WHERE upo.user_id = ?
       AND p.permission_key = ?
     LIMIT 1`,
    [Number(userId), permissionKey]
  );
  return rows[0] || null;
}

async function isMigrationStateApplied(migrationKey, connection = pool) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM authorization_migration_state
     WHERE migration_key = ?
     LIMIT 1`,
    [migrationKey]
  );
  return Boolean(rows[0]);
}

async function getActorName(actorUserId, connection = pool) {
  const actorId = Number(actorUserId);
  if (!Number.isInteger(actorId) || actorId <= 0) return null;
  const [rows] = await connection.query(
    `SELECT first_name, last_name, email
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [actorId]
  );
  const row = rows[0];
  if (!row) return null;
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `User #${actorId}`;
}

async function writeAuditEvent(connection, {
  actorUserId = null,
  eventType,
  targetUserId = null,
  targetRoleId = null,
  targetRoleNameSnapshot = null,
  permissionKeySnapshot = null,
  beforeState = null,
  afterState = null
}) {
  const actorId = Number(actorUserId) > 0 ? Number(actorUserId) : null;
  const actorNameSnapshot = actorId ? await getActorName(actorId, connection) : null;
  await connection.query(
    `INSERT INTO permission_audit_events (
       actor_user_id,
       actor_name_snapshot,
       event_type,
       target_user_id,
       target_role_id,
       target_role_name_snapshot,
       permission_key_snapshot,
       before_state_json,
       after_state_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId,
      actorNameSnapshot,
      eventType,
      Number(targetUserId) > 0 ? Number(targetUserId) : null,
      Number(targetRoleId) > 0 ? Number(targetRoleId) : null,
      targetRoleNameSnapshot,
      permissionKeySnapshot,
      beforeState === null ? null : JSON.stringify(beforeState),
      afterState === null ? null : JSON.stringify(afterState)
    ]
  );
}

function parsePermissionAuditJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function mapPermissionAuditRow(row) {
  return {
    ...row,
    permission_audit_event_id: Number(row.permission_audit_event_id),
    actor_user_id: Number(row.actor_user_id) > 0 ? Number(row.actor_user_id) : null,
    target_user_id: Number(row.target_user_id) > 0 ? Number(row.target_user_id) : null,
    target_role_id: Number(row.target_role_id) > 0 ? Number(row.target_role_id) : null,
    before_state: parsePermissionAuditJson(row.before_state_json),
    after_state: parsePermissionAuditJson(row.after_state_json)
  };
}

async function listPermissionAuditEvents({ page = 1, pageSize = 50, eventType = null, search = '' } = {}, connection = pool) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const safeEventType = String(eventType || '').trim();
  const safeSearch = String(search || '').trim().slice(0, 150);
  const offset = (safePage - 1) * safePageSize;
  const conditions = [];
  const params = [];

  if (safeEventType) {
    conditions.push('pae.event_type = ?');
    params.push(safeEventType);
  }
  if (safeSearch) {
    const like = `%${safeSearch}%`;
    conditions.push(`(
      pae.actor_name_snapshot LIKE ? OR
      pae.target_role_name_snapshot LIKE ? OR
      pae.permission_key_snapshot LIKE ? OR
      pae.event_type LIKE ? OR
      CONCAT_WS(' ', target_user.first_name, target_user.last_name) LIKE ? OR
      target_user.email LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await connection.query(
    `SELECT pae.permission_audit_event_id, pae.actor_user_id, pae.actor_name_snapshot, pae.event_type,
            pae.target_user_id, pae.target_role_id, pae.target_role_name_snapshot,
            pae.permission_key_snapshot, pae.before_state_json, pae.after_state_json, pae.created_at,
            target_user.first_name AS target_user_first_name,
            target_user.last_name AS target_user_last_name,
            target_user.email AS target_user_email
     FROM permission_audit_events pae
     LEFT JOIN users target_user ON target_user.user_id = pae.target_user_id
     ${whereClause}
     ORDER BY pae.created_at DESC, pae.permission_audit_event_id DESC
     LIMIT ? OFFSET ?`,
    [...params, safePageSize + 1, offset]
  );

  return {
    events: rows.slice(0, safePageSize).map(mapPermissionAuditRow),
    hasNext: rows.length > safePageSize,
    page: safePage,
    eventType: safeEventType,
    search: safeSearch
  };
}

async function getPermissionAuditEventById(eventId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT pae.permission_audit_event_id, pae.actor_user_id, pae.actor_name_snapshot, pae.event_type,
            pae.target_user_id, pae.target_role_id, pae.target_role_name_snapshot,
            pae.permission_key_snapshot, pae.before_state_json, pae.after_state_json, pae.created_at,
            target_user.first_name AS target_user_first_name,
            target_user.last_name AS target_user_last_name,
            target_user.email AS target_user_email
     FROM permission_audit_events pae
     LEFT JOIN users target_user ON target_user.user_id = pae.target_user_id
     WHERE pae.permission_audit_event_id = ?
     LIMIT 1`,
    [Number(eventId)]
  );
  return rows[0] ? mapPermissionAuditRow(rows[0]) : null;
}

module.exports = {
  createInternalRoleCode,
  withTransaction,
  listRoles,
  getRoleById,
  getRolePermissionKeys,
  listPermissionCatalog,
  assertPermissionKeysExist,
  createRole,
  updateRole,
  replaceRolePermissions,
  getRoleAssignedUsers,
  deleteRoleAssignments,
  addRolesToUsers,
  deleteRole,
  getUserById,
  getUserRoles,
  getRolesByIds,
  replaceUserRoles,
  countActiveSuperAdminUsers,
  getUserPermissionOverrides,
  setUserPermissionOverride,
  removeUserPermissionOverride,
  getUserPermissionOverride,
  isMigrationStateApplied,
  writeAuditEvent,
  listPermissionAuditEvents,
  getPermissionAuditEventById
};
