'use strict';

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const PERMISSION_KEY = 'users.tool_pin.manage';
const DEFAULT_ROLE_CODES = Object.freeze(['admin', 'super_admin']);

async function inspect(connection) {
  const definition = PERMISSIONS.find((item) => item.permissionKey === PERMISSION_KEY);
  if (!definition) throw new Error(`${PERMISSION_KEY} is missing from config/permissionCatalog.js.`);
  const [roles] = await connection.query(
    `SELECT role_id, code, name FROM roles WHERE code IN (?) ORDER BY role_id`,
    [DEFAULT_ROLE_CODES]
  );
  const [[permission]] = await connection.query(
    `SELECT permission_id, permission_key, is_active FROM permissions WHERE permission_key = ? LIMIT 1`,
    [PERMISSION_KEY]
  );
  let grantedRoleCodes = [];
  if (permission) {
    const [grants] = await connection.query(
      `SELECT r.code FROM role_permissions rp INNER JOIN roles r ON r.role_id = rp.role_id
       WHERE rp.permission_id = ? AND r.code IN (?) ORDER BY r.role_id`,
      [permission.permission_id, DEFAULT_ROLE_CODES]
    );
    grantedRoleCodes = grants.map((row) => row.code);
  }
  return { definition, permission, roles, grantedRoleCodes };
}

async function applyMigration(connection, state) {
  const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
  const nextSort = Number(sortRow.max_sort || 0) + 10;
  const d = state.definition;
  await connection.query(
    `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE permission_group = VALUES(permission_group), name = VALUES(name),
       description = VALUES(description), is_active = 1`,
    [d.permissionKey, d.group, d.name, d.description, nextSort]
  );
  const [[permission]] = await connection.query('SELECT permission_id FROM permissions WHERE permission_key = ? LIMIT 1', [PERMISSION_KEY]);
  if (!permission) throw new Error(`Failed to seed ${PERMISSION_KEY}.`);
  for (const role of state.roles) {
    await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [role.role_id, permission.permission_id]);
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    const granted = new Set(before.grantedRoleCodes);
    console.log(`Tool PIN management permission migration (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Catalog row: ${before.permission ? 'present' : 'missing'}`);
    for (const code of DEFAULT_ROLE_CODES) if (!granted.has(code)) console.log(`- grant ${PERMISSION_KEY} to ${code}`);
    if (!APPLY) return;
    await connection.beginTransaction();
    try { await applyMigration(connection, before); await connection.commit(); }
    catch (error) { await connection.rollback(); throw error; }
    const after = await inspect(connection);
    const afterGranted = new Set(after.grantedRoleCodes);
    const missing = DEFAULT_ROLE_CODES.filter((code) => !afterGranted.has(code));
    if (!after.permission || Number(after.permission.is_active) !== 1 || missing.length) {
      throw new Error(`Migration verification failed: ${missing.join(', ') || 'catalog row'}`);
    }
    console.log('Migration applied and verified.');
  } finally {
    connection.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error && error.stack ? error.stack : error); process.exitCode = 1; });
