'use strict';

const { pool } = require('../models/db');
const permissionManagementService = require('../services/permissionManagementService');

async function main() {
  const actorPermissions = new Set(['roles.view']);
  const roles = await permissionManagementService.listRoles({ actorPermissions });
  const superAdminRole = roles.find((role) => role.system_key === 'super_admin');
  if (!superAdminRole) throw new Error('Permanent Super Admin role is missing.');

  const [[assignmentSummary]] = await pool.query(
    `SELECT
       COUNT(*) AS assignment_count,
       COUNT(DISTINCT user_id) AS users_with_roles
     FROM user_roles`
  );
  const [[multiRoleSummary]] = await pool.query(
    `SELECT COUNT(*) AS multi_role_users
     FROM (
       SELECT user_id
       FROM user_roles
       GROUP BY user_id
       HAVING COUNT(*) > 1
     ) multi_role_users`
  );
  const [[superAdminSummary]] = await pool.query(
    `SELECT COUNT(DISTINCT u.user_id) AS active_super_admin_users
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.user_id
     INNER JOIN roles r ON r.role_id = ur.role_id
     WHERE u.is_active = 1
       AND r.system_key = 'super_admin'`
  );

  const activeSuperAdminUsers = Number(superAdminSummary.active_super_admin_users || 0);
  if (activeSuperAdminUsers < 1) {
    throw new Error('At least one active Super Admin user is required.');
  }

  console.log('Role workspace and multi-role user administration validation passed.');
  console.log(`Roles available: ${roles.length}`);
  console.log(`Active roles: ${roles.filter((role) => role.is_active).length}`);
  console.log(`User-role assignments: ${Number(assignmentSummary.assignment_count || 0)}`);
  console.log(`Users with assigned roles: ${Number(assignmentSummary.users_with_roles || 0)}`);
  console.log(`Users currently holding multiple roles: ${Number(multiRoleSummary.multi_role_users || 0)}`);
  console.log(`Active Super Admin users: ${activeSuperAdminUsers}`);
  console.log('Legacy application authorization gates remain authoritative in this stage.');
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
