'use strict';

const { pool } = require('./db');

const FIELDS = Object.freeze([
  'first_name', 'last_name', 'email', 'personal_email', 'phone',
  'start_date', 'end_date', 'roles', 'is_active'
]);

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(String).sort();
  if (typeof value === 'boolean') return value;
  return String(value);
}

function diffSnapshots(before, after) {
  const changes = {};
  for (const field of FIELDS) {
    const oldValue = cleanValue(before && before[field]);
    const newValue = cleanValue(after && after[field]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }
  return changes;
}

async function getSnapshot(connection, userId) {
  const [rows] = await connection.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email, u.personal_email,
            u.phone, DATE_FORMAT(u.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(u.end_date, '%Y-%m-%d') AS end_date, u.is_active,
            GROUP_CONCAT(r.code ORDER BY r.code) AS role_codes
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r ON r.role_id = ur.role_id
      WHERE u.user_id = ?
      GROUP BY u.user_id`,
    [userId]
  );
  const row = rows[0];
  return row ? {
    ...row,
    is_active: Number(row.is_active) === 1,
    roles: row.role_codes ? row.role_codes.split(',') : []
  } : null;
}

function snapshotName(snapshot, fallbackId) {
  return snapshot
    ? [snapshot.first_name, snapshot.last_name].filter(Boolean).join(' ').trim() || snapshot.email || `User #${fallbackId}`
    : `User #${fallbackId}`;
}

async function writeEvent(connection, { actorUserId = null, targetUserId, action, result = 'success', before = null, after = null, reason = null }) {
  const actorId = Number(actorUserId) > 0 ? Number(actorUserId) : null;
  const targetId = Number(targetUserId);
  const actor = actorId ? await getSnapshot(connection, actorId) : null;
  const target = after || before || await getSnapshot(connection, targetId);
  const changes = diffSnapshots(before, after);
  await connection.query(
    `INSERT INTO user_management_audit
      (actor_user_id, target_user_id, actor_name, target_name, action, result, changes_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actorId, targetId, actorId ? snapshotName(actor, actorId) : null,
      snapshotName(target, targetId), action, result, JSON.stringify(changes), reason]
  );
}

async function recordEvent({ actorUserId, targetUserId, action, reason = null }) {
  await writeEvent(pool, { actorUserId, targetUserId, action, result: 'success', reason });
}

async function recordBlocked({ actorUserId, targetUserId, action, reason }) {
  try {
    await writeEvent(pool, { actorUserId, targetUserId, action, result: 'blocked', reason });
  } catch (error) {
    // The account protection decision has already been made; audit failure cannot allow the action.
    console.error('Unable to record blocked user-management action:', error);
  }
}

async function listEvents({ targetUserId = null, page = 1, pageSize = 50 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * pageSize;
  const where = Number(targetUserId) > 0 ? 'WHERE target_user_id = ?' : '';
  const params = Number(targetUserId) > 0 ? [Number(targetUserId)] : [];
  const [rows] = await pool.query(
    `SELECT user_management_audit_id, actor_user_id, target_user_id, actor_name,
            target_name, action, result, changes_json, reason, created_at
       FROM user_management_audit ${where}
      ORDER BY created_at DESC, user_management_audit_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize + 1, offset]
  );
  return {
    events: rows.slice(0, pageSize).map((row) => ({
      ...row,
      changes: typeof row.changes_json === 'string' ? JSON.parse(row.changes_json) : row.changes_json
    })),
    hasNext: rows.length > pageSize,
    page: safePage
  };
}

module.exports = { diffSnapshots, getSnapshot, writeEvent, recordEvent, recordBlocked, listEvents };
