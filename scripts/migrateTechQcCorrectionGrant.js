'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { writeAuditEvent } = require('../models/permissionManagementModel');
const MIGRATION_KEY = 'permission_tech_qc_correction_default_v1';
const PERMISSION_KEY = 'qc.correction.submit';

async function migrate(connection, apply = false) {
  await connection.beginTransaction();
  try {
    // Serialize with role management and other copies of this migration.
    const [roles] = await connection.query("SELECT role_id, name FROM roles WHERE code = 'tech' FOR UPDATE");
    if (roles.length !== 1) throw new Error('Expected exactly one legacy Tech role.');
    const role = roles[0];
    const [states] = await connection.query('SELECT migration_key FROM authorization_migration_state WHERE migration_key = ?', [MIGRATION_KEY]);
    const [permissions] = await connection.query('SELECT permission_id FROM permissions WHERE permission_key = ? AND is_active = 1', [PERMISSION_KEY]);
    if (permissions.length !== 1) throw new Error('The active QC correction permission is missing.');
    const permission = permissions[0];
    const [grants] = await connection.query('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [role.role_id, permission.permission_id]);
    const result = { migration: MIGRATION_KEY, alreadyApplied: states.length > 0, grantPresent: grants.length > 0, apply, changed: false };
    if (apply && !result.alreadyApplied) {
      if (!result.grantPresent) {
        await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [role.role_id, permission.permission_id]);
        await writeAuditEvent(connection, {
          eventType: 'role_permission_default_corrected',
          targetRoleId: role.role_id,
          targetRoleNameSnapshot: role.name,
          permissionKeySnapshot: PERMISSION_KEY,
          beforeState: { granted: false },
          afterState: { granted: true, migration: MIGRATION_KEY }
        });
        result.changed = true;
      }
      await connection.query('INSERT INTO authorization_migration_state (migration_key) VALUES (?)', [MIGRATION_KEY]);
      await connection.commit();
    } else {
      await connection.rollback();
    }
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    const connection = await pool.getConnection();
    try {
      console.log(JSON.stringify(await migrate(connection, process.argv.includes('--apply'))));
    } finally {
      connection.release();
      await pool.end();
    }
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { migrate, MIGRATION_KEY };
