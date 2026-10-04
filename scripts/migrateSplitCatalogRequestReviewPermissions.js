'use strict';

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const LEGACY_KEY = 'catalog_requests.admin_review';
const NEW_KEYS = ['catalog_requests.model.review', 'catalog_requests.processor.review'];

async function getPermission(connection, key) {
  const [[row]] = await connection.query('SELECT permission_id, permission_key, is_active FROM permissions WHERE permission_key = ? LIMIT 1', [key]);
  return row || null;
}

async function upsertPermission(connection, definition, sortOrder) {
  await connection.query(
    `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE permission_group=VALUES(permission_group), name=VALUES(name), description=VALUES(description), is_active=1`,
    [definition.permissionKey, definition.group, definition.name, definition.description, sortOrder]
  );
  return getPermission(connection, definition.permissionKey);
}

async function inspect(connection) {
  const legacy = await getPermission(connection, LEGACY_KEY);
  const next = [];
  for (const key of NEW_KEYS) next.push(await getPermission(connection, key));
  const [legacyRoles] = legacy ? await connection.query(
    'SELECT role_id FROM role_permissions WHERE permission_id = ? ORDER BY role_id', [legacy.permission_id]
  ) : [[]];
  const [legacyOverrides] = legacy ? await connection.query(
    `SELECT user_id, effect, created_by_user_id, updated_by_user_id
     FROM user_permission_overrides WHERE permission_id = ? ORDER BY user_id`, [legacy.permission_id]
  ) : [[]];
  return { legacy, next, legacyRoles, legacyOverrides };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`Split Catalog Request review permissions (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Legacy ${LEGACY_KEY}: ${before.legacy ? `present active=${before.legacy.is_active}` : 'missing'}`);
    console.log(`Legacy role grants to preserve: ${before.legacyRoles.length}`);
    console.log(`Legacy user overrides to preserve: ${before.legacyOverrides.length}`);
    console.log(`New permissions present: ${before.next.filter(Boolean).length}/${NEW_KEYS.length}`);
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
      let sortOrder = Number(sortRow.max_sort || 0) + 10;
      const newPermissions = [];
      for (const key of NEW_KEYS) {
        const definition = PERMISSIONS.find((item) => item.permissionKey === key);
        if (!definition) throw new Error(`Missing ${key} from permission catalog.`);
        newPermissions.push(await upsertPermission(connection, definition, sortOrder));
        sortOrder += 10;
      }

      if (before.legacy) {
        for (const permission of newPermissions) {
          for (const grant of before.legacyRoles) {
            await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [grant.role_id, permission.permission_id]);
          }
          for (const override of before.legacyOverrides) {
            await connection.query(
              `INSERT INTO user_permission_overrides (user_id, permission_id, effect, created_by_user_id, updated_by_user_id)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE effect=VALUES(effect), updated_by_user_id=VALUES(updated_by_user_id)`,
              [override.user_id, permission.permission_id, override.effect, override.created_by_user_id, override.updated_by_user_id]
            );
          }
        }
        await connection.query('UPDATE permissions SET is_active = 0 WHERE permission_id = ?', [before.legacy.permission_id]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    for (const row of after.next) {
      if (!row || Number(row.is_active) !== 1) throw new Error('New catalog review permission verification failed.');
    }
    if (after.legacy && Number(after.legacy.is_active) !== 0) throw new Error('Legacy broad catalog approval permission is still active.');
    console.log('Migration applied and verified.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
