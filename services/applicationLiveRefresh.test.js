'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getApplicationMutationScope,
  getApplicationMutationUnitId,
  isSuccessfulMutationResponse,
  isApplicationDataMutation
} = require('../middleware/applicationLiveRefreshMiddleware');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('application live refresh policy publishes successful data-changing methods only', () => {
  assert.equal(isSuccessfulMutationResponse(200), true);
  assert.equal(isSuccessfulMutationResponse(302), true);
  assert.equal(isSuccessfulMutationResponse(400), false);
  assert.equal(isSuccessfulMutationResponse(500), false);

  assert.equal(isApplicationDataMutation('GET', '/unit-requests'), false);
  assert.equal(isApplicationDataMutation('POST', '/unit-requests/123/approve'), true);
  assert.equal(isApplicationDataMutation('POST', '/tech/units'), true);
  assert.equal(isApplicationDataMutation('PUT', '/api/v1/units/123/wipe-certificates/ABC'), true);
});

test('application live refresh assigns broad non-sensitive scopes for dedicated refresh coordination', () => {
  assert.equal(getApplicationMutationScope('/unit-requests/15/approve'), 'requests');
  assert.equal(getApplicationMutationScope('/api/v1/units/catalog-requests/model'), 'requests');
  assert.equal(getApplicationMutationScope('/tech/units/42'), 'units');
  assert.equal(getApplicationMutationScope('/api/v1/units/commit'), 'units');
  assert.equal(getApplicationMutationScope('/management/printer-groups/3/members'), 'printers');
  assert.equal(getApplicationMutationScope('/management/label-library/assets/upload'), 'labels');
  assert.equal(getApplicationMutationScope('/management/lots/7/close'), 'lots');
});


test('application live refresh identifies the affected Unit when the mutation targets an existing Unit', () => {
  assert.equal(getApplicationMutationUnitId('/tech/units/42', {}), 42);
  assert.equal(getApplicationMutationUnitId('/tech/units/42/modal', {}), 42);
  assert.equal(getApplicationMutationUnitId('/api/v1/units/42/wipe-certificates/CERT-1', {}), 42);
  assert.equal(getApplicationMutationUnitId('/api/v1/units/commit', { unit_id: 42 }), 42);
  assert.equal(getApplicationMutationUnitId('/api/v1/units/action', { unitId: 42 }), 42);
  assert.equal(getApplicationMutationUnitId('/tech/units', {}), null);
});

test('application live refresh excludes read-only POST helpers and high-frequency dedicated channels', () => {
  const excluded = [
    ['/api/v1/units/resolve', 'POST'],
    ['/management/printers/probe', 'POST'],
    ['/tech/printers/probe', 'POST'],
    ['/management/label-library/builder/qr-preview', 'POST'],
    ['/tech/units/lot-requirement-preview', 'POST'],
    ['/tech/units/42/intentional-duplicate-request/modal', 'POST'],
    ['/management/virtual-huddle/preview', 'POST'],
    ['/management/virtual-huddle', 'POST'],
    ['/virtual-huddle/recipients/7/acknowledge', 'POST']
  ];

  for (const [requestPath, method] of excluded) {
    assert.equal(isApplicationDataMutation(method, requestPath), false, requestPath);
  }
});

test('authenticated pages load one global SSE client and the server publishes successful mutations', () => {
  const head = read('views/partials/head.ejs');
  const server = read('server.js');
  const routes = read('routes/system.js');
  const controller = read('controllers/systemController.js');
  const browser = read('public/js/application-live-refresh.js');
  const events = read('services/applicationLiveRefreshEvents.js');

  assert.match(head, /application-live-refresh\.js\?v=20260924-preserve-active-work/);
  assert.match(head, /isAuthenticated/);
  assert.match(server, /publishSuccessfulApplicationMutations/);
  assert.match(server, /app\.use\(publishSuccessfulApplicationMutations\)/);
  assert.match(routes, /'\/application\/events'/);
  assert.match(routes, /requireAuth/);
  assert.match(controller, /streamApplicationLiveRefreshEvents/);
  assert.match(browser, /new EventSource\(EVENT_URL\)/);
  assert.match(browser, /window\.location\.reload\(\)/);
  assert.match(browser, /dirtyForms/);
  assert.match(browser, /hasDedicatedRefreshForScope/);
  assert.match(browser, /unitEventTargetsCurrentPage/);
  assert.match(browser, /getCurrentUnitPageId/);
  assert.match(events, /event: \$\{eventName\}/);
  assert.match(events, /X-Accel-Buffering': 'no'/);
});

test('sitewide refresh script protects active edits, overlays, and mutation round trips', () => {
  const browser = read('public/js/application-live-refresh.js');

  assert.match(browser, /hasUnsavedMutationForm/);
  assert.match(browser, /activeTransientEdit/);
  assert.match(browser, /mutationSettlesAt/);
  assert.match(browser, /hasProtectedInteraction/);
  assert.match(browser, /modalRoot\.childElementCount > 0/);
  assert.match(browser, /data-modal-backdrop/);
  assert.match(browser, /data-virtual-huddle-layer/);
  assert.match(browser, /data-application-unsaved-work=\"true\"/);
  assert.match(browser, /document\.visibilityState === 'hidden'/);
  assert.match(browser, /htmx:beforeRequest/);
  assert.match(browser, /pagehide/);
});

test('Label Builder advertises non-form unsaved work to the sitewide refresh guard', () => {
  const builder = read('public/js/label-builder.js');
  const page = read('views/pages/management-label-builder.ejs');

  assert.match(builder, /root\.dataset\.applicationUnsavedWork = state\.dirty \? 'true' : 'false'/);
  assert.match(builder, /function markDirty\(\)[\s\S]*?syncApplicationUnsavedWork\(\)/);
  assert.match(builder, /function initializeHistory\(\)[\s\S]*?state\.dirty = false;[\s\S]*?syncApplicationUnsavedWork\(\)/);
  assert.match(page, /label-builder\.js\?v=20260924-live-refresh-work-preservation/);
});

test('existing Unit Browser realtime client ignores unrelated Unit detail events', () => {
  const browser = read('public/js/tech-units.js');
  const listPage = read('views/pages/tech-units.ejs');
  const detailPage = read('views/pages/tech-unit-detail.ejs');

  assert.match(browser, /addEventListener\('unit-browser-change', \(event\) =>/);
  assert.match(browser, /detailContainer/);
  assert.match(browser, /currentUnitId !== eventUnitId/);
  assert.match(browser, /return;[\s\S]*?queueVisibleTechUnitRefresh\(\)/);
  assert.match(listPage, /tech-units\.js\?v=20260922-unit-scoped-realtime/);
  assert.match(detailPage, /tech-units\.js\?v=20260922-unit-scoped-realtime/);
});
