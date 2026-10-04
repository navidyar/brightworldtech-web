'use strict';

const { pool } = require('../models/db');
const permissionManagementService = require('../services/permissionManagementService');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');

async function main() {
  const actorPermissions = new Set(['users.view', 'roles.view']);
  const [[overrideSummary]] = await pool.query(
    `SELECT COUNT(*) AS override_count, COUNT(DISTINCT user_id) AS users_with_overrides
     FROM user_permission_overrides`
  );
  const [[superAdminOverrideSummary]] = await pool.query(
    `SELECT COUNT(*) AS override_count
     FROM user_permission_overrides upo
     INNER JOIN user_roles ur ON ur.user_id = upo.user_id
     INNER JOIN roles r ON r.role_id = ur.role_id
     WHERE r.system_key = 'super_admin'`
  );
  const [sampleUsers] = await pool.query(
    `SELECT u.user_id
     FROM users u
     WHERE EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id)
     ORDER BY u.is_active DESC, u.user_id
     LIMIT 1`
  );

  if (Number(superAdminOverrideSummary.override_count || 0) !== 0) {
    throw new Error('Super Admin users must not have user-level permission overrides.');
  }
  if (sampleUsers.length === 0) {
    throw new Error('At least one user with an assigned role is required for permission-state validation.');
  }

  const state = await permissionManagementService.getUserPermissionAdministrationState({
    actorPermissions,
    userId: sampleUsers[0].user_id
  });
  if (state.permissions.length !== PERMISSION_KEYS.length) {
    throw new Error(`Expected ${PERMISSION_KEYS.length} active permission entries, found ${state.permissions.length}.`);
  }
  if (!(state.effectivePermissions instanceof Set)) {
    throw new Error('Effective permission state must resolve to a Set.');
  }

  console.log('Per-user permission override UI validation passed.');
  console.log(`Active permission entries checked: ${state.permissions.length}`);
  console.log(`Sample user assigned roles: ${state.roles.length}`);
  console.log(`Sample user effective grants: ${state.effectivePermissions.size}`);
  console.log(`Stored user overrides: ${Number(overrideSummary.override_count || 0)}`);
  console.log(`Users currently holding overrides: ${Number(overrideSummary.users_with_overrides || 0)}`);
  console.log('Super Admin user-level overrides: 0');
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
