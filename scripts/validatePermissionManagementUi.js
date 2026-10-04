'use strict';

const permissionManagementService = require('../services/permissionManagementService');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');

async function main() {
  const actorPermissions = new Set(['roles.view']);
  const [roles, catalog] = await Promise.all([
    permissionManagementService.listRoles({ actorPermissions }),
    permissionManagementService.listPermissionCatalog({ actorPermissions })
  ]);

  if (catalog.length !== PERMISSION_KEYS.length) {
    throw new Error(`Permission catalog count mismatch: expected ${PERMISSION_KEYS.length}, found ${catalog.length}.`);
  }
  if (!roles.some((role) => role.system_key === 'super_admin')) {
    throw new Error('Permanent Super Admin role is missing from the role administration dataset.');
  }
  if (!catalog.some((permission) => permission.permission_key === 'security.super_admin.manage')) {
    throw new Error('security.super_admin.manage is missing from the permission catalog.');
  }
  for (const role of roles) {
    if (!Array.isArray(role.permissionKeys)) throw new Error(`Role #${role.role_id} is missing its permission key list.`);
    if (!Number.isFinite(Number(role.assignment_count))) throw new Error(`Role #${role.role_id} is missing assignment_count.`);
    if (!Number.isFinite(Number(role.permission_count))) throw new Error(`Role #${role.role_id} is missing permission_count.`);
  }

  const groups = new Set(catalog.map((permission) => permission.permission_group));
  console.log('Roles & Permissions administration UI validation passed.');
  console.log(`Roles available: ${roles.length}`);
  console.log(`Permission catalog entries: ${catalog.length}`);
  console.log(`Permission groups: ${groups.size}`);
  console.log(`Assigned-user references across roles: ${roles.reduce((sum, role) => sum + Number(role.assignment_count || 0), 0)}`);
  console.log('Legacy route/feature gates remain authoritative outside this new administration surface.');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
