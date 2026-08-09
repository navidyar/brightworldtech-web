'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSelfRoleLockCode,
  isSelfRoleLocked,
  isAdminSelfRoleLocked,
  isManagementSelfRoleLocked,
  isSubmittedRoleChange
} = require('./managementUserRoleEditPolicy');

test('Management users are locked from editing their own role', () => {
  const context = {
    actorUser: { user_id: 14, roles: ['management'] },
    targetUserId: 14
  };

  assert.equal(getSelfRoleLockCode(context), 'management');
  assert.equal(isSelfRoleLocked(context), true);
  assert.equal(isManagementSelfRoleLocked(context), true);
});

test('Management users may still edit roles for other permitted users', () => {
  assert.equal(isManagementSelfRoleLocked({
    actorUser: { user_id: 14, roles: ['management'] },
    targetUserId: 15
  }), false);
});

test('Admin users are locked from demoting their own account', () => {
  const context = {
    actorUser: { user_id: 1, roles: ['admin', 'management'] },
    targetUserId: 1
  };

  assert.equal(getSelfRoleLockCode(context), 'admin');
  assert.equal(isSelfRoleLocked(context), true);
  assert.equal(isAdminSelfRoleLocked(context), true);
  assert.equal(isManagementSelfRoleLocked(context), false);
});

test('submitted role tampering is detected while omitted or unchanged roles are accepted', () => {
  assert.equal(isSubmittedRoleChange({
    submittedRoleCodes: ['tech_lead'],
    currentRoleCodes: ['management']
  }), true);
  assert.equal(isSubmittedRoleChange({
    submittedRoleCodes: ['management'],
    currentRoleCodes: ['management']
  }), false);
  assert.equal(isSubmittedRoleChange({
    submittedRoleCodes: [],
    currentRoleCodes: ['management']
  }), false);
});
