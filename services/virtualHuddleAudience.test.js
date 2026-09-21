'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAudienceFromUsers } = require('./virtualHuddleAudience');

const activeUsers = [
  { user_id: 1, display_name: 'Manager One', username: 'MAON', roles: ['management'], primary_role_code: 'management' },
  { user_id: 2, display_name: 'Admin One', username: 'ADON', roles: ['admin'], primary_role_code: 'admin' },
  { user_id: 3, display_name: 'Tech One', username: 'TEON', roles: ['tech'], primary_role_code: 'tech' },
  { user_id: 4, display_name: 'Tech Lead One', username: 'TLON', roles: ['tech_lead'], primary_role_code: 'tech_lead' },
  { user_id: 5, display_name: 'QC One', username: 'QCON', roles: ['qc'], primary_role_code: 'qc' }
];

test('role targeting uses exact assigned primary roles, deduplicates individual selections, and excludes sender', () => {
  const audience = buildAudienceFromUsers({
    activeUsers,
    senderUserId: 1,
    senderRoleCodes: ['management'],
    targetRoleCodes: ['tech', 'tech_lead'],
    targetUserIds: [3, 5],
    messageTypeCode: 'priority'
  });

  assert.deepEqual(audience.recipients.map((recipient) => recipient.user_id), [3, 4, 5]);
  assert.equal(audience.recipients.find((recipient) => recipient.user_id === 3).selected_by_role, true);
  assert.equal(audience.recipients.find((recipient) => recipient.user_id === 3).selected_individually, true);
  assert.equal(audience.recipients.some((recipient) => recipient.user_id === 1), false);
  assert.equal(audience.recipients.some((recipient) => recipient.user_id === 2), false);
});

test('Management to Admin becomes optional while equal/lower recipients remain required', () => {
  const audience = buildAudienceFromUsers({
    activeUsers,
    senderUserId: 1,
    senderRoleCodes: ['management'],
    targetRoleCodes: ['admin', 'tech'],
    targetUserIds: [],
    messageTypeCode: 'urgent'
  });

  const admin = audience.recipients.find((recipient) => recipient.user_id === 2);
  const tech = audience.recipients.find((recipient) => recipient.user_id === 3);
  assert.equal(admin.acknowledgment_mode_code, 'optional_ack');
  assert.equal(admin.recipient_state_code, 'available');
  assert.equal(tech.acknowledgment_mode_code, 'required_ack');
  assert.equal(tech.recipient_state_code, 'awaiting_confirmation');
});

test('Notice recipients are informational regardless of role', () => {
  const audience = buildAudienceFromUsers({
    activeUsers,
    senderUserId: 1,
    senderRoleCodes: ['management'],
    targetRoleCodes: ['admin', 'tech', 'qc'],
    targetUserIds: [],
    messageTypeCode: 'notice'
  });
  assert.ok(audience.recipients.every((recipient) => recipient.acknowledgment_mode_code === 'informational'));
  assert.ok(audience.recipients.every((recipient) => recipient.recipient_state_code === 'available'));
});

test('inactive or removed individual selections are rejected instead of silently changing the frozen audience', () => {
  assert.throws(() => buildAudienceFromUsers({
    activeUsers,
    senderUserId: 1,
    senderRoleCodes: ['management'],
    targetRoleCodes: [],
    targetUserIds: [99],
    messageTypeCode: 'standard'
  }), /no longer active/i);
});
