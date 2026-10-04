'use strict';
require('dotenv').config();

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const PERMISSION_KEY = 'dashboards.productivity.count';

async function getPermission(connection) {
  const [[row]] = await connection.query(
    'SELECT permission_id, permission_key, name, is_active FROM permissions WHERE permission_key = ? LIMIT 1',
    [PERMISSION_KEY]
  );
  return row || null;
}

async function getHistoricalContributorIds(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'unit_work_completions'`
  );
  const names = new Set(columns.map((row) => row.COLUMN_NAME));
  if (!names.has('completed_by_user_id')) return [];
  const creditFilter = names.has('grants_production_credit') ? 'AND grants_production_credit = 1' : '';
  const reversedFilter = names.has('reversed_at') ? 'AND reversed_at IS NULL' : '';
  const [rows] = await connection.query(
    `SELECT DISTINCT completed_by_user_id AS user_id
     FROM unit_work_completions
     WHERE completed_by_user_id IS NOT NULL
       ${creditFilter}
       ${reversedFilter}
     ORDER BY completed_by_user_id`
  );
  return rows.map((row) => Number(row.user_id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function inspect(connection) {
  const permission = await getPermission(connection);
  const contributors = await getHistoricalContributorIds(connection);
  let allowed = [];
  let roleGrants = [];
  if (permission) {
    const [overrides] = await connection.query(
      `SELECT user_id, effect
       FROM user_permission_overrides
       WHERE permission_id = ?
       ORDER BY user_id`,
      [permission.permission_id]
    );
    allowed = overrides.filter((row) => row.effect === 'allow').map((row) => Number(row.user_id));
    const [roles] = await connection.query(
      `SELECT r.code
       FROM role_permissions rp
       INNER JOIN roles r ON r.role_id = rp.role_id
       WHERE rp.permission_id = ?
       ORDER BY r.role_id`,
      [permission.permission_id]
    );
    roleGrants = roles.map((row) => row.code);
  }
  return { permission, contributors, allowed, roleGrants };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`Productivity metrics eligibility permission (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Permission row: ${before.permission ? 'present' : 'missing'}`);
    console.log(`Historical production-credit contributors: ${before.contributors.length}`);
    console.log(`Existing user allows: ${before.allowed.length}`);
    console.log(`Role grants: ${before.roleGrants.join(', ') || 'none'}`);
    if (!APPLY) return;

    const shouldSeedHistoricalContributors = !before.permission;
    const definition = PERMISSIONS.find((item) => item.permissionKey === PERMISSION_KEY);
    if (!definition) throw new Error(`${PERMISSION_KEY} is missing from permissionCatalog.`);

    await connection.beginTransaction();
    try {
      const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
      await connection.query(
        `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE permission_group=VALUES(permission_group), name=VALUES(name), description=VALUES(description), is_active=1`,
        [definition.permissionKey, definition.group, definition.name, definition.description, Number(sortRow.max_sort || 0) + 10]
      );
      const permission = await getPermission(connection);
      if (!permission) throw new Error('Failed to create productivity metrics permission.');

      if (shouldSeedHistoricalContributors) {
        for (const userId of before.contributors) {
          await connection.query(
            `INSERT IGNORE INTO user_permission_overrides (user_id, permission_id, effect)
             VALUES (?, ?, 'allow')`,
            [userId, permission.permission_id]
          );
        }
      }

      const [roleGrants] = await connection.query(
        `SELECT rp.role_id, r.name
         FROM role_permissions rp
         INNER JOIN roles r ON r.role_id = rp.role_id
         WHERE rp.permission_id = ?`,
        [permission.permission_id]
      );
      for (const grant of roleGrants) {
        await connection.query(
          'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
          [grant.role_id, permission.permission_id]
        );
        await connection.query(
          `INSERT INTO permission_audit_events (
             actor_user_id, actor_name_snapshot, event_type,
             target_role_id, target_role_name_snapshot, permission_key_snapshot,
             before_state_json, after_state_json
           ) VALUES (NULL, 'System', 'role_permission_user_only_corrected', ?, ?, ?,
             JSON_OBJECT('granted', TRUE),
             JSON_OBJECT('granted', FALSE, 'reason', 'user_only_permission'))`,
          [grant.role_id, grant.name, PERMISSION_KEY]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    if (!after.permission || Number(after.permission.is_active) !== 1) throw new Error('Permission verification failed.');
    if (after.roleGrants.length !== 0) throw new Error('Productivity eligibility must not have automatic role grants.');
    if (shouldSeedHistoricalContributors) {
      const allowedSet = new Set(after.allowed);
      const missing = after.contributors.filter((userId) => !allowedSet.has(userId));
      if (missing.length) throw new Error(`Historical contributor allows missing for: ${missing.join(', ')}`);
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
