'use strict';

const { pool } = require('./db');
const accessPolicy = require('../config/accessPolicy');
const huddlePolicy = require('../config/virtualHuddlePolicy');
const { buildAudienceFromUsers } = require('../services/virtualHuddleAudience');
const applicationSettingsModel = require('./applicationSettingsModel');

const HUDDLE_AUTO_ARCHIVE_DAYS = applicationSettingsModel.DEFAULT_HUDDLE_ARCHIVE_DAYS;

const ROLE_ORDER_SQL = `
  CASE role_code_snapshot
    WHEN 'admin' THEN 10
    WHEN 'management' THEN 20
    WHEN 'tech_lead' THEN 30
    WHEN 'qc' THEN 40
    WHEN 'tech' THEN 50
    ELSE 999
  END
`;

function normalizeId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = null) {
  const text = String(value || '').trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function fullName(row) {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || `User ${row.user_id}`;
}

function mapActiveUser(row) {
  const roles = String(row.role_codes || '').split(',').map((role) => role.trim()).filter(Boolean);
  const primaryRoleCode = accessPolicy.getPrimaryRole(roles);
  return {
    user_id: Number(row.user_id),
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username,
    roles,
    primary_role_code: primaryRoleCode,
    display_name: fullName(row)
  };
}

async function listActiveUsers(connection = pool) {
  const [rows] = await connection.query(`
    SELECT
      u.user_id,
      u.first_name,
      u.last_name,
      u.username,
      GROUP_CONCAT(
        r.code
        ORDER BY CASE r.code
          WHEN 'admin' THEN 10
          WHEN 'management' THEN 20
          WHEN 'tech_lead' THEN 30
          WHEN 'qc' THEN 40
          WHEN 'tech' THEN 50
          ELSE 999
        END
        SEPARATOR ','
      ) AS role_codes
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.user_id
    LEFT JOIN roles r ON r.role_id = ur.role_id AND r.is_active = 1
    WHERE u.is_active = 1
    GROUP BY u.user_id, u.first_name, u.last_name, u.username
    ORDER BY u.last_name, u.first_name, u.username
  `);

  return rows.map(mapActiveUser).filter((user) => accessPolicy.ACCOUNT_ROLE_CODES.includes(user.primary_role_code));
}

async function previewAudience({ senderUserId, senderRoleCodes, targetRoleCodes, targetUserIds, messageTypeCode }) {
  const activeUsers = await listActiveUsers();
  return buildAudienceFromUsers({
    activeUsers,
    senderUserId,
    senderRoleCodes,
    targetRoleCodes,
    targetUserIds,
    messageTypeCode
  });
}

async function getMessageForThread(messageId, connection = pool) {
  const safeMessageId = normalizeId(messageId);
  if (!safeMessageId) return null;
  const [rows] = await connection.query(`
    SELECT virtual_huddle_message_id, thread_root_message_id, parent_message_id, subject
    FROM virtual_huddle_messages
    WHERE virtual_huddle_message_id = ?
    LIMIT 1
  `, [safeMessageId]);
  return rows[0] || null;
}

async function createVirtualHuddle({
  senderUser,
  messageTypeCode,
  subject,
  messageBody,
  targetRoleCodes,
  targetUserIds,
  parentMessageId = null
}) {
  const senderUserId = normalizeId(senderUser?.user_id);
  const senderRoles = Array.isArray(senderUser?.roles) ? senderUser.roles : [];
  if (!senderUserId || !huddlePolicy.canSendVirtualHuddle(senderRoles)) {
    const error = new Error('Management access is required to send a Virtual Huddle.');
    error.code = 'HUDDLE_SEND_FORBIDDEN';
    throw error;
  }

  const normalizedMessageType = huddlePolicy.assertMessageType
    ? huddlePolicy.assertMessageType(messageTypeCode)
    : String(messageTypeCode || '').trim().toLowerCase();
  const safeSubject = normalizeText(subject, 255);
  const safeBody = normalizeText(messageBody);
  if (!safeSubject || !safeBody) {
    const error = new Error('Subject and message are required.');
    error.code = 'HUDDLE_INVALID_MESSAGE';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const activeUsers = await listActiveUsers(connection);
    const senderSnapshot = activeUsers.find((user) => user.user_id === senderUserId);
    if (!senderSnapshot) {
      const error = new Error('The sender is not an active user.');
      error.code = 'HUDDLE_SENDER_UNAVAILABLE';
      throw error;
    }

    const audience = buildAudienceFromUsers({
      activeUsers,
      senderUserId,
      senderRoleCodes: senderSnapshot.roles,
      targetRoleCodes,
      targetUserIds,
      messageTypeCode: normalizedMessageType
    });

    let parentMessage = null;
    let threadRootMessageId = null;
    if (parentMessageId) {
      parentMessage = await getMessageForThread(parentMessageId, connection);
      if (!parentMessage) {
        const error = new Error('The related Virtual Huddle no longer exists.');
        error.code = 'HUDDLE_PARENT_NOT_FOUND';
        throw error;
      }
      threadRootMessageId = Number(parentMessage.thread_root_message_id || parentMessage.virtual_huddle_message_id);
    }

    const senderRoleCode = accessPolicy.getPrimaryRole(senderSnapshot.roles);
    const confirmationPhrase = normalizedMessageType === 'notice'
      ? null
      : huddlePolicy.HUDDLE_CONFIRMATION_PHRASE;

    const [messageResult] = await connection.query(`
      INSERT INTO virtual_huddle_messages (
        thread_root_message_id,
        parent_message_id,
        message_type_code,
        subject,
        message_body,
        confirmation_phrase,
        sent_by_user_id,
        sender_name_snapshot,
        sender_role_code_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      threadRootMessageId,
      parentMessage ? Number(parentMessage.virtual_huddle_message_id) : null,
      normalizedMessageType,
      safeSubject,
      safeBody,
      confirmationPhrase,
      senderUserId,
      senderSnapshot.display_name,
      senderRoleCode
    ]);

    const messageId = Number(messageResult.insertId);

    for (const roleCode of audience.targetRoleCodes) {
      await connection.query(`
        INSERT INTO virtual_huddle_targets (
          virtual_huddle_message_id,
          target_type_code,
          target_role_code_snapshot
        ) VALUES (?, 'role', ?)
      `, [messageId, roleCode]);
    }

    for (const userId of audience.targetUserIds) {
      const targetUser = activeUsers.find((user) => user.user_id === userId);
      if (!targetUser || userId === senderUserId) continue;
      await connection.query(`
        INSERT INTO virtual_huddle_targets (
          virtual_huddle_message_id,
          target_type_code,
          target_user_id,
          target_user_name_snapshot
        ) VALUES (?, 'user', ?, ?)
      `, [messageId, userId, targetUser.display_name]);
    }

    for (const recipient of audience.recipients) {
      await connection.query(`
        INSERT INTO virtual_huddle_recipients (
          virtual_huddle_message_id,
          user_id,
          user_name_snapshot,
          role_code_snapshot,
          acknowledgment_mode_code,
          recipient_state_code
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        messageId,
        recipient.user_id,
        recipient.display_name,
        recipient.primary_role_code,
        recipient.acknowledgment_mode_code,
        recipient.recipient_state_code
      ]);
    }

    await connection.commit();
    return {
      messageId,
      recipientUserIds: audience.recipients.map((recipient) => recipient.user_id),
      recipientCount: audience.recipients.length
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function hasPendingRequiredAcknowledgment(userId) {
  const safeUserId = normalizeId(userId);
  if (!safeUserId) return false;
  const [rows] = await pool.query(`
    SELECT 1
    FROM virtual_huddle_recipients
    WHERE user_id = ?
      AND acknowledgment_mode_code = 'required_ack'
      AND recipient_state_code = 'awaiting_confirmation'
    LIMIT 1
  `, [safeUserId]);
  return Boolean(rows[0]);
}

async function getNextPresentation(userId) {
  const safeUserId = normalizeId(userId);
  if (!safeUserId) return null;

  const [rows] = await pool.query(`
    SELECT
      r.virtual_huddle_recipient_id,
      r.virtual_huddle_message_id,
      r.acknowledgment_mode_code,
      r.recipient_state_code,
      r.dismissed_at,
      m.message_type_code,
      m.subject,
      m.message_body,
      m.confirmation_phrase,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      m.parent_message_id,
      parent.subject AS parent_subject,
      (
        SELECT COUNT(*)
        FROM virtual_huddle_recipients pending
        WHERE pending.user_id = ?
          AND pending.acknowledgment_mode_code = 'required_ack'
          AND pending.recipient_state_code = 'awaiting_confirmation'
      ) AS pending_required_count
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN virtual_huddle_messages parent
      ON parent.virtual_huddle_message_id = m.parent_message_id
    WHERE r.user_id = ?
      AND (
        (r.acknowledgment_mode_code = 'required_ack' AND r.recipient_state_code = 'awaiting_confirmation')
        OR
        (r.acknowledgment_mode_code IN ('optional_ack', 'informational')
          AND r.recipient_state_code = 'available'
          AND r.dismissed_at IS NULL)
      )
    ORDER BY
      CASE WHEN r.acknowledgment_mode_code = 'required_ack' THEN 0 ELSE 1 END,
      CASE m.message_type_code
        WHEN 'urgent' THEN 10
        WHEN 'priority' THEN 20
        WHEN 'standard' THEN 30
        WHEN 'notice' THEN 40
        ELSE 99
      END,
      m.sent_at ASC,
      m.virtual_huddle_message_id ASC
    LIMIT 1
  `, [safeUserId, safeUserId]);

  return rows[0] || null;
}

async function getRecipientForUpdate(connection, recipientId, userId = null) {
  const safeRecipientId = normalizeId(recipientId);
  const safeUserId = userId ? normalizeId(userId) : null;
  if (!safeRecipientId) return null;

  const params = [safeRecipientId];
  let userClause = '';
  if (safeUserId) {
    userClause = 'AND r.user_id = ?';
    params.push(safeUserId);
  }

  const [rows] = await connection.query(`
    SELECT
      r.*,
      m.message_type_code,
      m.confirmation_phrase,
      m.subject
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    WHERE r.virtual_huddle_recipient_id = ?
      ${userClause}
    LIMIT 1
    FOR UPDATE
  `, params);

  return rows[0] || null;
}

async function acknowledgeRecipient({ recipientId, userId, confirmationPhrase, note }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const recipient = await getRecipientForUpdate(connection, recipientId, userId);
    if (!recipient) {
      const error = new Error('This Virtual Huddle is no longer available.');
      error.code = 'HUDDLE_RECIPIENT_NOT_FOUND';
      throw error;
    }

    if (!huddlePolicy.canAcknowledgeRecipient({
      acknowledgmentMode: recipient.acknowledgment_mode_code,
      recipientStateCode: recipient.recipient_state_code
    })) {
      const error = new Error('This Virtual Huddle cannot be acknowledged in its current state.');
      error.code = 'HUDDLE_ACK_INVALID_STATE';
      throw error;
    }

    const expectedPhrase = recipient.confirmation_phrase || huddlePolicy.HUDDLE_CONFIRMATION_PHRASE;
    if (!huddlePolicy.isConfirmationPhraseMatch(confirmationPhrase, expectedPhrase)) {
      const error = new Error(`Type ${huddlePolicy.HUDDLE_CONFIRMATION_PHRASE} to confirm.`);
      error.code = 'HUDDLE_CONFIRMATION_MISMATCH';
      throw error;
    }

    const safeNote = normalizeText(note, 2000) || null;
    await connection.query(`
      UPDATE virtual_huddle_recipients
      SET recipient_state_code = 'acknowledged',
          acknowledgment_phrase_snapshot = ?,
          acknowledgment_note = ?,
          acknowledged_at = CURRENT_TIMESTAMP(6)
      WHERE virtual_huddle_recipient_id = ?
    `, [huddlePolicy.HUDDLE_CONFIRMATION_PHRASE, safeNote, Number(recipient.virtual_huddle_recipient_id)]);

    await connection.commit();
    return {
      messageId: Number(recipient.virtual_huddle_message_id),
      recipientId: Number(recipient.virtual_huddle_recipient_id)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function dismissRecipient({ recipientId, userId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const recipient = await getRecipientForUpdate(connection, recipientId, userId);
    if (!recipient) {
      const error = new Error('This Virtual Huddle is no longer available.');
      error.code = 'HUDDLE_RECIPIENT_NOT_FOUND';
      throw error;
    }

    const canDismiss = ['optional_ack', 'informational'].includes(recipient.acknowledgment_mode_code)
      && recipient.recipient_state_code === 'available';
    if (!canDismiss) {
      const error = new Error('This Virtual Huddle requires acknowledgment and cannot be closed.');
      error.code = 'HUDDLE_DISMISS_FORBIDDEN';
      throw error;
    }

    const messageId = Number(recipient.virtual_huddle_message_id);
    const ephemeralNotice = recipient.acknowledgment_mode_code === 'informational'
      && recipient.message_type_code === 'notice';

    if (ephemeralNotice) {
      await connection.query(
        'DELETE FROM virtual_huddle_recipients WHERE virtual_huddle_recipient_id = ?',
        [Number(recipient.virtual_huddle_recipient_id)]
      );

      const [[remainingRow]] = await connection.query(`
        SELECT COUNT(*) AS remaining_count
        FROM virtual_huddle_recipients
        WHERE virtual_huddle_message_id = ?
      `, [messageId]);

      if (Number(remainingRow?.remaining_count || 0) === 0) {
        await connection.query(`
          DELETE FROM virtual_huddle_messages
          WHERE virtual_huddle_message_id = ?
            AND message_type_code = 'notice'
        `, [messageId]);
      }
    } else {
      await connection.query(`
        UPDATE virtual_huddle_recipients
        SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP(6))
        WHERE virtual_huddle_recipient_id = ?
      `, [Number(recipient.virtual_huddle_recipient_id)]);
    }

    await connection.commit();
    return { messageId, ephemeralNotice };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteOwnOptionalRecipient({ recipientId, userId, actorRoleCodes }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const recipient = await getRecipientForUpdate(connection, recipientId, userId);
    if (!recipient) {
      const error = new Error('This Virtual Huddle recipient record no longer exists.');
      error.code = 'HUDDLE_RECIPIENT_NOT_FOUND';
      throw error;
    }

    if (!huddlePolicy.canDeleteOwnOptionalRecipientRecord({
      actorRoleCodes,
      acknowledgmentMode: recipient.acknowledgment_mode_code,
      recipientStateCode: recipient.recipient_state_code
    })) {
      const error = new Error('Only an unacknowledged optional Admin copy can be deleted from the personal inbox.');
      error.code = 'HUDDLE_RECIPIENT_DELETE_FORBIDDEN';
      throw error;
    }

    await connection.query(
      'DELETE FROM virtual_huddle_recipients WHERE virtual_huddle_recipient_id = ?',
      [Number(recipient.virtual_huddle_recipient_id)]
    );
    await connection.commit();
    return { messageId: Number(recipient.virtual_huddle_message_id) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listManagementHistory({
  page = 1,
  pageSize = 50,
  status = 'pending',
  messageType = 'all',
  search = '',
  sort = 'sent_desc'
} = {}) {
  const safePageSize = Math.min(100, Math.max(10, Number.parseInt(pageSize, 10) || 50));
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safePageSize;
  const allowedStatuses = new Set(['pending', 'acknowledged', 'archived']);
  const statusFilter = allowedStatuses.has(String(status || '').trim().toLowerCase())
    ? String(status).trim().toLowerCase()
    : 'pending';
  const allowedTypes = new Set(['all', 'standard', 'priority', 'urgent']);
  const rawMessageType = Array.isArray(messageType) ? messageType[messageType.length - 1] : messageType;
  const normalizedMessageType = String(rawMessageType || '').trim().toLowerCase();
  const messageTypeFilter = allowedTypes.has(normalizedMessageType) ? normalizedMessageType : 'all';
  const searchTerm = normalizeText(search, 150);
  const sortOptions = {
    message_asc: 'm.subject ASC, m.virtual_huddle_message_id ASC',
    message_desc: 'm.subject DESC, m.virtual_huddle_message_id DESC',
    type_asc: `CASE m.message_type_code WHEN 'standard' THEN 10 WHEN 'priority' THEN 20 WHEN 'urgent' THEN 30 ELSE 99 END ASC, m.sent_at DESC`,
    type_desc: `CASE m.message_type_code WHEN 'urgent' THEN 10 WHEN 'priority' THEN 20 WHEN 'standard' THEN 30 ELSE 99 END ASC, m.sent_at DESC`,
    sender_asc: 'm.sender_name_snapshot ASC, m.sent_at DESC',
    sender_desc: 'm.sender_name_snapshot DESC, m.sent_at DESC',
    sent_asc: 'm.sent_at ASC, m.virtual_huddle_message_id ASC',
    sent_desc: 'm.sent_at DESC, m.virtual_huddle_message_id DESC'
  };
  const normalizedSort = Object.prototype.hasOwnProperty.call(sortOptions, String(sort || '').trim().toLowerCase())
    ? String(sort).trim().toLowerCase()
    : 'sent_desc';
  const orderBySql = sortOptions[normalizedSort];
  const applicationSettings = await applicationSettingsModel.getApplicationSettings();
  const archiveAfterDays = applicationSettingsModel.normalizeHuddleArchiveDays(
    applicationSettings.huddleArchiveDays,
    HUDDLE_AUTO_ARCHIVE_DAYS
  );
  const archiveCondition = `(COALESCE(rec.awaiting_count, 0) = 0 AND COALESCE(rec.required_resolved_at, m.sent_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${archiveAfterDays} DAY))`;
  const filters = ["m.message_type_code <> 'notice'"];
  const params = [];

  if (statusFilter === 'pending') filters.push('COALESCE(rec.awaiting_count, 0) > 0');
  if (statusFilter === 'acknowledged') {
    filters.push('COALESCE(rec.awaiting_count, 0) = 0');
    filters.push(`NOT ${archiveCondition}`);
  }
  if (statusFilter === 'archived') filters.push(archiveCondition);

  if (messageTypeFilter !== 'all') {
    filters.push('m.message_type_code = ?');
    params.push(messageTypeFilter);
  }

  if (searchTerm) {
    const like = `%${searchTerm}%`;
    filters.push(`(
      m.subject LIKE ?
      OR m.message_body LIKE ?
      OR m.sender_name_snapshot LIKE ?
      OR EXISTS (
        SELECT 1
        FROM virtual_huddle_targets search_target
        WHERE search_target.virtual_huddle_message_id = m.virtual_huddle_message_id
          AND (
            search_target.target_role_code_snapshot LIKE ?
            OR search_target.target_user_name_snapshot LIKE ?
          )
      )
    )`);
    params.push(like, like, like, like, like);
  }

  const recipientSummarySql = `
    SELECT
      virtual_huddle_message_id,
      COUNT(*) AS total_recipients,
      SUM(recipient_state_code = 'acknowledged') AS acknowledged_count,
      SUM(recipient_state_code = 'awaiting_confirmation') AS awaiting_count,
      SUM(recipient_state_code = 'revoked') AS revoked_count,
      SUM(acknowledgment_mode_code = 'optional_ack' AND recipient_state_code = 'available') AS optional_count,
      SUM(acknowledgment_mode_code = 'informational') AS informational_count,
      MAX(CASE
        WHEN acknowledgment_mode_code = 'required_ack' AND recipient_state_code = 'acknowledged' THEN acknowledged_at
        WHEN acknowledgment_mode_code = 'required_ack' AND recipient_state_code = 'revoked' THEN revoked_at
        ELSE NULL
      END) AS required_resolved_at
    FROM virtual_huddle_recipients
    GROUP BY virtual_huddle_message_id
  `;
  const whereSql = filters.join('\n      AND ');

  const [[countRow]] = await pool.query(`
    SELECT COUNT(*) AS total_count
    FROM virtual_huddle_messages m
    LEFT JOIN (${recipientSummarySql}) rec
      ON rec.virtual_huddle_message_id = m.virtual_huddle_message_id
    WHERE ${whereSql}
  `, params);
  const totalCount = Number(countRow?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const normalizedPage = Math.min(safePage, totalPages);
  const normalizedOffset = (normalizedPage - 1) * safePageSize;

  const [rows] = await pool.query(`
    SELECT
      m.*,
      COALESCE(rec.total_recipients, 0) AS total_recipients,
      COALESCE(rec.acknowledged_count, 0) AS acknowledged_count,
      COALESCE(rec.awaiting_count, 0) AS awaiting_count,
      COALESCE(rec.revoked_count, 0) AS revoked_count,
      COALESCE(rec.optional_count, 0) AS optional_count,
      COALESCE(rec.informational_count, 0) AS informational_count,
      COALESCE(rec.required_resolved_at, m.sent_at) AS resolved_at,
      ${archiveCondition} AS is_auto_archived,
      (
        SELECT GROUP_CONCAT(t.target_role_code_snapshot ORDER BY
          CASE t.target_role_code_snapshot
            WHEN 'admin' THEN 10 WHEN 'management' THEN 20 WHEN 'tech_lead' THEN 30 WHEN 'qc' THEN 40 WHEN 'tech' THEN 50 ELSE 99 END
          SEPARATOR ',')
        FROM virtual_huddle_targets t
        WHERE t.virtual_huddle_message_id = m.virtual_huddle_message_id
          AND t.target_type_code = 'role'
      ) AS target_role_codes,
      (
        SELECT COUNT(*)
        FROM virtual_huddle_targets t
        WHERE t.virtual_huddle_message_id = m.virtual_huddle_message_id
          AND t.target_type_code = 'user'
      ) AS individual_target_count
    FROM virtual_huddle_messages m
    LEFT JOIN (${recipientSummarySql}) rec
      ON rec.virtual_huddle_message_id = m.virtual_huddle_message_id
    WHERE ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ? OFFSET ?
  `, [...params, safePageSize, normalizedOffset]);

  return {
    messages: rows,
    page: normalizedPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
    statusFilter,
    messageTypeFilter,
    searchTerm,
    sort: normalizedSort,
    archiveAfterDays
  };
}

async function getManagementMessageDetail(messageId) {
  const safeMessageId = normalizeId(messageId);
  if (!safeMessageId) return null;

  const [messageRows] = await pool.query(`
    SELECT m.*, parent.subject AS parent_subject
    FROM virtual_huddle_messages m
    LEFT JOIN virtual_huddle_messages parent
      ON parent.virtual_huddle_message_id = m.parent_message_id
    WHERE m.virtual_huddle_message_id = ?
      AND m.message_type_code <> 'notice'
    LIMIT 1
  `, [safeMessageId]);
  const message = messageRows[0];
  if (!message) return null;

  const [targets] = await pool.query(`
    SELECT *
    FROM virtual_huddle_targets
    WHERE virtual_huddle_message_id = ?
    ORDER BY target_type_code, target_role_code_snapshot, target_user_name_snapshot
  `, [safeMessageId]);

  const [recipients] = await pool.query(`
    SELECT
      r.*,
      revoker.first_name AS revoked_by_first_name,
      revoker.last_name AS revoked_by_last_name
    FROM virtual_huddle_recipients r
    LEFT JOIN users revoker ON revoker.user_id = r.revoked_by_user_id
    WHERE r.virtual_huddle_message_id = ?
    ORDER BY ${ROLE_ORDER_SQL}, r.user_name_snapshot
  `, [safeMessageId]);

  const threadRootMessageId = Number(message.thread_root_message_id || message.virtual_huddle_message_id);
  const [relatedMessages] = await pool.query(`
    SELECT virtual_huddle_message_id, parent_message_id, subject, message_type_code, sent_at
    FROM virtual_huddle_messages
    WHERE (virtual_huddle_message_id = ?
       OR thread_root_message_id = ?)
      AND message_type_code <> 'notice'
    ORDER BY sent_at, virtual_huddle_message_id
  `, [threadRootMessageId, threadRootMessageId]);

  return { message, targets, recipients, relatedMessages };
}

async function getTargetSelection(messageId) {
  const safeMessageId = normalizeId(messageId);
  if (!safeMessageId) return { roleCodes: [], userIds: [] };
  const [rows] = await pool.query(`
    SELECT target_type_code, target_role_code_snapshot, target_user_id
    FROM virtual_huddle_targets
    WHERE virtual_huddle_message_id = ?
  `, [safeMessageId]);
  return {
    roleCodes: rows.filter((row) => row.target_type_code === 'role').map((row) => row.target_role_code_snapshot).filter(Boolean),
    userIds: rows.filter((row) => row.target_type_code === 'user').map((row) => Number(row.target_user_id)).filter(Boolean)
  };
}

async function addRecipients({ messageId, userIds }) {
  const safeMessageId = normalizeId(messageId);
  const selectedUserIds = [...new Set((Array.isArray(userIds) ? userIds : (userIds ? [userIds] : []))
    .map(normalizeId)
    .filter(Boolean))];
  if (!safeMessageId || selectedUserIds.length === 0) {
    const error = new Error('Select at least one active employee to add.');
    error.code = 'HUDDLE_ADD_RECIPIENT_REQUIRED';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageRows] = await connection.query(`
      SELECT virtual_huddle_message_id, message_type_code, subject, sent_by_user_id, sender_role_code_snapshot
      FROM virtual_huddle_messages
      WHERE virtual_huddle_message_id = ?
        AND message_type_code <> 'notice'
      LIMIT 1
      FOR UPDATE
    `, [safeMessageId]);
    const message = messageRows[0] || null;
    if (!message) {
      const error = new Error('Virtual Huddle not found.');
      error.code = 'HUDDLE_MESSAGE_NOT_FOUND';
      throw error;
    }

    const activeUsers = await listActiveUsers(connection);
    const activeById = new Map(activeUsers.map((user) => [Number(user.user_id), user]));
    const unavailableIds = selectedUserIds.filter((userId) => !activeById.has(userId));
    if (unavailableIds.length > 0) {
      const error = new Error('One or more selected recipients are no longer active. Review the recipient list and try again.');
      error.code = 'HUDDLE_RECIPIENT_UNAVAILABLE';
      throw error;
    }
    if (selectedUserIds.includes(Number(message.sent_by_user_id))) {
      const error = new Error('The original sender cannot be added as a recipient of their own Huddle.');
      error.code = 'HUDDLE_RECIPIENT_SENDER_INVALID';
      throw error;
    }

    const [existingRows] = await connection.query(`
      SELECT user_id
      FROM virtual_huddle_recipients
      WHERE virtual_huddle_message_id = ?
      FOR UPDATE
    `, [safeMessageId]);
    const existingUserIds = new Set(existingRows.map((row) => normalizeId(row.user_id)).filter(Boolean));
    const newUserIds = selectedUserIds.filter((userId) => !existingUserIds.has(userId));
    if (newUserIds.length === 0) {
      const error = new Error('The selected employees are already recipients of this Huddle.');
      error.code = 'HUDDLE_RECIPIENT_ALREADY_INCLUDED';
      throw error;
    }

    for (const userId of newUserIds) {
      const user = activeById.get(userId);
      const acknowledgmentMode = huddlePolicy.getAcknowledgmentMode({
        messageTypeCode: message.message_type_code,
        senderRoleCodes: [message.sender_role_code_snapshot],
        recipientRoleCodes: [user.primary_role_code]
      });
      const recipientState = huddlePolicy.getInitialRecipientState(acknowledgmentMode);

      await connection.query(`
        INSERT INTO virtual_huddle_targets (
          virtual_huddle_message_id,
          target_type_code,
          target_user_id,
          target_user_name_snapshot
        ) VALUES (?, 'user', ?, ?)
      `, [safeMessageId, userId, user.display_name]);

      await connection.query(`
        INSERT INTO virtual_huddle_recipients (
          virtual_huddle_message_id,
          user_id,
          user_name_snapshot,
          role_code_snapshot,
          acknowledgment_mode_code,
          recipient_state_code
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        safeMessageId,
        userId,
        user.display_name,
        user.primary_role_code,
        acknowledgmentMode,
        recipientState
      ]);
    }

    await connection.commit();
    return {
      messageId: safeMessageId,
      subject: message.subject,
      userIds: newUserIds,
      count: newUserIds.length
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeRecipient({ messageId, recipientId, actorUserId, reason }) {
  const safeMessageId = normalizeId(messageId);
  const safeRecipientId = normalizeId(recipientId);
  const safeActorId = normalizeId(actorUserId);
  const safeReason = normalizeText(reason, 1000);
  if (!safeMessageId || !safeRecipientId || !safeActorId) {
    const error = new Error('The revocation request is invalid.');
    error.code = 'HUDDLE_REVOCATION_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const recipient = await getRecipientForUpdate(connection, safeRecipientId);
    if (!recipient || Number(recipient.virtual_huddle_message_id) !== safeMessageId) {
      const error = new Error('The selected recipient record no longer exists.');
      error.code = 'HUDDLE_RECIPIENT_NOT_FOUND';
      throw error;
    }
    if (!huddlePolicy.canRevokeRecipient({
      acknowledgmentMode: recipient.acknowledgment_mode_code,
      recipientStateCode: recipient.recipient_state_code
    })) {
      const error = new Error('Only an awaiting required acknowledgment can be revoked.');
      error.code = 'HUDDLE_REVOKE_INVALID_STATE';
      throw error;
    }

    await connection.query(`
      UPDATE virtual_huddle_recipients
      SET recipient_state_code = 'revoked',
          revoked_by_user_id = ?,
          revoked_at = CURRENT_TIMESTAMP(6),
          revocation_reason = ?
      WHERE virtual_huddle_recipient_id = ?
    `, [safeActorId, safeReason || null, safeRecipientId]);
    await connection.commit();
    return { userId: normalizeId(recipient.user_id) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeAllAwaiting({ messageId, actorUserId, reason }) {
  const safeMessageId = normalizeId(messageId);
  const safeActorId = normalizeId(actorUserId);
  const safeReason = normalizeText(reason, 1000);
  if (!safeMessageId || !safeActorId) {
    const error = new Error('The revocation request is invalid.');
    error.code = 'HUDDLE_REVOCATION_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT virtual_huddle_recipient_id, user_id
      FROM virtual_huddle_recipients
      WHERE virtual_huddle_message_id = ?
        AND acknowledgment_mode_code = 'required_ack'
        AND recipient_state_code = 'awaiting_confirmation'
      FOR UPDATE
    `, [safeMessageId]);

    if (rows.length > 0) {
      await connection.query(`
        UPDATE virtual_huddle_recipients
        SET recipient_state_code = 'revoked',
            revoked_by_user_id = ?,
            revoked_at = CURRENT_TIMESTAMP(6),
            revocation_reason = ?
        WHERE virtual_huddle_message_id = ?
          AND acknowledgment_mode_code = 'required_ack'
          AND recipient_state_code = 'awaiting_confirmation'
      `, [safeActorId, safeReason || null, safeMessageId]);
    }
    await connection.commit();
    return {
      count: rows.length,
      userIds: rows.map((row) => normalizeId(row.user_id)).filter(Boolean)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function requireRecipientAgain({ messageId, recipientId }) {
  const safeMessageId = normalizeId(messageId);
  const safeRecipientId = normalizeId(recipientId);
  if (!safeMessageId || !safeRecipientId) {
    const error = new Error('The Require Again request is invalid.');
    error.code = 'HUDDLE_REQUIRE_AGAIN_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const recipient = await getRecipientForUpdate(connection, safeRecipientId);
    if (!recipient || Number(recipient.virtual_huddle_message_id) !== safeMessageId) {
      const error = new Error('The selected recipient record no longer exists.');
      error.code = 'HUDDLE_RECIPIENT_NOT_FOUND';
      throw error;
    }
    if (recipient.acknowledgment_mode_code !== 'required_ack' || recipient.recipient_state_code !== 'revoked') {
      const error = new Error('Only a revoked required acknowledgment can be required again.');
      error.code = 'HUDDLE_REQUIRE_AGAIN_INVALID_STATE';
      throw error;
    }

    await connection.query(`
      UPDATE virtual_huddle_recipients
      SET recipient_state_code = 'awaiting_confirmation',
          revoked_by_user_id = NULL,
          revoked_at = NULL,
          revocation_reason = NULL
      WHERE virtual_huddle_recipient_id = ?
    `, [safeRecipientId]);

    await connection.commit();
    return {
      userId: normalizeId(recipient.user_id),
      recipientId: safeRecipientId,
      messageId: safeMessageId
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function hardDeleteMessage(messageId) {
  const safeMessageId = normalizeId(messageId);
  if (!safeMessageId) return null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [messageRows] = await connection.query(`
      SELECT virtual_huddle_message_id, subject
      FROM virtual_huddle_messages
      WHERE virtual_huddle_message_id = ?
      LIMIT 1
      FOR UPDATE
    `, [safeMessageId]);
    if (!messageRows[0]) {
      await connection.rollback();
      return null;
    }

    const [recipientRows] = await connection.query(`
      SELECT user_id
      FROM virtual_huddle_recipients
      WHERE virtual_huddle_message_id = ?
    `, [safeMessageId]);

    await connection.query('DELETE FROM virtual_huddle_messages WHERE virtual_huddle_message_id = ?', [safeMessageId]);
    await connection.commit();
    return {
      subject: messageRows[0].subject,
      userIds: recipientRows.map((row) => normalizeId(row.user_id)).filter(Boolean)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listPersonalHistory(userId, {
  page = 1,
  pageSize = 50,
  status = 'pending',
  messageType = 'all',
  search = '',
  sort = 'sent_desc'
} = {}) {
  const safeUserId = normalizeId(userId);
  if (!safeUserId) {
    return {
      items: [], page: 1, pageSize: 50, totalCount: 0, totalPages: 1,
      statusFilter: 'pending', messageTypeFilter: 'all', searchTerm: '', sort: 'sent_desc', archiveAfterDays: HUDDLE_AUTO_ARCHIVE_DAYS
    };
  }
  const safePageSize = Math.min(100, Math.max(10, Number.parseInt(pageSize, 10) || 50));
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const allowedStatuses = new Set(['pending', 'acknowledged', 'archived']);
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const statusFilter = allowedStatuses.has(normalizedStatus) ? normalizedStatus : 'pending';
  const allowedTypes = new Set(['all', 'standard', 'priority', 'urgent']);
  const rawMessageType = Array.isArray(messageType) ? messageType[messageType.length - 1] : messageType;
  const normalizedMessageType = String(rawMessageType || '').trim().toLowerCase();
  const messageTypeFilter = allowedTypes.has(normalizedMessageType) ? normalizedMessageType : 'all';
  const searchTerm = normalizeText(search, 150);
  const sortOptions = {
    message_asc: 'm.subject ASC, r.virtual_huddle_recipient_id ASC',
    message_desc: 'm.subject DESC, r.virtual_huddle_recipient_id DESC',
    type_asc: `CASE m.message_type_code WHEN 'standard' THEN 10 WHEN 'priority' THEN 20 WHEN 'urgent' THEN 30 ELSE 99 END ASC, m.sent_at DESC`,
    type_desc: `CASE m.message_type_code WHEN 'urgent' THEN 10 WHEN 'priority' THEN 20 WHEN 'standard' THEN 30 ELSE 99 END ASC, m.sent_at DESC`,
    sender_asc: 'm.sender_name_snapshot ASC, m.sent_at DESC',
    sender_desc: 'm.sender_name_snapshot DESC, m.sent_at DESC',
    sent_asc: 'm.sent_at ASC, r.virtual_huddle_recipient_id ASC',
    sent_desc: 'm.sent_at DESC, r.virtual_huddle_recipient_id DESC',
    acknowledged_asc: 'r.acknowledged_at ASC, m.sent_at ASC',
    acknowledged_desc: 'r.acknowledged_at DESC, m.sent_at DESC'
  };
  const normalizedSort = Object.prototype.hasOwnProperty.call(sortOptions, String(sort || '').trim().toLowerCase())
    ? String(sort).trim().toLowerCase()
    : 'sent_desc';
  const orderBySql = sortOptions[normalizedSort];
  const applicationSettings = await applicationSettingsModel.getApplicationSettings();
  const archiveAfterDays = applicationSettingsModel.normalizeHuddleArchiveDays(
    applicationSettings.huddleArchiveDays,
    HUDDLE_AUTO_ARCHIVE_DAYS
  );
  const recipientSummarySql = `
    SELECT
      virtual_huddle_message_id,
      SUM(recipient_state_code = 'awaiting_confirmation') AS awaiting_count,
      MAX(CASE
        WHEN acknowledgment_mode_code = 'required_ack' AND recipient_state_code = 'acknowledged' THEN acknowledged_at
        WHEN acknowledgment_mode_code = 'required_ack' AND recipient_state_code = 'revoked' THEN revoked_at
        ELSE NULL
      END) AS required_resolved_at
    FROM virtual_huddle_recipients
    GROUP BY virtual_huddle_message_id
  `;
  const archiveCondition = `(COALESCE(summary.awaiting_count, 0) = 0 AND COALESCE(summary.required_resolved_at, m.sent_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${archiveAfterDays} DAY))`;
  const filters = ['r.user_id = ?', "m.message_type_code <> 'notice'"];
  const params = [safeUserId];

  if (statusFilter === 'pending') {
    filters.push(`(
      (r.acknowledgment_mode_code = 'required_ack' AND r.recipient_state_code = 'awaiting_confirmation')
      OR (r.acknowledgment_mode_code = 'optional_ack' AND r.recipient_state_code = 'available')
    )`);
  } else if (statusFilter === 'acknowledged') {
    filters.push("r.recipient_state_code = 'acknowledged'");
    filters.push(`NOT ${archiveCondition}`);
  } else {
    filters.push("r.recipient_state_code = 'acknowledged'");
    filters.push(archiveCondition);
  }

  if (messageTypeFilter !== 'all') {
    filters.push('m.message_type_code = ?');
    params.push(messageTypeFilter);
  }
  if (searchTerm) {
    const like = `%${searchTerm}%`;
    filters.push('(m.subject LIKE ? OR m.message_body LIKE ? OR m.sender_name_snapshot LIKE ?)');
    params.push(like, like, like);
  }

  const whereSql = filters.join('\n      AND ');
  const [[countRow]] = await pool.query(`
    SELECT COUNT(*) AS total_count
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN (${recipientSummarySql}) summary ON summary.virtual_huddle_message_id = m.virtual_huddle_message_id
    WHERE ${whereSql}
  `, params);
  const totalCount = Number(countRow?.total_count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const normalizedPage = Math.min(safePage, totalPages);
  const offset = (normalizedPage - 1) * safePageSize;

  const [rows] = await pool.query(`
    SELECT
      r.virtual_huddle_recipient_id,
      r.virtual_huddle_message_id,
      r.acknowledgment_mode_code,
      r.recipient_state_code,
      r.dismissed_at,
      r.acknowledged_at,
      m.message_type_code,
      m.subject,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      ${archiveCondition} AS is_auto_archived
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN (${recipientSummarySql}) summary ON summary.virtual_huddle_message_id = m.virtual_huddle_message_id
    WHERE ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ? OFFSET ?
  `, [...params, safePageSize, offset]);

  return {
    items: rows,
    page: normalizedPage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
    statusFilter,
    messageTypeFilter,
    searchTerm,
    sort: normalizedSort,
    archiveAfterDays
  };
}

async function listAcknowledgedHistory(userId) {
  const safeUserId = normalizeId(userId);
  if (!safeUserId) return [];
  const [rows] = await pool.query(`
    SELECT
      r.virtual_huddle_recipient_id,
      r.virtual_huddle_message_id,
      r.acknowledgment_phrase_snapshot,
      r.acknowledgment_note,
      r.acknowledged_at,
      m.message_type_code,
      m.subject,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      m.parent_message_id
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    WHERE r.user_id = ?
      AND r.recipient_state_code = 'acknowledged'
    ORDER BY r.acknowledged_at DESC, r.virtual_huddle_recipient_id DESC
  `, [safeUserId]);
  return rows;
}

async function getPersonalRecipientDetail(recipientId, userId) {
  const safeRecipientId = normalizeId(recipientId);
  const safeUserId = normalizeId(userId);
  if (!safeRecipientId || !safeUserId) return null;
  const [rows] = await pool.query(`
    SELECT
      r.*,
      m.message_type_code,
      m.subject,
      m.message_body,
      m.confirmation_phrase,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      m.parent_message_id,
      parent.subject AS parent_subject
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN virtual_huddle_messages parent
      ON parent.virtual_huddle_message_id = m.parent_message_id
    WHERE r.virtual_huddle_recipient_id = ?
      AND r.user_id = ?
      AND m.message_type_code <> 'notice'
    LIMIT 1
  `, [safeRecipientId, safeUserId]);
  return rows[0] || null;
}

async function getAcknowledgedRecipientDetail(recipientId, userId) {
  const safeRecipientId = normalizeId(recipientId);
  const safeUserId = normalizeId(userId);
  if (!safeRecipientId || !safeUserId) return null;
  const [rows] = await pool.query(`
    SELECT
      r.*,
      m.message_type_code,
      m.subject,
      m.message_body,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      m.parent_message_id,
      parent.subject AS parent_subject
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN virtual_huddle_messages parent
      ON parent.virtual_huddle_message_id = m.parent_message_id
    WHERE r.virtual_huddle_recipient_id = ?
      AND r.user_id = ?
      AND r.recipient_state_code = 'acknowledged'
    LIMIT 1
  `, [safeRecipientId, safeUserId]);
  return rows[0] || null;
}

async function listAdminOptionalInbox(userId) {
  const safeUserId = normalizeId(userId);
  if (!safeUserId) return [];
  const [rows] = await pool.query(`
    SELECT
      r.virtual_huddle_recipient_id,
      r.virtual_huddle_message_id,
      r.dismissed_at,
      m.message_type_code,
      m.subject,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    WHERE r.user_id = ?
      AND r.acknowledgment_mode_code = 'optional_ack'
      AND r.recipient_state_code = 'available'
    ORDER BY m.sent_at DESC, r.virtual_huddle_recipient_id DESC
  `, [safeUserId]);
  return rows;
}

async function getAdminOptionalInboxDetail(recipientId, userId) {
  const safeRecipientId = normalizeId(recipientId);
  const safeUserId = normalizeId(userId);
  if (!safeRecipientId || !safeUserId) return null;
  const [rows] = await pool.query(`
    SELECT
      r.*,
      m.message_type_code,
      m.subject,
      m.message_body,
      m.confirmation_phrase,
      m.sender_name_snapshot,
      m.sender_role_code_snapshot,
      m.sent_at,
      m.parent_message_id,
      parent.subject AS parent_subject
    FROM virtual_huddle_recipients r
    INNER JOIN virtual_huddle_messages m
      ON m.virtual_huddle_message_id = r.virtual_huddle_message_id
    LEFT JOIN virtual_huddle_messages parent
      ON parent.virtual_huddle_message_id = m.parent_message_id
    WHERE r.virtual_huddle_recipient_id = ?
      AND r.user_id = ?
      AND r.acknowledgment_mode_code = 'optional_ack'
      AND r.recipient_state_code = 'available'
    LIMIT 1
  `, [safeRecipientId, safeUserId]);
  return rows[0] || null;
}

module.exports = {
  acknowledgeRecipient,
  addRecipients,
  createVirtualHuddle,
  deleteOwnOptionalRecipient,
  dismissRecipient,
  getAcknowledgedRecipientDetail,
  getAdminOptionalInboxDetail,
  getManagementMessageDetail,
  getPersonalRecipientDetail,
  getNextPresentation,
  getTargetSelection,
  hardDeleteMessage,
  hasPendingRequiredAcknowledgment,
  listAcknowledgedHistory,
  listActiveUsers,
  listAdminOptionalInbox,
  listManagementHistory,
  listPersonalHistory,
  normalizeId,
  previewAudience,
  requireRecipientAgain,
  revokeAllAwaiting,
  revokeRecipient
};
