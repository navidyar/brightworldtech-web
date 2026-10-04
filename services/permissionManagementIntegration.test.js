'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Stage 3 adds management services without wiring permission mutations into routes yet', () => {
  const managementRoutes = read('routes/management.js');
  const server = read('server.js');
  assert.equal(managementRoutes.includes('permissionManagementService'), false);
  assert.equal(server.includes('permissionManagementService'), false);
});

test('role gates remain while user override mutations use granular access', () => {
  const managementRoutes = read('routes/management.js');
  assert.match(managementRoutes, /requirePermission\('user_permissions\.manage'\)/);
  assert.match(managementRoutes, /requireRole\(/);
});

test('permission management model uses the Stage 1 audit and override tables', () => {
  const source = read('models/permissionManagementModel.js');
  assert.match(source, /permission_audit_events/);
  assert.match(source, /user_permission_overrides/);
  assert.match(source, /role_permissions/);
  assert.match(source, /user_roles/);
});
