'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('catalog defines personal Huddle view permission and compatibility defaults preserve prior role access', () => {
  assert.equal(PERMISSION_KEYS.includes('huddle.personal.view'), true);
  for (const roleCode of ['admin', 'management', 'tech_lead', 'qc', 'tech']) {
    assert.equal(LEGACY_ROLE_GRANTS[roleCode].includes('huddle.personal.view'), true, roleCode);
  }
});

test('My Huddles history routes require huddle.personal.view', () => {
  const routes = read('routes/virtualHuddle.js');
  assert.match(routes, /router\.get\('\/my-huddles', requireAuth, requirePermission\('huddle\.personal\.view'\)/);
  assert.match(routes, /router\.get\('\/my-huddles\/accepted\/:recipientId', requireAuth, requirePermission\('huddle\.personal\.view'\)/);
  assert.match(routes, /router\.get\('\/my-huddles\/inbox\/:recipientId', requireAuth, requirePermission\('huddle\.personal\.view'\), requireRole\(adminRoles\)/);
});

test('required-message delivery and acknowledgment remain authenticated-only', () => {
  const routes = read('routes/virtualHuddle.js');
  for (const fragment of [
    "router.get('/virtual-huddle/events', requireAuth, virtualHuddleController.streamEvents)",
    "router.get('/virtual-huddle/current', requireAuth, virtualHuddleController.renderCurrentPresentation)",
    "router.get('/virtual-huddle/required', requireAuth, virtualHuddleController.renderRequiredPage)",
    "router.post('/virtual-huddle/recipients/:recipientId/acknowledge', requireAuth, virtualHuddleController.acknowledge)",
    "router.post('/virtual-huddle/recipients/:recipientId/dismiss', requireAuth, virtualHuddleController.dismiss)"
  ]) {
    assert.equal(routes.includes(fragment), true, fragment);
  }
});

test('sidebar exposes My Huddles only when huddle.personal.view is effective', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /hasPermission\('huddle\.personal\.view'\)/);
  assert.match(sidebar, /if \(canViewMyHuddles\)[\s\S]*?href="\/my-huddles"/);
});

test('migration seeds permission and compatibility role grants without replacing role configuration', () => {
  const migration = read('scripts/migrateHuddlePersonalViewPermission.js');
  assert.match(migration, /PERMISSION_KEY = 'huddle\.personal\.view'/);
  assert.match(migration, /INSERT IGNORE INTO role_permissions/);
  assert.doesNotMatch(migration, /DELETE FROM role_permissions/);
  assert.doesNotMatch(migration, /UPDATE role_permissions/);
});


test('My Huddles list and detail queries are always scoped to the signed-in recipient user', () => {
  const model = read('models/virtualHuddleModel.js');
  const history = model.match(/async function listAcknowledgedHistory[\s\S]*?return rows;\n}/)?.[0] || '';
  const detail = model.match(/async function getAcknowledgedRecipientDetail[\s\S]*?return rows\[0\] \|\| null;\n}/)?.[0] || '';
  const inbox = model.match(/async function getAdminOptionalInboxDetail[\s\S]*?return rows\[0\] \|\| null;\n}/)?.[0] || '';
  assert.match(history, /WHERE r\.user_id = \?/);
  assert.match(detail, /r\.virtual_huddle_recipient_id = \?[\s\S]*?AND r\.user_id = \?/);
  assert.match(inbox, /r\.virtual_huddle_recipient_id = \?[\s\S]*?AND r\.user_id = \?/);
});
