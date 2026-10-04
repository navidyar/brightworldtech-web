'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return Boolean(rows[0]);
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return Boolean(rows[0]);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const requiredTables = [
      'permissions',
      'role_permissions',
      'user_permission_overrides',
      'permission_audit_events',
      'authorization_migration_state'
    ];
    for (const tableName of requiredTables) {
      if (!await tableExists(connection, tableName)) throw new Error(`Missing permission foundation table: ${tableName}`);
    }
    if (!await columnExists(connection, 'roles', 'system_key')) throw new Error('roles.system_key is missing.');

    const [permissionRows] = await connection.query(
      `SELECT permission_id, permission_key, is_active
       FROM permissions`
    );
    const activePermissionKeys = new Set(
      permissionRows.filter((row) => Number(row.is_active) === 1).map((row) => row.permission_key)
    );
    const missingCatalogKeys = PERMISSION_KEYS.filter((permissionKey) => !activePermissionKeys.has(permissionKey));
    if (missingCatalogKeys.length > 0) {
      throw new Error(`Missing active permission catalog keys: ${missingCatalogKeys.join(', ')}`);
    }

    const [[superAdminRole]] = await connection.query(
      `SELECT role_id, code, name, is_active
       FROM roles
       WHERE system_key = 'super_admin'
       LIMIT 1`
    );
    if (!superAdminRole || Number(superAdminRole.is_active) !== 1) {
      throw new Error('Active Super Admin role identity is missing.');
    }

    const [[superAdminUsers]] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM user_roles ur
       INNER JOIN users u ON u.user_id = ur.user_id
       WHERE ur.role_id = ?
         AND u.is_active = 1`,
      [superAdminRole.role_id]
    );
    if (Number(superAdminUsers.count || 0) < 1) {
      throw new Error('No active user currently holds the Super Admin role.');
    }

    const [[roleGrantCount]] = await connection.query('SELECT COUNT(*) AS count FROM role_permissions');
    const [[overrideCount]] = await connection.query('SELECT COUNT(*) AS count FROM user_permission_overrides');
    const [[invalidOverrideCount]] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM user_permission_overrides
       WHERE effect NOT IN ('allow', 'deny')`
    );
    if (Number(invalidOverrideCount.count || 0) !== 0) {
      throw new Error('Invalid user permission override effects are present.');
    }

    const [[bootstrap]] = await connection.query(
      `SELECT migration_key, applied_at
       FROM authorization_migration_state
       WHERE migration_key = 'permission_foundation_v1_role_defaults'
       LIMIT 1`
    );
    if (!bootstrap) throw new Error('Permission compatibility bootstrap marker is missing.');

    console.log('Permission foundation validation passed.');
    console.log(`Catalog permissions: ${PERMISSION_KEYS.length}`);
    console.log(`Role permission grants: ${Number(roleGrantCount.count || 0)}`);
    console.log(`User overrides: ${Number(overrideCount.count || 0)}`);
    console.log(`Super Admin role: #${Number(superAdminRole.role_id)} ${superAdminRole.name}`);
    console.log(`Active Super Admin users: ${Number(superAdminUsers.count || 0)}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
