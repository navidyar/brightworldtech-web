'use strict';

const {
  ROLE_HIERARCHY,
  getPrimaryRole,
  hasAnyAssignedRole
} = require('./accessPolicy');

const HUDDLE_SENDER_ROLE_CODES = Object.freeze(['admin', 'management']);
const HUDDLE_MESSAGE_TYPE_CODES = Object.freeze(['notice', 'standard', 'priority', 'urgent']);
const HUDDLE_ACKNOWLEDGMENT_MODES = Object.freeze({
  INFORMATIONAL: 'informational',
  OPTIONAL: 'optional_ack',
  REQUIRED: 'required_ack'
});
const HUDDLE_RECIPIENT_STATE_CODES = Object.freeze({
  AVAILABLE: 'available',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  ACKNOWLEDGED: 'acknowledged',
  REVOKED: 'revoked'
});
const HUDDLE_CONFIRMATION_PHRASE = 'READ AND UNDERSTOOD';
const HUDDLE_PRIORITY_ORDER = Object.freeze({
  urgent: 10,
  priority: 20,
  standard: 30,
  notice: 40
});

function normalizeRoleCodes(roleCodes) {
  if (Array.isArray(roleCodes)) {
    return roleCodes.map((roleCode) => String(roleCode || '').trim()).filter(Boolean);
  }

  const roleCode = String(roleCodes || '').trim();
  return roleCode ? [roleCode] : [];
}

function normalizeMessageType(messageTypeCode) {
  return String(messageTypeCode || '').trim().toLowerCase();
}

function assertMessageType(messageTypeCode) {
  const normalized = normalizeMessageType(messageTypeCode);

  if (!HUDDLE_MESSAGE_TYPE_CODES.includes(normalized)) {
    throw new Error(`Unsupported Virtual Huddle message type: ${messageTypeCode || '(blank)'}`);
  }

  return normalized;
}

function getRolePosition(roleCodes) {
  const primaryRole = getPrimaryRole(normalizeRoleCodes(roleCodes));
  const position = ROLE_HIERARCHY.indexOf(primaryRole);
  return position >= 0 ? position : null;
}

function isRecipientHigherRole(senderRoleCodes, recipientRoleCodes) {
  const senderPosition = getRolePosition(senderRoleCodes);
  const recipientPosition = getRolePosition(recipientRoleCodes);

  if (senderPosition === null || recipientPosition === null) {
    return false;
  }

  return recipientPosition < senderPosition;
}

function canSendVirtualHuddle(roleCodes) {
  return hasAnyAssignedRole(normalizeRoleCodes(roleCodes), HUDDLE_SENDER_ROLE_CODES);
}

function canAdminHardDeleteVirtualHuddle(roleCodes) {
  return getPrimaryRole(normalizeRoleCodes(roleCodes)) === 'admin';
}

function getAcknowledgmentMode({ messageTypeCode, senderRoleCodes, recipientRoleCodes }) {
  const messageType = assertMessageType(messageTypeCode);

  if (messageType === 'notice') {
    return HUDDLE_ACKNOWLEDGMENT_MODES.INFORMATIONAL;
  }

  if (isRecipientHigherRole(senderRoleCodes, recipientRoleCodes)) {
    return HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL;
  }

  return HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED;
}

function getInitialRecipientState(acknowledgmentMode) {
  if (acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED) {
    return HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION;
  }

  if (
    acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL
    || acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.INFORMATIONAL
  ) {
    return HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE;
  }

  throw new Error(`Unsupported Virtual Huddle acknowledgment mode: ${acknowledgmentMode || '(blank)'}`);
}

function canAcknowledgeRecipient({ acknowledgmentMode, recipientStateCode }) {
  if (recipientStateCode === HUDDLE_RECIPIENT_STATE_CODES.ACKNOWLEDGED) {
    return false;
  }

  if (acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED) {
    return recipientStateCode === HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION;
  }

  if (acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL) {
    return recipientStateCode === HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE;
  }

  return false;
}

function canRevokeRecipient({ acknowledgmentMode, recipientStateCode }) {
  return acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED
    && recipientStateCode === HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION;
}

function canDeleteOwnOptionalRecipientRecord({ actorRoleCodes, acknowledgmentMode, recipientStateCode }) {
  return getPrimaryRole(normalizeRoleCodes(actorRoleCodes)) === 'admin'
    && acknowledgmentMode === HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL
    && recipientStateCode === HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE;
}

function normalizeConfirmationPhrase(value) {
  return String(value || '').trim().toUpperCase();
}

function isConfirmationPhraseMatch(value, expectedPhrase = HUDDLE_CONFIRMATION_PHRASE) {
  return normalizeConfirmationPhrase(value) === normalizeConfirmationPhrase(expectedPhrase);
}

function getMessagePriorityOrder(messageTypeCode) {
  const messageType = assertMessageType(messageTypeCode);
  return HUDDLE_PRIORITY_ORDER[messageType];
}

module.exports = {
  HUDDLE_SENDER_ROLE_CODES,
  HUDDLE_MESSAGE_TYPE_CODES,
  HUDDLE_ACKNOWLEDGMENT_MODES,
  HUDDLE_RECIPIENT_STATE_CODES,
  HUDDLE_CONFIRMATION_PHRASE,
  HUDDLE_PRIORITY_ORDER,
  assertMessageType,
  canSendVirtualHuddle,
  canAdminHardDeleteVirtualHuddle,
  canDeleteOwnOptionalRecipientRecord,
  canAcknowledgeRecipient,
  canRevokeRecipient,
  getAcknowledgmentMode,
  getInitialRecipientState,
  getMessagePriorityOrder,
  getRolePosition,
  isConfirmationPhraseMatch,
  isRecipientHigherRole,
  normalizeConfirmationPhrase
};
