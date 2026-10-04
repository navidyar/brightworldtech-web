'use strict';

const { pool } = require('./db');
const { resolveEffectivePermissions } = require('../services/permissionResolver');

async function getAssignedRoles(userId, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        r.role_id,
        r.code,
        r.name,
        r.system_key,
        r.is_active
      FROM user_roles ur
      INNER JOIN roles r
        ON r.role_id = ur.role_id
      WHERE ur.user_id = ?
        AND r.is_active = 1
      ORDER BY r.name, r.role_id
    `,
    [Number(userId)]
  );

  return rows;
}

async function getRolePermissionKeysForUser(userId, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT DISTINCT p.permission_key
      FROM user_roles ur
      INNER JOIN roles r
        ON r.role_id = ur.role_id
       AND r.is_active = 1
      INNER JOIN role_permissions rp
        ON rp.role_id = r.role_id
      INNER JOIN permissions p
        ON p.permission_id = rp.permission_id
       AND p.is_active = 1
      WHERE ur.user_id = ?
      ORDER BY p.permission_key
    `,
    [Number(userId)]
  );

  return rows.map((row) => row.permission_key);
}

async function getUserPermissionOverrides(userId, connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        p.permission_key,
        upo.effect
      FROM user_permission_overrides upo
      INNER JOIN permissions p
        ON p.permission_id = upo.permission_id
       AND p.is_active = 1
      WHERE upo.user_id = ?
      ORDER BY p.permission_key
    `,
    [Number(userId)]
  );

  return rows;
}

async function getUserPermissionContext(userId, connection = pool) {
  const [roles, rolePermissionKeys, userOverrides] = await Promise.all([
    getAssignedRoles(userId, connection),
    getRolePermissionKeysForUser(userId, connection),
    getUserPermissionOverrides(userId, connection)
  ]);

  return {
    roles,
    rolePermissionKeys,
    userOverrides,
    effectivePermissions: resolveEffectivePermissions({ rolePermissionKeys, userOverrides })
  };
}

module.exports = {
  getAssignedRoles,
  getRolePermissionKeysForUser,
  getUserPermissionOverrides,
  getUserPermissionContext
};
