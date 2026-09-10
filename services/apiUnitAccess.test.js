'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseUnitApi } = require('./apiUnitAccess');

test('Tech operational roles can use Unit API workflows', () => {
  for (const role of ['tech', 'tech_lead', 'management', 'admin']) {
    assert.equal(canUseUnitApi({ roles: [role] }), true, role);
  }
});

test('QC-only and roleless users cannot use Unit API workflows', () => {
  assert.equal(canUseUnitApi({ roles: ['qc'] }), false);
  assert.equal(canUseUnitApi({ roles: [] }), false);
});
