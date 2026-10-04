'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Virtual Huddle Open action loads the detail in the shared modal with a page fallback', () => {
  const page = read('views/pages/management-virtual-huddle.ejs');
  assert.match(page, /href="\/management\/virtual-huddle\?openHuddle=<%= message\.virtual_huddle_message_id %>"/);
  assert.match(page, /hx-get="\/management\/virtual-huddle\/<%= message\.virtual_huddle_message_id %>\/modal"/);
  assert.match(page, /hx-target="#modal-root"/);
  assert.match(page, /data-modal-trigger/);
});

test('Virtual Huddle detail modal route retains management authorization and renders the detail fragment', () => {
  const routes = read('routes/virtualHuddle.js');
  const controller = read('controllers/virtualHuddleController.js');
  assert.match(routes, /router\.use\('\/management\/virtual-huddle', requireAuth, requirePermission\('huddle\.administration\.view'\)\)/);
  assert.match(routes, /:messageId\/modal'.*renderManagementDetailModal/);
  assert.match(controller, /async function renderManagementDetailModal/);
  assert.match(controller, /renderManagementDetailModalContent/);
  assert.match(controller, /getManagementMessageDetail\(messageId\)/);
  assert.match(controller, /\.render\('fragments\/virtual-huddle-detail-modal'/);
});

test('Virtual Huddle detail modal preserves management actions, recipients, and related-message navigation', () => {
  const modal = read('views/fragments/virtual-huddle-detail-modal.ejs');
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /data-modal-close/);
  assert.match(modal, /Send Related Huddle/);
  assert.match(modal, /Delete Permanently/);
  const status = read('views/fragments/virtual-huddle-recipient-status.ejs');
  assert.match(status, /Acknowledgment Status/);
  assert.match(status, /Revoke All Awaiting/);
  assert.match(modal, /related\.virtual_huddle_message_id %>\/modal/);
});

test('Virtual Huddle detail modal is wide on large viewports and safely scrolls tables on narrow ones', () => {
  const css = read('public/css/app.css');
  assert.match(css, /\.modal-panel\.site-clean-modal\.virtual-huddle-detail-modal \{[\s\S]*?width: min\(1320px, 100%\);/);
  assert.match(css, /\.virtual-huddle-detail-table \{[\s\S]*?overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.virtual-huddle-detail-actions/);
});
