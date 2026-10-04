'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const permissionManagementModel = require('../models/permissionManagementModel');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');
const { isUserOnlyPermissionKey } = require('../services/permissionManagementPolicy');

async function main() {
  const connection = await pool.getConnection();
  try {
    const [roles, catalog] = await Promise.all([
      permissionManagementModel.listRoles(connection),
      permissionManagementModel.listPermissionCatalog(connection)
    ]);
    const superAdminRoles = roles.filter((role) => role.system_key === 'super_admin');
    if (superAdminRoles.length !== 1) {
      throw new Error(`Expected exactly one Super Admin role; found ${superAdminRoles.length}.`);
    }
    const superAdmin = superAdminRoles[0];
    if (!superAdmin.is_active) throw new Error('Super Admin role is inactive.');

    const superAdminPermissionKeys = await permissionManagementModel.getRolePermissionKeys(superAdmin.role_id, connection);
    const roleAssignablePermissionKeys = PERMISSION_KEYS.filter((key) => !isUserOnlyPermissionKey(key));
    const missingSuperAdminPermissions = roleAssignablePermissionKeys.filter((key) => !superAdminPermissionKeys.includes(key));
    if (missingSuperAdminPermissions.length > 0) {
      throw new Error(`Super Admin is missing permission(s): ${missingSuperAdminPermissions.join(', ')}`);
    }

    const activeSuperAdminUsers = await permissionManagementModel.countActiveSuperAdminUsers(connection);
    if (activeSuperAdminUsers < 1) throw new Error('No active user retains the Super Admin role.');

    const [[invalidOverrides]] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM user_permission_overrides
       WHERE effect NOT IN ('allow', 'deny')`
    );
    if (Number(invalidOverrides.count || 0) !== 0) throw new Error('Invalid user permission override effects exist.');

    const [auditProbe] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM permission_audit_events`
    );

    console.log('Permission-management service validation passed.');
    console.log(`Roles available to the management layer: ${roles.length}`);
    console.log(`Active permission catalog entries: ${catalog.length}`);
    console.log(`Super Admin permission grants: ${superAdminPermissionKeys.length}`);
    console.log(`Active Super Admin users: ${activeSuperAdminUsers}`);
    console.log(`Existing permission audit events: ${Number(auditProbe[0]?.count || 0)}`);
    console.log('No permission-management routes or UI are activated in this stage.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
