'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('server loads permission context immediately after current-user authentication', () => {
  const server = read('server.js');
  const loadUserIndex = server.indexOf('app.use(loadCurrentUser);');
  const permissionIndex = server.indexOf('app.use(loadPermissionContext);');
  const navigationIndex = server.indexOf('app.use(applyAuthenticatedNavigationPolicy);');
  const accessLocalsIndex = server.indexOf('app.use(attachAccessLocals);');

  assert.ok(loadUserIndex >= 0, 'loadCurrentUser middleware is missing');
  assert.ok(permissionIndex > loadUserIndex, 'permission context must load after current user');
  assert.ok(navigationIndex > permissionIndex, 'permission context must load before authenticated navigation policy');
  assert.ok(accessLocalsIndex > permissionIndex, 'permission context must load before access locals');
});

test('legacy role and feature gates coexist with the fail-closed permission gate', () => {
  const authMiddleware = read('middleware/authMiddleware.js');

  assert.match(authMiddleware, /function requireRole\(allowedRoles\)/);
  assert.match(authMiddleware, /function requireFeature\(featureKey\)/);
  assert.match(authMiddleware, /accessPolicy\.canAccessFeature\(req\.currentUser\.roles, featureKey\)/);
  assert.match(authMiddleware, /function requirePermission\(permissionKey\)/);
  assert.match(authMiddleware, /req\.currentPermissions instanceof Set/);
});

test('permission context publishes helpers without changing legacy access locals', () => {
  const permissionMiddleware = read('middleware/permissionContextMiddleware.js');
  const accessMiddleware = read('middleware/accessMiddleware.js');

  assert.match(permissionMiddleware, /res\.locals\.hasPermission/);
  assert.match(permissionMiddleware, /res\.locals\.hasAnyPermission/);
  assert.match(permissionMiddleware, /res\.locals\.hasAllPermissions/);
  assert.match(accessMiddleware, /res\.locals\.canAccessFeature/);
  assert.match(accessMiddleware, /res\.locals\.canAccessMenuArea/);
});
