'use strict';

const { pool } = require('./db');

async function createApiSession({ userId, toolSource, tokenHash, expiresAt }, connection = pool) {
  const [result] = await connection.query(
    `INSERT INTO api_tool_sessions (
       user_id,
       tool_source,
       token_hash,
       expires_at
     ) VALUES (?, ?, ?, ?)`,
    [userId, toolSource, tokenHash, expiresAt]
  );

  return Number(result.insertId);
}

async function getActiveApiSessionByTokenHash(tokenHash, connection = pool) {
  const [rows] = await connection.query(
    `SELECT
       api_tool_session_id,
       user_id,
       tool_source,
       created_at,
       expires_at,
       last_used_at
     FROM api_tool_sessions
     WHERE token_hash = ?
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  return rows[0] || null;
}

async function touchApiSession(apiToolSessionId, connection = pool) {
  await connection.query(
    `UPDATE api_tool_sessions
     SET last_used_at = NOW()
     WHERE api_tool_session_id = ?
       AND revoked_at IS NULL`,
    [apiToolSessionId]
  );
}

async function revokeApiSession(apiToolSessionId, connection = pool) {
  const [result] = await connection.query(
    `UPDATE api_tool_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE api_tool_session_id = ?`,
    [apiToolSessionId]
  );

  return Number(result.affectedRows || 0) > 0;
}

module.exports = {
  createApiSession,
  getActiveApiSessionByTokenHash,
  touchApiSession,
  revokeApiSession
};
