'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const [[role]] = await pool.query(
    `
      SELECT
        role_id,
        code,
        name,
        description,
        is_active
      FROM roles
      WHERE code = 'qc'
      LIMIT 1
    `
  );

  if (!role || Number(role.is_active) !== 1) {
    throw new Error('The active QC role is missing. Run the Stage 9A migration.');
  }

  if (String(role.name || '').trim() !== 'Quality Control') {
    throw new Error('The QC role name is not configured correctly.');
  }

  const [[assignmentCount]] = await pool.query(
    `
      SELECT COUNT(*) AS assignment_count
      FROM user_roles ur
      INNER JOIN roles r
        ON r.role_id = ur.role_id
      WHERE r.code = 'qc'
    `
  );

  console.log(
    `QC role foundation valid: role #${Number(role.role_id)}, ${Number(assignmentCount.assignment_count || 0)} assigned user(s).`
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
