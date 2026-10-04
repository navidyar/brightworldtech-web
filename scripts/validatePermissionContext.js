'use strict';

const { pool } = require('../models/db');
const permissionModel = require('../models/permissionModel');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');

async function main() {
  const [rows] = await pool.query(
    `
      SELECT DISTINCT u.user_id
      FROM users u
      INNER JOIN user_roles ur
        ON ur.user_id = u.user_id
      WHERE u.is_active = 1
      ORDER BY u.user_id
    `
  );

  const knownPermissions = new Set(PERMISSION_KEYS);
  let effectiveGrantCount = 0;

  for (const row of rows) {
    const context = await permissionModel.getUserPermissionContext(row.user_id);
    if (!(context.effectivePermissions instanceof Set)) {
      throw new Error(`User ${row.user_id} did not resolve to a permission Set.`);
    }

    for (const permissionKey of context.effectivePermissions) {
      if (!knownPermissions.has(permissionKey)) {
        throw new Error(`User ${row.user_id} resolved unknown permission ${permissionKey}.`);
      }
      effectiveGrantCount += 1;
    }
  }

  console.log('Authenticated permission context validation passed.');
  console.log(`Active users with assigned roles checked: ${rows.length}`);
  console.log(`Resolved effective permission grants checked: ${effectiveGrantCount}`);
  console.log('Legacy role/feature gates remain authoritative in this stage.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
