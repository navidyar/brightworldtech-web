'use strict';

const accessPolicy = require('../config/accessPolicy');
const huddlePolicy = require('../config/virtualHuddlePolicy');

function normalizeId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIdList(values) {
  const list = Array.isArray(values) ? values : (values ? [values] : []);
  return [...new Set(list.map(normalizeId).filter(Boolean))];
}

function normalizeRoleList(values) {
  const list = Array.isArray(values) ? values : (values ? [values] : []);
  return [...new Set(list.map((value) => String(value || '').trim()).filter(Boolean))];
}

function validateTargetRoles(targetRoleCodes) {
  const normalized = normalizeRoleList(targetRoleCodes);
  const invalid = normalized.filter((roleCode) => !accessPolicy.ACCOUNT_ROLE_CODES.includes(roleCode));
  if (invalid.length > 0) {
    throw new Error(`Unsupported recipient role: ${invalid.join(', ')}`);
  }
  return normalized;
}

function buildAudienceFromUsers({
  activeUsers,
  senderUserId,
  senderRoleCodes,
  targetRoleCodes,
  targetUserIds,
  messageTypeCode
}) {
  const normalizedTargetRoles = validateTargetRoles(targetRoleCodes);
  const normalizedTargetUserIds = normalizeIdList(targetUserIds);
  const targetUserSet = new Set(normalizedTargetUserIds);
  const targetRoleSet = new Set(normalizedTargetRoles);
  const senderId = normalizeId(senderUserId);

  const explicitMissing = normalizedTargetUserIds.filter(
    (userId) => !activeUsers.some((user) => Number(user.user_id) === userId)
  );
  if (explicitMissing.length > 0) {
    const error = new Error('One or more individually selected recipients are no longer active. Review the audience before sending.');
    error.code = 'HUDDLE_RECIPIENT_UNAVAILABLE';
    throw error;
  }

  const recipients = [];
  for (const user of activeUsers) {
    if (Number(user.user_id) === senderId) continue;

    const selectedByRole = targetRoleSet.has(user.primary_role_code);
    const selectedIndividually = targetUserSet.has(Number(user.user_id));
    if (!selectedByRole && !selectedIndividually) continue;

    const acknowledgmentMode = huddlePolicy.getAcknowledgmentMode({
      messageTypeCode,
      senderRoleCodes,
      recipientRoleCodes: [user.primary_role_code]
    });

    recipients.push({
      ...user,
      acknowledgment_mode_code: acknowledgmentMode,
      recipient_state_code: huddlePolicy.getInitialRecipientState(acknowledgmentMode),
      selected_by_role: selectedByRole,
      selected_individually: selectedIndividually
    });
  }

  if (recipients.length === 0) {
    const error = new Error('Select at least one active recipient other than yourself.');
    error.code = 'HUDDLE_EMPTY_AUDIENCE';
    throw error;
  }

  return {
    targetRoleCodes: normalizedTargetRoles,
    targetUserIds: normalizedTargetUserIds,
    recipients
  };
}

module.exports = {
  buildAudienceFromUsers,
  normalizeIdList,
  normalizeRoleList,
  validateTargetRoles
};
