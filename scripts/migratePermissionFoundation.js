'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { PERMISSIONS, PERMISSION_KEYS } = require('../config/permissionCatalog');
const { PROTECTED_ADMIN_USER_ID } = require('../config/protectedAdmin');

const APPLY = process.argv.includes('--apply');
const BOOTSTRAP_KEY = 'permission_foundation_v1_role_defaults';
const SUPER_ADMIN_SYSTEM_KEY = 'super_admin';
const SUPER_ADMIN_CODE = 'super_admin';

const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

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

async function getColumnType(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0] ? String(rows[0].column_type) : null;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return Boolean(rows[0]);
}

async function getRoleByCode(connection, roleCode) {
  const [rows] = await connection.query(
    `SELECT role_id, code, name, is_active${await columnExists(connection, 'roles', 'system_key') ? ', system_key' : ''}
     FROM roles
     WHERE code = ?
     LIMIT 1`,
    [roleCode]
  );
  return rows[0] || null;
}

async function getSuperAdminRole(connection) {
  if (!await columnExists(connection, 'roles', 'system_key')) return null;
  const [rows] = await connection.query(
    `SELECT role_id, code, name, system_key, is_active
     FROM roles
     WHERE system_key = ?
     LIMIT 2`,
    [SUPER_ADMIN_SYSTEM_KEY]
  );
  if (rows.length > 1) throw new Error('Multiple roles are marked as Super Admin. Resolve the duplicate system identity first.');
  return rows[0] || null;
}

async function getBootstrapApplied(connection) {
  if (!await tableExists(connection, 'authorization_migration_state')) return false;
  const [rows] = await connection.query(
    `SELECT 1
     FROM authorization_migration_state
     WHERE migration_key = ?
     LIMIT 1`,
    [BOOTSTRAP_KEY]
  );
  return Boolean(rows[0]);
}

async function inspect(connection) {
  const requiredBaseTables = ['users', 'roles', 'user_roles'];
  const blockingIssues = [];
  const plannedChanges = [];

  for (const tableName of requiredBaseTables) {
    if (!await tableExists(connection, tableName)) blockingIssues.push(`Missing required table: ${tableName}`);
  }

  if (blockingIssues.length > 0) return { blockingIssues, plannedChanges };

  const roleIdType = await getColumnType(connection, 'roles', 'role_id');
  const userIdType = await getColumnType(connection, 'users', 'user_id');
  if (!roleIdType) blockingIssues.push('roles.role_id is missing.');
  if (!userIdType) blockingIssues.push('users.user_id is missing.');

  const hasSystemKey = await columnExists(connection, 'roles', 'system_key');
  if (!hasSystemKey) plannedChanges.push('add roles.system_key');
  else if (!await indexExists(connection, 'roles', 'uq_roles_system_key')) plannedChanges.push('add unique roles.system_key index');

  const foundationTables = [
    'permissions',
    'role_permissions',
    'user_permission_overrides',
    'permission_audit_events',
    'authorization_migration_state'
  ];
  for (const tableName of foundationTables) {
    if (!await tableExists(connection, tableName)) plannedChanges.push(`create ${tableName}`);
  }

  const standardRoleCodes = ['admin', 'management', 'tech_lead', 'qc', 'tech'];
  const missingLegacyRoles = [];
  for (const roleCode of standardRoleCodes) {
    if (!await getRoleByCode(connection, roleCode)) missingLegacyRoles.push(roleCode);
  }
  if (missingLegacyRoles.length > 0) {
    blockingIssues.push(`Missing existing role(s) required for compatibility bootstrap: ${missingLegacyRoles.join(', ')}`);
  }

  const [[protectedUser]] = await connection.query(
    `SELECT user_id, is_active
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [PROTECTED_ADMIN_USER_ID]
  );
  if (!protectedUser) {
    blockingIssues.push(`Protected Admin user #${PROTECTED_ADMIN_USER_ID} is missing; cannot establish the initial Super Admin assignment.`);
  }

  const superAdminRole = hasSystemKey ? await getSuperAdminRole(connection) : null;
  if (!superAdminRole) plannedChanges.push('create protected Super Admin role identity');

  const bootstrapApplied = await getBootstrapApplied(connection);
  if (!bootstrapApplied) plannedChanges.push('seed current roles with compatibility permission defaults');

  if (await tableExists(connection, 'permissions')) {
    const [rows] = await connection.query('SELECT permission_key FROM permissions WHERE is_active = 1');
    const existing = new Set(rows.map((row) => row.permission_key));
    const missingCatalogPermissions = PERMISSION_KEYS.filter((permissionKey) => !existing.has(permissionKey));
    if (missingCatalogPermissions.length > 0) plannedChanges.push(`seed ${missingCatalogPermissions.length} missing permission catalog entr${missingCatalogPermissions.length === 1 ? 'y' : 'ies'}`);
  } else {
    plannedChanges.push(`seed ${PERMISSION_KEYS.length} permission catalog entries`);
  }

  return {
    blockingIssues,
    plannedChanges,
    roleIdType,
    userIdType,
    bootstrapApplied,
    superAdminRole,
    protectedUser
  };
}

function printReport(report, mode) {
  console.log(`\nPermission foundation migration (${mode})`);
  console.log(`Permission catalog entries: ${PERMISSION_KEYS.length}`);
  console.log('Role default state: granted / not granted (no role-level DENY state)');
  console.log('User override state: allow / deny; absence means inherit role defaults');

  if (report.blockingIssues.length > 0) {
    console.log('\nBlocking issues:');
    report.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (report.plannedChanges.length > 0) {
    console.log('\nPlanned changes:');
    report.plannedChanges.forEach((change) => console.log(`- ${change}`));
  } else if (report.blockingIssues.length === 0) {
    console.log('\nPermission foundation already satisfies the current schema/catalog policy.');
  }

  if (!APPLY && report.blockingIssues.length === 0 && report.plannedChanges.length > 0) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function ensureRoleSystemKey(connection) {
  if (!await columnExists(connection, 'roles', 'system_key')) {
    await connection.query('ALTER TABLE roles ADD COLUMN system_key VARCHAR(100) NULL AFTER code');
  }
  if (!await indexExists(connection, 'roles', 'uq_roles_system_key')) {
    await connection.query('ALTER TABLE roles ADD UNIQUE KEY uq_roles_system_key (system_key)');
  }
}

async function ensureFoundationTables(connection, roleIdType, userIdType) {
  const safeRoleIdType = String(roleIdType);
  const safeUserIdType = String(userIdType);

  await connection.query(
    `CREATE TABLE IF NOT EXISTS permissions (
       permission_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       permission_key VARCHAR(150) NOT NULL,
       permission_group VARCHAR(100) NOT NULL,
       name VARCHAR(150) NOT NULL,
       description VARCHAR(500) NOT NULL,
       sort_order INT NOT NULL DEFAULT 0,
       is_active TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (permission_id),
       UNIQUE KEY uq_permissions_permission_key (permission_key),
       KEY idx_permissions_group_sort (permission_group, sort_order, permission_id)
     ) ENGINE=InnoDB`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS role_permissions (
       role_id ${safeRoleIdType} NOT NULL,
       permission_id INT UNSIGNED NOT NULL,
       granted_by_user_id ${safeUserIdType} NULL,
       granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (role_id, permission_id),
       KEY idx_role_permissions_permission (permission_id, role_id),
       CONSTRAINT fk_role_permissions_role
         FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
       CONSTRAINT fk_role_permissions_permission
         FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
       CONSTRAINT fk_role_permissions_granted_by
         FOREIGN KEY (granted_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL
     ) ENGINE=InnoDB`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS user_permission_overrides (
       user_id ${safeUserIdType} NOT NULL,
       permission_id INT UNSIGNED NOT NULL,
       effect ENUM('allow', 'deny') NOT NULL,
       created_by_user_id ${safeUserIdType} NULL,
       updated_by_user_id ${safeUserIdType} NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (user_id, permission_id),
       KEY idx_user_permission_overrides_permission (permission_id, user_id),
       CONSTRAINT fk_user_permission_overrides_user
         FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
       CONSTRAINT fk_user_permission_overrides_permission
         FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
       CONSTRAINT fk_user_permission_overrides_created_by
         FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
       CONSTRAINT fk_user_permission_overrides_updated_by
         FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL
     ) ENGINE=InnoDB`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS permission_audit_events (
       permission_audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       actor_user_id ${safeUserIdType} NULL,
       actor_name_snapshot VARCHAR(255) NULL,
       event_type VARCHAR(100) NOT NULL,
       target_user_id ${safeUserIdType} NULL,
       target_role_id ${safeRoleIdType} NULL,
       target_role_name_snapshot VARCHAR(150) NULL,
       permission_key_snapshot VARCHAR(150) NULL,
       before_state_json JSON NULL,
       after_state_json JSON NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (permission_audit_event_id),
       KEY idx_permission_audit_created (created_at, permission_audit_event_id),
       KEY idx_permission_audit_actor (actor_user_id, created_at),
       KEY idx_permission_audit_target_user (target_user_id, created_at),
       KEY idx_permission_audit_target_role (target_role_id, created_at),
       KEY idx_permission_audit_permission (permission_key_snapshot, created_at)
     ) ENGINE=InnoDB`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS authorization_migration_state (
       migration_key VARCHAR(150) NOT NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (migration_key)
     ) ENGINE=InnoDB`
  );
}

async function seedPermissionCatalog(connection) {
  let sortOrder = 0;
  for (const definition of PERMISSIONS) {
    sortOrder += 10;
    await connection.query(
      `INSERT INTO permissions (
         permission_key,
         permission_group,
         name,
         description,
         sort_order,
         is_active
       )
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         permission_group = VALUES(permission_group),
         name = VALUES(name),
         description = VALUES(description),
         sort_order = VALUES(sort_order),
         is_active = 1`,
      [
        definition.permissionKey,
        definition.group,
        definition.name,
        definition.description,
        sortOrder
      ]
    );
  }
}

async function ensureSuperAdminRole(connection) {
  let role = await getSuperAdminRole(connection);
  if (role) {
    if (Number(role.is_active) !== 1) {
      await connection.query('UPDATE roles SET is_active = 1 WHERE role_id = ?', [role.role_id]);
    }
    return Number(role.role_id);
  }

  const existingCodeRole = await getRoleByCode(connection, SUPER_ADMIN_CODE);
  if (existingCodeRole) {
    await connection.query(
      `UPDATE roles
       SET system_key = ?, is_active = 1
       WHERE role_id = ?`,
      [SUPER_ADMIN_SYSTEM_KEY, existingCodeRole.role_id]
    );
    return Number(existingCodeRole.role_id);
  }

  const [result] = await connection.query(
    `INSERT INTO roles (code, system_key, name, description, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [
      SUPER_ADMIN_CODE,
      SUPER_ADMIN_SYSTEM_KEY,
      'Super Admin',
      'Permanent security-administration role. Ordinary roles remain fully renameable, configurable, and removable.'
    ]
  );

  return Number(result.insertId);
}

async function grantRolePermissions(connection, roleId, permissionKeys) {
  for (const permissionKey of permissionKeys) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id)
       SELECT ?, p.permission_id
       FROM permissions p
       WHERE p.permission_key = ?
         AND p.is_active = 1`,
      [roleId, permissionKey]
    );
    if (Number(result.affectedRows || 0) === 0) {
      const [[permission]] = await connection.query(
        'SELECT permission_id FROM permissions WHERE permission_key = ? LIMIT 1',
        [permissionKey]
      );
      if (!permission) throw new Error(`Missing permission catalog entry during bootstrap: ${permissionKey}`);
    }
  }
}

async function bootstrapLegacyRoleDefaults(connection, superAdminRoleId) {
  if (await getBootstrapApplied(connection)) return false;

  const roleIds = { super_admin: superAdminRoleId };
  for (const roleCode of ['admin', 'management', 'tech_lead', 'qc', 'tech']) {
    const role = await getRoleByCode(connection, roleCode);
    if (!role) throw new Error(`Missing role required for compatibility bootstrap: ${roleCode}`);
    roleIds[roleCode] = Number(role.role_id);
  }

  for (const [roleCode, permissionKeys] of Object.entries(LEGACY_ROLE_GRANTS)) {
    await grantRolePermissions(connection, roleIds[roleCode], permissionKeys);
  }

  await connection.query(
    `INSERT IGNORE INTO user_roles (user_id, role_id)
     VALUES (?, ?)`,
    [PROTECTED_ADMIN_USER_ID, superAdminRoleId]
  );

  await connection.query(
    `INSERT INTO authorization_migration_state (migration_key)
     VALUES (?)`,
    [BOOTSTRAP_KEY]
  );

  return true;
}

async function verifyAppliedFoundation(connection) {
  const requiredTables = [
    'permissions',
    'role_permissions',
    'user_permission_overrides',
    'permission_audit_events',
    'authorization_migration_state'
  ];
  for (const tableName of requiredTables) {
    if (!await tableExists(connection, tableName)) throw new Error(`Verification failed: ${tableName} is missing.`);
  }
  if (!await columnExists(connection, 'roles', 'system_key')) throw new Error('Verification failed: roles.system_key is missing.');

  const [permissionRows] = await connection.query(
    `SELECT permission_key
     FROM permissions
     WHERE is_active = 1`
  );
  const activeKeys = new Set(permissionRows.map((row) => row.permission_key));
  const missingKeys = PERMISSION_KEYS.filter((permissionKey) => !activeKeys.has(permissionKey));
  if (missingKeys.length > 0) throw new Error(`Verification failed: missing permission keys: ${missingKeys.join(', ')}`);

  const superAdminRole = await getSuperAdminRole(connection);
  if (!superAdminRole || Number(superAdminRole.is_active) !== 1) throw new Error('Verification failed: active Super Admin role is missing.');

  const [[activeSuperAdmins]] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM user_roles ur
     INNER JOIN users u ON u.user_id = ur.user_id
     WHERE ur.role_id = ?
       AND u.is_active = 1`,
    [superAdminRole.role_id]
  );
  if (Number(activeSuperAdmins.count || 0) < 1) throw new Error('Verification failed: at least one active user must hold Super Admin.');

  if (!await getBootstrapApplied(connection)) throw new Error('Verification failed: compatibility role-default bootstrap marker is missing.');

  return {
    permissionCount: activeKeys.size,
    superAdminRoleId: Number(superAdminRole.role_id),
    activeSuperAdminCount: Number(activeSuperAdmins.count || 0)
  };
}

async function applyMigration(connection, preflight) {
  if (preflight.blockingIssues.length > 0) {
    throw new Error('Refusing to apply while blocking issues remain.');
  }

  await ensureRoleSystemKey(connection);
  await ensureFoundationTables(connection, preflight.roleIdType, preflight.userIdType);
  await seedPermissionCatalog(connection);
  const superAdminRoleId = await ensureSuperAdminRole(connection);
  await bootstrapLegacyRoleDefaults(connection, superAdminRoleId);

  return verifyAppliedFoundation(connection);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const report = await inspect(connection);
    printReport(report, APPLY ? 'preflight' : 'audit');

    if (report.blockingIssues.length > 0) {
      process.exitCode = 1;
      return;
    }
    if (!APPLY) return;

    const verified = await applyMigration(connection, report);
    console.log('\nPermission foundation migration completed successfully.');
    console.log(`Active catalog permissions: ${verified.permissionCount}`);
    console.log(`Super Admin role ID: ${verified.superAdminRoleId}`);
    console.log(`Active Super Admin users: ${verified.activeSuperAdminCount}`);
    console.log('Existing route/controller authorization remains role-based until later migration stages.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
