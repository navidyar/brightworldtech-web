'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const techUnitModel = require('../models/techUnitModel');

const ELIGIBLE_ROLE_CODES = Object.freeze(['admin', 'management', 'tech_lead', 'tech']);

function sortedUniqueIds(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);
}

async function usersHaveActiveColumn() {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'is_active'
      LIMIT 1
    `
  );

  return rows.length > 0;
}

async function listExpectedEligibleUsers() {
  const activeFilter = await usersHaveActiveColumn()
    ? 'AND COALESCE(u.is_active, 1) = 1'
    : '';
  const placeholders = ELIGIBLE_ROLE_CODES.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        u.user_id,
        GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',') AS role_codes
      FROM users u
      INNER JOIN user_roles ur
        ON ur.user_id = u.user_id
      INNER JOIN roles r
        ON r.role_id = ur.role_id
      WHERE r.code IN (${placeholders})
        ${activeFilter}
      GROUP BY u.user_id
      ORDER BY u.user_id
    `,
    ELIGIBLE_ROLE_CODES
  );

  return rows.map((row) => ({
    userId: Number(row.user_id),
    roleCodes: String(row.role_codes || '').split(',').filter(Boolean)
  }));
}

async function main() {
  const [options, expectedUsers] = await Promise.all([
    techUnitModel.getReturnToActiveOptions(),
    listExpectedEligibleUsers()
  ]);
  const assignees = Array.isArray(options.assignees) ? options.assignees : [];
  const actualIds = sortedUniqueIds(assignees.map((assignee) => assignee.id));
  const expectedIds = sortedUniqueIds(expectedUsers.map((user) => user.userId));

  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    const missingIds = expectedIds.filter((userId) => !actualIds.includes(userId));
    const unexpectedIds = actualIds.filter((userId) => !expectedIds.includes(userId));
    throw new Error(
      `Return-to-active assignee options do not match active eligible users. Missing: ${missingIds.join(', ') || 'none'}. Unexpected: ${unexpectedIds.join(', ') || 'none'}.`
    );
  }

  const roleCounts = Object.fromEntries(ELIGIBLE_ROLE_CODES.map((roleCode) => [roleCode, 0]));
  expectedUsers.forEach((user) => {
    user.roleCodes.forEach((roleCode) => {
      if (Object.hasOwn(roleCounts, roleCode)) roleCounts[roleCode] += 1;
    });
  });

  console.log('Stage 10W.14 Return-to-Active assignee live-path validation passed.');
  console.log(`Eligible active users returned: ${actualIds.length}`);
  ELIGIBLE_ROLE_CODES.forEach((roleCode) => {
    console.log(`- ${roleCode}: ${roleCounts[roleCode]}`);
  });
  console.log('No database changes were made.');
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
