'use strict';

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const PERMISSION_KEY = 'huddle.personal.view';
const LEGACY_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'qc', 'tech']);

async function inspect(connection) {
  const definition = PERMISSIONS.find((item) => item.permissionKey === PERMISSION_KEY);
  if (!definition) throw new Error(`${PERMISSION_KEY} is missing from config/permissionCatalog.js.`);

  const [roles] = await connection.query(
    `SELECT role_id, code, name, is_active
     FROM roles
     WHERE code IN (?)
     ORDER BY role_id`,
    [LEGACY_ROLE_CODES]
  );
  const found = new Set(roles.map((role) => role.code));
  const missingRoles = LEGACY_ROLE_CODES.filter((code) => !found.has(code));
  if (missingRoles.length > 0) {
    throw new Error(`Missing compatibility role(s): ${missingRoles.join(', ')}`);
  }

  const [[permission]] = await connection.query(
    `SELECT permission_id, permission_key, is_active
     FROM permissions
     WHERE permission_key = ?
     LIMIT 1`,
    [PERMISSION_KEY]
  );

  let grantedRoleCodes = [];
  if (permission) {
    const [grants] = await connection.query(
      `SELECT r.code
       FROM role_permissions rp
       INNER JOIN roles r ON r.role_id = rp.role_id
       WHERE rp.permission_id = ?
         AND r.code IN (?)
       ORDER BY r.role_id`,
      [permission.permission_id, LEGACY_ROLE_CODES]
    );
    grantedRoleCodes = grants.map((row) => row.code);
  }

  return { definition, permission, roles, grantedRoleCodes };
}

function printReport(state) {
  const granted = new Set(state.grantedRoleCodes);
  const missingGrants = LEGACY_ROLE_CODES.filter((code) => !granted.has(code));
  console.log(`Huddle personal-view compatibility migration (${APPLY ? 'apply' : 'audit'})`);
  console.log(`Permission: ${PERMISSION_KEY}`);
  console.log(`Catalog row: ${state.permission ? 'present' : 'missing'}`);
  console.log(`Compatibility grants present: ${state.grantedRoleCodes.length}/${LEGACY_ROLE_CODES.length}`);
  if (!state.permission) console.log('- seed permission catalog row');
  missingGrants.forEach((code) => console.log(`- grant ${PERMISSION_KEY} to compatibility role ${code}`));
  if (state.permission && missingGrants.length === 0) console.log('No changes required.');
  if (!APPLY && (!state.permission || missingGrants.length > 0)) {
    console.log('No database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function applyMigration(connection, state) {
  const definition = state.definition;
  const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
  const nextSort = Number(sortRow.max_sort || 0) + 10;
  await connection.query(
    `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       permission_group = VALUES(permission_group),
       name = VALUES(name),
       description = VALUES(description),
       is_active = 1`,
    [definition.permissionKey, definition.group, definition.name, definition.description, nextSort]
  );

  const [[permission]] = await connection.query(
    'SELECT permission_id FROM permissions WHERE permission_key = ? LIMIT 1',
    [PERMISSION_KEY]
  );
  if (!permission) throw new Error(`Failed to seed ${PERMISSION_KEY}.`);

  for (const role of state.roles) {
    await connection.query(
      'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
      [role.role_id, permission.permission_id]
    );
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    printReport(before);
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      await applyMigration(connection, before);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    const granted = new Set(after.grantedRoleCodes);
    const missing = LEGACY_ROLE_CODES.filter((code) => !granted.has(code));
    if (!after.permission || Number(after.permission.is_active) !== 1 || missing.length > 0) {
      throw new Error(`Migration verification failed; missing grants: ${missing.join(', ') || 'none'}.`);
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
