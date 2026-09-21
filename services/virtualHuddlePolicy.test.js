'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const policy = require('../config/virtualHuddlePolicy');

const {
  HUDDLE_ACKNOWLEDGMENT_MODES,
  HUDDLE_CONFIRMATION_PHRASE,
  HUDDLE_RECIPIENT_STATE_CODES
} = policy;

test('Virtual Huddle sending is limited to assigned Management+ roles', () => {
  assert.equal(policy.canSendVirtualHuddle(['admin']), true);
  assert.equal(policy.canSendVirtualHuddle(['management']), true);
  assert.equal(policy.canSendVirtualHuddle(['tech_lead']), false);
  assert.equal(policy.canSendVirtualHuddle(['qc']), false);
  assert.equal(policy.canSendVirtualHuddle(['tech']), false);
});

test('notice messages are informational for every recipient role', () => {
  for (const recipientRole of ['admin', 'management', 'tech_lead', 'qc', 'tech']) {
    assert.equal(
      policy.getAcknowledgmentMode({
        messageTypeCode: 'notice',
        senderRoleCodes: ['management'],
        recipientRoleCodes: [recipientRole]
      }),
      HUDDLE_ACKNOWLEDGMENT_MODES.INFORMATIONAL
    );
  }
});

test('Management messages to Admin use optional acknowledgment while peers and lower roles remain required', () => {
  assert.equal(
    policy.getAcknowledgmentMode({
      messageTypeCode: 'priority',
      senderRoleCodes: ['management'],
      recipientRoleCodes: ['admin']
    }),
    HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL
  );

  for (const recipientRole of ['management', 'tech_lead', 'qc', 'tech']) {
    assert.equal(
      policy.getAcknowledgmentMode({
        messageTypeCode: 'priority',
        senderRoleCodes: ['management'],
        recipientRoleCodes: [recipientRole]
      }),
      HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED
    );
  }
});

test('Admin messages require acknowledgment from equal and lower roles', () => {
  for (const recipientRole of ['admin', 'management', 'tech_lead', 'qc', 'tech']) {
    assert.equal(
      policy.getAcknowledgmentMode({
        messageTypeCode: 'urgent',
        senderRoleCodes: ['admin'],
        recipientRoleCodes: [recipientRole]
      }),
      HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED
    );
  }
});

test('initial recipient state is derived from acknowledgment mode', () => {
  assert.equal(
    policy.getInitialRecipientState(HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED),
    HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION
  );
  assert.equal(
    policy.getInitialRecipientState(HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL),
    HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  );
  assert.equal(
    policy.getInitialRecipientState(HUDDLE_ACKNOWLEDGMENT_MODES.INFORMATIONAL),
    HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  );
});

test('required and optional recipients can acknowledge only from their valid pending state', () => {
  assert.equal(policy.canAcknowledgeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION
  }), true);
  assert.equal(policy.canAcknowledgeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  }), true);
  assert.equal(policy.canAcknowledgeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.INFORMATIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  }), false);
  assert.equal(policy.canAcknowledgeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.ACKNOWLEDGED
  }), false);
});

test('only an awaiting required acknowledgment can be revoked', () => {
  assert.equal(policy.canRevokeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION
  }), true);
  assert.equal(policy.canRevokeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.ACKNOWLEDGED
  }), false);
  assert.equal(policy.canRevokeRecipient({
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  }), false);
});

test('Admin can delete their own ignored optional recipient copy but not a required or acknowledged copy through that action', () => {
  assert.equal(policy.canDeleteOwnOptionalRecipientRecord({
    actorRoleCodes: ['admin'],
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  }), true);
  assert.equal(policy.canDeleteOwnOptionalRecipientRecord({
    actorRoleCodes: ['management'],
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AVAILABLE
  }), false);
  assert.equal(policy.canDeleteOwnOptionalRecipientRecord({
    actorRoleCodes: ['admin'],
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.REQUIRED,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.AWAITING_CONFIRMATION
  }), false);
  assert.equal(policy.canDeleteOwnOptionalRecipientRecord({
    actorRoleCodes: ['admin'],
    acknowledgmentMode: HUDDLE_ACKNOWLEDGMENT_MODES.OPTIONAL,
    recipientStateCode: HUDDLE_RECIPIENT_STATE_CODES.ACKNOWLEDGED
  }), false);
});

test('hard deletion authority is Admin-only', () => {
  assert.equal(policy.canAdminHardDeleteVirtualHuddle(['admin']), true);
  assert.equal(policy.canAdminHardDeleteVirtualHuddle(['management']), false);
});

test('confirmation phrase is fixed and compared case-insensitively with surrounding whitespace ignored', () => {
  assert.equal(HUDDLE_CONFIRMATION_PHRASE, 'READ AND UNDERSTOOD');
  assert.equal(policy.isConfirmationPhraseMatch('READ AND UNDERSTOOD'), true);
  assert.equal(policy.isConfirmationPhraseMatch('  Read and understood  '), true);
  assert.equal(policy.isConfirmationPhraseMatch('READ & UNDERSTOOD'), false);
  assert.equal(policy.isConfirmationPhraseMatch(''), false);
});

test('mandatory queue order is urgent, priority, standard, then informational notice', () => {
  assert.ok(policy.getMessagePriorityOrder('urgent') < policy.getMessagePriorityOrder('priority'));
  assert.ok(policy.getMessagePriorityOrder('priority') < policy.getMessagePriorityOrder('standard'));
  assert.ok(policy.getMessagePriorityOrder('standard') < policy.getMessagePriorityOrder('notice'));
});
