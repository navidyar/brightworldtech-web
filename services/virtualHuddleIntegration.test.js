'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Virtual Huddle is globally wired with server enforcement, recipient routes, and Management+ administration', () => {
  const server = read('server.js');
  const routes = read('routes/virtualHuddle.js');
  const middleware = read('middleware/virtualHuddleMiddleware.js');

  assert.match(server, /enforceVirtualHuddleAcknowledgment/);
  assert.match(server, /app\.use\(enforceVirtualHuddleAcknowledgment\)/);
  assert.match(server, /app\.use\(virtualHuddleRoutes\)/);
  assert.match(routes, /\/virtual-huddle\/events/);
  assert.match(routes, /\/virtual-huddle\/recipients\/:recipientId\/acknowledge/);
  assert.match(routes, /\/management\/virtual-huddle\/preview/);
  assert.match(routes, /requireRole\(adminRoles\).*hardDeleteMessage/s);
  assert.match(middleware, /await virtualHuddleModel\.hasPendingRequiredAcknowledgment/);
  assert.match(middleware, /\/virtual-huddle\/required/);
});

test('global delivery uses SSE and preserves mandatory server-side blocking', () => {
  const script = read('public/js/virtual-huddle.js');
  const events = read('services/virtualHuddleEvents.js');
  assert.match(script, /new EventSource\('\/virtual-huddle\/events'\)/);
  assert.match(script, /virtual-huddle-change/);
  assert.match(script, /virtual-huddle-blocked/);
  assert.match(script, /data-huddle-ack-form/);
  assert.match(events, /clientsByUserId/);
  assert.match(events, /publishVirtualHuddleChange/);
});

test('Virtual Huddle uses the existing three shared CSS files with requested Priority and Urgent headers', () => {
  const theme = read('public/css/theme.css');
  const app = read('public/css/app.css');
  const features = read('public/css/features.css');
  assert.match(theme, /--virtual-huddle-priority-header:\s*#a94f0e/i);
  assert.match(theme, /--virtual-huddle-urgent-header:\s*#7b1f2c/i);
  assert.match(app, /virtual-huddle-priority[\s\S]*var\(--virtual-huddle-priority-header\)/);
  assert.match(app, /virtual-huddle-urgent[\s\S]*var\(--virtual-huddle-urgent-header\)/);
  assert.match(features, /\.virtual-huddle-layer/);
  assert.equal(fs.existsSync(path.join(root, 'public/css/virtual-huddle.css')), false);
});

test('sidebar exposes personal history to all authenticated users and management administration to Management+', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /href="\/my-huddles"/);
  assert.match(sidebar, /href="\/management\/virtual-huddle"/);
  assert.match(sidebar, /canAccessMenuArea\('management'\)/);
});

test('recipient dialog enforces the fixed confirmation phrase and keeps optional notes non-question context', () => {
  const dialog = read('views/fragments/virtual-huddle-recipient-dialog.ejs');
  assert.match(dialog, /READ AND UNDERSTOOD|confirmationPhrase/);
  assert.match(dialog, /Do not post questions here/);
  assert.match(dialog, /Close Without Acknowledging/);
  assert.match(dialog, /data-huddle-dismiss/);
});

test('all Virtual Huddle templates are present and use the shared head/fragment structure', () => {
  const files = [
    'views/fragments/virtual-huddle-recipient-dialog.ejs',
    'views/fragments/virtual-huddle-compose-modal.ejs',
    'views/fragments/virtual-huddle-preview-modal.ejs',
    'views/fragments/virtual-huddle-revoke-modal.ejs',
    'views/fragments/virtual-huddle-delete-modal.ejs',
    'views/fragments/virtual-huddle-delete-own-modal.ejs',
    'views/pages/management-virtual-huddle.ejs',
    'views/pages/management-virtual-huddle-detail.ejs',
    'views/pages/my-huddles.ejs',
    'views/pages/my-huddle-detail.ejs',
    'views/pages/my-huddle-admin-inbox-detail.ejs',
    'views/pages/virtual-huddle-required.ejs'
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
    assert.ok(read(file).length > 40, file);
  }
});
