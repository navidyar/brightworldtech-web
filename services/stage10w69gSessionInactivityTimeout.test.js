'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  parseSessionInactivityTimeoutMinutes,
  normalizeSessionInactivityTimeoutMinutes,
  formatSessionInactivityTimeout
} = require('./sessionInactivityTimeoutPolicy');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('session inactivity timeout defaults to two hours with bounded Admin configuration', () => {
  assert.equal(DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES, 120);
  assert.equal(MIN_SESSION_INACTIVITY_TIMEOUT_MINUTES, 5);
  assert.equal(MAX_SESSION_INACTIVITY_TIMEOUT_MINUTES, 1440);
  assert.equal(parseSessionInactivityTimeoutMinutes('120'), 120);
  assert.equal(parseSessionInactivityTimeoutMinutes('5'), 5);
  assert.equal(parseSessionInactivityTimeoutMinutes('1440'), 1440);
  assert.equal(parseSessionInactivityTimeoutMinutes('4'), null);
  assert.equal(parseSessionInactivityTimeoutMinutes('1441'), null);
  assert.equal(parseSessionInactivityTimeoutMinutes('2.5'), null);
  assert.equal(normalizeSessionInactivityTimeoutMinutes('invalid'), 120);
  assert.equal(formatSessionInactivityTimeout(120), '2 hours');
});

test('session timeout has a stable Security Settings system identity', () => {
  assert.equal(SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES, 122);
  const registry = read('config/configIdentityRegistry.js');
  assert.match(registry, /Session inactivity timeout minutes/);
  assert.match(registry, /categorySystemId: SYSTEM_CONFIG_CATEGORY_IDS\.SECURITY_SETTINGS/);
});

test('session middleware uses configured timeout and server fallback is 120 minutes', () => {
  const server = read('server.js');
  const middleware = read('middleware/sessionTimeoutMiddleware.js');
  const navigationPolicy = read('middleware/navigationPolicyMiddleware.js');

  assert.match(server, /maxAge: 1000 \* 60 \* DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES/);
  assert.match(server, /app\.use\(applyConfiguredSessionTimeout\);\s*app\.use\(loadCurrentUser\);/);
  assert.match(middleware, /req\.session\.cookie\.maxAge = timeoutMs/);
  assert.match(middleware, /req\.sessionInactivityTimeoutMs = timeoutMs/);
  assert.match(navigationPolicy, /req\.session\?\.cookie\?\.originalMaxAge/);
});

test('login regeneration reapplies the configured timeout', () => {
  const authController = read('controllers/authController.js');
  assert.match(authController, /req\.session\.cookie\.maxAge = req\.sessionInactivityTimeoutMs/);
});

test('Admin configuration validates and immediately caches Session inactivity timeout changes', () => {
  const controller = read('controllers/configController.js');
  const modal = read('views/fragments/config-value-form-modal.ejs');
  const routes = read('routes/config.js');

  assert.match(controller, /parseSessionInactivityTimeoutMinutes\(formData\.value\)/);
  assert.match(controller, /setCachedSessionInactivityTimeoutMinutes\(timeoutMinutes\)/);
  assert.match(controller, /req\.session\.cookie\.maxAge = timeoutMinutes \* 60 \* 1000/);
  assert.match(controller, /isRequiredSecuritySetting/);
  assert.match(modal, /Session inactivity timeout \(minutes\)/);
  assert.match(modal, /min="5" max="1440"/);
  assert.match(modal, /120 minutes \(2 hours\)/);
  assert.match(routes, /const configRoles = \['admin'\]/);
});

test('migration is audit-first, creates the 120-minute protected setting, and binds system ID 122', () => {
  const migration = read('scripts/migrateSessionInactivityTimeout.js');
  const pkg = JSON.parse(read('package.json'));

  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /create_session_inactivity_timeout_default_120/);
  assert.match(migration, /system_config_values/);
  assert.match(migration, /is_protected = 1/);
  assert.equal(pkg.scripts['audit:session-inactivity-timeout'], 'node scripts/migrateSessionInactivityTimeout.js');
  assert.equal(pkg.scripts['migrate:session-inactivity-timeout'], 'node scripts/migrateSessionInactivityTimeout.js --apply');
});
