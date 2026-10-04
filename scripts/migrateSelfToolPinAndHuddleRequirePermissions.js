'use strict';
require('dotenv').config();

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const PERMISSION_KEYS = ['users.tool_pin.self_manage', 'huddle.recipients.require'];

async function inspect(connection) {
  const [rows] = await connection.query(
    `SELECT permission_id, permission_key, name, is_active
     FROM permissions
     WHERE permission_key IN (?)
     ORDER BY permission_key`,
    [PERMISSION_KEYS]
  );
  const [[superAdmin]] = await connection.query(
    `SELECT role_id, code, name
     FROM roles
     WHERE system_key = 'super_admin' OR code = 'super_admin'
     ORDER BY (system_key = 'super_admin') DESC, role_id
     LIMIT 1`
  );
  let superAdminGrants = [];
  if (superAdmin) {
    const [grants] = await connection.query(
      `SELECT p.permission_key
       FROM role_permissions rp
       INNER JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE rp.role_id = ? AND p.permission_key IN (?)
       ORDER BY p.permission_key`,
      [superAdmin.role_id, PERMISSION_KEYS]
    );
    superAdminGrants = grants.map((row) => row.permission_key);
  }
  return { rows, superAdmin, superAdminGrants };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`Self Tool PIN + Huddle Require permissions (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Catalog rows present: ${before.rows.length}/${PERMISSION_KEYS.length}`);
    console.log(`Super Admin grants present: ${before.superAdminGrants.length}/${PERMISSION_KEYS.length}`);
    console.log('Ordinary role grants are intentionally not created by this migration.');
    if (!APPLY) return;

    if (!before.superAdmin) throw new Error('Super Admin role could not be found.');

    await connection.beginTransaction();
    try {
      const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
      let sortOrder = Number(sortRow.max_sort || 0) + 10;
      for (const permissionKey of PERMISSION_KEYS) {
        const definition = PERMISSIONS.find((item) => item.permissionKey === permissionKey);
        if (!definition) throw new Error(`Missing ${permissionKey} from permission catalog.`);
        await connection.query(
          `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE permission_group=VALUES(permission_group), name=VALUES(name), description=VALUES(description), is_active=1`,
          [definition.permissionKey, definition.group, definition.name, definition.description, sortOrder]
        );
        sortOrder += 10;
      }

      for (const permissionKey of PERMISSION_KEYS) {
        await connection.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id)
           SELECT ?, permission_id FROM permissions WHERE permission_key = ? AND is_active = 1`,
          [before.superAdmin.role_id, permissionKey]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    if (after.rows.length !== PERMISSION_KEYS.length || after.rows.some((row) => Number(row.is_active) !== 1)) {
      throw new Error('Permission catalog verification failed.');
    }
    if (after.superAdminGrants.length !== PERMISSION_KEYS.length) {
      throw new Error('Super Admin grant verification failed.');
    }
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
