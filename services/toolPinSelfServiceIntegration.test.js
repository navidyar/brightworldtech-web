'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Tool PIN self-service routes require authenticated Tool API permission', () => {
  const routes = read('routes/auth.js');
  for (const route of ['/account/tool-pin/modal', '/account/tool-pin']) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = routes.match(new RegExp(`router\\.(?:get|post)\\(\\s*'${escaped}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, /requireAuth/);
    assert.match(block, /requirePermission\('tools\.unit_api\.use'\)/);
    assert.doesNotMatch(block, /users\.tool_pin\.manage/);
  }
});

test('self-service verifies current account password and never accepts the Tool PIN as browser authentication', () => {
  const controller = read('controllers/authController.js');
  const start = controller.indexOf('async function updateOwnToolPin');
  const end = controller.indexOf('\nfunction logout', start);
  const block = controller.slice(start, end);
  assert.match(block, /currentPassword/);
  assert.match(block, /getUserCredentialById/);
  assert.match(block, /argon2\.verify\(credential\.password_hash, currentPassword\)/);
  assert.match(block, /validateToolPin\(toolPin, confirmToolPin\)/);
  assert.match(block, /argon2\.hash\(toolPin, \{ type: argon2\.argon2id \}\)/);
  assert.match(block, /setUserToolPin/);
  const login = controller.slice(controller.indexOf('async function login('), controller.indexOf('async function renderOwnToolPinModal'));
  assert.doesNotMatch(login, /toolPin|tool_pin|req\.body.*pin/);
});

test('successful self-service PIN change is audited without PIN material', () => {
  const controller = read('controllers/authController.js');
  assert.match(controller, /action: 'user_tool_pin_updated'/);
  assert.match(controller, /reason: 'User changed own Tool PIN\.'/);
  assert.doesNotMatch(controller, /reason:.*toolPin/);
});

test('self-service modal requires password plus new and confirmed PIN', () => {
  const modal = read('views/fragments/account-tool-pin-modal.ejs');
  assert.match(modal, /name="currentPassword"[\s\S]*autocomplete="current-password"/);
  assert.match(modal, /name="toolPin"[\s\S]*name="confirmToolPin"/);
  assert.match(modal, /Avoid repeated digits/);
  assert.match(modal, /hx-target="#account-modal-root"/);
});


test('topbar places Tool PIN immediately before the signed-in user chip and only for Tool-authorized users', () => {
  const topbar = read('views/partials/topbar.ejs');
  const pinIndex = topbar.indexOf('class="tool-pin-topbar-button"');
  const userIndex = topbar.indexOf('class="user-chip"');
  assert.ok(pinIndex > 0 && userIndex > pinIndex);
  assert.match(topbar, /hasPermission\('tools\.unit_api\.use'\)/);
  assert.match(topbar, /hx-target="#account-modal-root"/);
});

test('Tool PIN account modal has dedicated no-navigation close/focus behavior', () => {
  const js = read('public/js/account-tool-pin.js');
  const head = read('views/partials/head.ejs');
  assert.match(js, /account-modal-root/);
  assert.match(js, /data-account-tool-pin-close/);
  assert.match(js, /htmx:afterSwap/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /trapFocus/);
  assert.match(head, /account-tool-pin\.js\?v=20261002-tool-pin-self-service-r1/);
});


test('Tool PIN responses remain in the modal without triggering application live refresh', () => {
  const middleware = read('middleware/applicationLiveRefreshMiddleware.js');
  const liveRefresh = read('public/js/application-live-refresh.js');
  const controller = read('controllers/authController.js');

  assert.match(middleware, /\^\\\/account\\\/tool-pin\$\//);
  assert.match(liveRefresh, /account-modal-root/);
  assert.match(liveRefresh, /data-account-tool-pin-backdrop/);
  assert.match(read('views/partials/head.ejs'), /application-live-refresh\.js\?v=20261002-account-modal-refresh-guard/);
  assert.match(controller, /successMessage: 'Tool PIN updated successfully\.'/);
  assert.match(controller, /res\.status\(isHtmxRequest\(req\) \? 200 : 400\)\.render\('fragments\/account-tool-pin-modal'/);
  assert.doesNotMatch(controller.slice(controller.indexOf('async function updateOwnToolPin'), controller.indexOf('\nfunction logout')), /HX-Redirect|res\.redirect/);
});
