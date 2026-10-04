'use strict';

const { pool } = require('../models/db');
const { PERMISSIONS } = require('../config/permissionCatalog');

const APPLY = process.argv.includes('--apply');
const PERMISSION_KEYS = Object.freeze(['qc.team_oversight.view', 'qc.reviewer_audit.perform']);
const DEFAULT_ROLE_CODES = Object.freeze(['admin', 'super_admin']);

async function tableReady(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'qc_reviewer_audits'`
  );
  const columns = new Set(rows.map((row) => String(row.column_name || '')));
  return ['qc_reviewer_audit_id', 'unit_qc_check_id', 'audited_by_user_id', 'audit_outcome', 'audit_notes', 'audited_at']
    .every((column) => columns.has(column));
}

async function inspect(connection) {
  const definitions = PERMISSION_KEYS.map((key) => PERMISSIONS.find((item) => item.permissionKey === key));
  if (definitions.some((item) => !item)) throw new Error('QC reviewer oversight permissions are missing from config/permissionCatalog.js.');
  const [roles] = await connection.query('SELECT role_id, code, name FROM roles WHERE code IN (?) ORDER BY role_id', [DEFAULT_ROLE_CODES]);
  const [permissions] = await connection.query('SELECT permission_id, permission_key, is_active FROM permissions WHERE permission_key IN (?)', [PERMISSION_KEYS]);
  const grants = [];
  for (const permission of permissions) {
    const [rows] = await connection.query(
      `SELECT r.code FROM role_permissions rp INNER JOIN roles r ON r.role_id = rp.role_id
       WHERE rp.permission_id = ? AND r.code IN (?)`,
      [permission.permission_id, DEFAULT_ROLE_CODES]
    );
    grants.push(...rows.map((row) => `${permission.permission_key}:${row.code}`));
  }
  return { definitions, roles, permissions, grants, tableReady: await tableReady(connection) };
}

async function applyPermissions(connection, state) {
  const [[sortRow]] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM permissions');
  let sortOrder = Number(sortRow.max_sort || 0) + 10;
  for (const d of state.definitions) {
    await connection.query(
      `INSERT INTO permissions (permission_key, permission_group, name, description, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE permission_group = VALUES(permission_group), name = VALUES(name), description = VALUES(description), is_active = 1`,
      [d.permissionKey, d.group, d.name, d.description, sortOrder]
    );
    sortOrder += 10;
  }
  const [permissions] = await connection.query('SELECT permission_id, permission_key FROM permissions WHERE permission_key IN (?)', [PERMISSION_KEYS]);
  for (const permission of permissions) {
    for (const role of state.roles) {
      await connection.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [role.role_id, permission.permission_id]);
    }
  }
}

async function applyTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS qc_reviewer_audits (
      qc_reviewer_audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_qc_check_id BIGINT UNSIGNED NOT NULL,
      audited_by_user_id INT NOT NULL,
      audit_outcome VARCHAR(32) NOT NULL,
      audit_notes VARCHAR(2000) NULL,
      audited_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (qc_reviewer_audit_id),
      UNIQUE KEY uq_qc_reviewer_audits_check (unit_qc_check_id),
      KEY idx_qc_reviewer_audits_auditor_at (audited_by_user_id, audited_at),
      CONSTRAINT fk_qc_reviewer_audits_check
        FOREIGN KEY (unit_qc_check_id) REFERENCES unit_qc_checks (unit_qc_check_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_qc_reviewer_audits_auditor
        FOREIGN KEY (audited_by_user_id) REFERENCES users (user_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    console.log(`QC reviewer oversight migration (${APPLY ? 'apply' : 'audit'})`);
    console.log(`Audit table: ${before.tableReady ? 'ready' : 'missing/not ready'}`);
    console.log(`Permission rows: ${before.permissions.length}/${PERMISSION_KEYS.length}`);
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      await applyTable(connection);
      await applyPermissions(connection, before);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await inspect(connection);
    const active = new Set(after.permissions.filter((row) => Number(row.is_active) === 1).map((row) => row.permission_key));
    const grants = new Set(after.grants);
    const missingPermission = PERMISSION_KEYS.filter((key) => !active.has(key));
    const missingGrant = PERMISSION_KEYS.flatMap((key) => DEFAULT_ROLE_CODES.map((role) => `${key}:${role}`)).filter((pair) => !grants.has(pair));
    if (!after.tableReady || missingPermission.length || missingGrant.length) {
      throw new Error(`QC reviewer oversight migration verification failed. Missing: ${[...missingPermission, ...missingGrant].join(', ') || 'table'}`);
    }
    console.log('Migration applied and verified.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error && error.stack ? error.stack : error); process.exitCode = 1; });
