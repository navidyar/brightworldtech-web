'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../models/db');
const { LEGACY_AUTHORIZATION_RETIREMENT_KEY } = require('../services/permissionManagementPolicy');

const APPLY = process.argv.includes('--apply');

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function auditRoleSpecificGates() {
  const routesDir = path.join(__dirname, '..', 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter((name) => name.endsWith('.js'));
  const combined = routeFiles.map((name) => fs.readFileSync(path.join(routesDir, name), 'utf8')).join('\n');
  const management = fs.readFileSync(path.join(routesDir, 'management.js'), 'utf8');
  const huddle = fs.readFileSync(path.join(routesDir, 'virtualHuddle.js'), 'utf8');

  const allRoleGates = count(combined, /requireRole\s*\(/g);
  const techRoleGates = count(management, /requireRole\(techRoles\)/g);
  const adminHuddleGates = count(huddle, /requireRole\(adminRoles\)/g);
  const unexpected = allRoleGates !== 8 || techRoleGates !== 3 || adminHuddleGates !== 5;

  return { allRoleGates, techRoleGates, adminHuddleGates, unexpected };
}

async function main() {
  const gateAudit = auditRoleSpecificGates();
  console.log(`Permission authorization retirement (${APPLY ? 'apply' : 'audit'})`);
  console.log(`Remaining explicit route role checks: ${gateAudit.allRoleGates}`);
  console.log(`- regular Tech duplicate workflow: ${gateAudit.techRoleGates}`);
  console.log(`- Admin Huddle optional/delete workflow: ${gateAudit.adminHuddleGates}`);

  if (gateAudit.unexpected) {
    throw new Error('Unexpected role-gate inventory. Review the authorization surface before retiring migration protection.');
  }

  const [rows] = await pool.query(
    'SELECT migration_key, applied_at FROM authorization_migration_state WHERE migration_key = ? LIMIT 1',
    [LEGACY_AUTHORIZATION_RETIREMENT_KEY]
  );

  if (rows[0]) {
    console.log(`Retirement marker already applied at ${rows[0].applied_at.toISOString ? rows[0].applied_at.toISOString() : rows[0].applied_at}.`);
    return;
  }

  console.log('General role-based authorization migration is complete; remaining role checks are intentional business-role rules, not compatibility gates.');
  if (!APPLY) {
    console.log('No database changes made. Re-run with --apply to retire compatibility-role lifecycle protection.');
    return;
  }

  await pool.query(
    'INSERT INTO authorization_migration_state (migration_key) VALUES (?)',
    [LEGACY_AUTHORIZATION_RETIREMENT_KEY]
  );
  console.log('Compatibility-role lifecycle protection retired. Super Admin protection remains permanent.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
