'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('printer registry exposes one authenticated SSE stream to Tech operational roles', () => {
  const routes = read('routes/management.js');
  const events = read('services/labelPrinterRegistryEvents.js');
  assert.match(routes, /'\/label-printers\/events'/);
  assert.match(routes, /requireRole\(techRoles\)/);
  assert.match(routes, /labelPrinterController\.streamPrinterRegistryEvents/);
  assert.match(events, /Content-Type': 'text\/event-stream'/);
  assert.match(events, /X-Accel-Buffering': 'no'/);
  assert.match(events, /retry: 5000/);
});

test('successful printer and group mutations broadcast through the shared mutation responder', () => {
  const controller = read('controllers/labelPrinterController.js');
  assert.match(controller, /async function respondAfterMutation/);
  assert.match(controller, /broadcastPrinterRegistryChange\(\)/);
  assert.match(controller, /label-printer-registry-changed/);
});

test('Management and Tech printer pages subscribe and reuse the existing HTMX live-fragment event', () => {
  const managementPage = read('views/pages/management-printers.ejs');
  const techPage = read('views/pages/tech-printers.ejs');
  const browser = read('public/js/label-printer-registry-live.js');
  const managementLive = read('views/fragments/management-printers-live.ejs');
  const techLive = read('views/fragments/tech-printers-live.ejs');
  assert.match(managementPage, /label-printer-registry-live\.js/);
  assert.match(techPage, /label-printer-registry-live\.js/);
  assert.match(browser, /new EventSource\('\/label-printers\/events'\)/);
  assert.match(browser, /new CustomEvent\(EVENT_NAME/);
  assert.match(managementLive, /hx-trigger="label-printer-registry-changed from:body"/);
  assert.match(techLive, /hx-trigger="label-printer-registry-changed from:body"/);
});

test('SSE connections clean up and use lightweight heartbeat comments', () => {
  const events = read('services/labelPrinterRegistryEvents.js');
  assert.match(events, /HEARTBEAT_MS = 25000/);
  assert.match(events, /: keep-alive/);
  assert.match(events, /req\.on\('close'/);
  assert.match(events, /clients\.delete\(res\)/);
});
