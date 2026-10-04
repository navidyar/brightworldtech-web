'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, getPermissionDefinition } = require('../config/permissionCatalog');

test('permission catalog uses plain-language definitions for completion credit and team QC scope', () => {
  const completion = getPermissionDefinition('units.completion_attribution.change');
  assert.equal(completion.name, 'Choose Unit Completion Credit');
  assert.match(completion.description, /yourself or the technician currently assigned/i);
  assert.match(completion.description, /does not change the Unit assignment/i);
  const qc = getPermissionDefinition('qc.summary.cross_technician');
  assert.equal(qc.name, 'View Team QC Summary');
  assert.match(qc.description, /all technicians or a selected technician/i);
  assert.match(qc.description, /limited to the signed-in user/i);
});

test('all permission descriptions are substantive and Tool PIN/login monitoring boundaries are explicit', () => {
  assert.equal(PERMISSIONS.length, 102);
  for (const permission of PERMISSIONS) {
    assert.ok(permission.description.trim().length >= 12, permission.permissionKey);
  }
  assert.match(getPermissionDefinition('users.tool_pin.manage').description, /does not grant access to ScanTools or TechTools/i);
  assert.match(getPermissionDefinition('users.login_inactivity.monitor').description, /monitoring setting, not an access grant/i);
  assert.equal(getPermissionDefinition('huddle.personal.view').name, 'View Own Huddles');
});
