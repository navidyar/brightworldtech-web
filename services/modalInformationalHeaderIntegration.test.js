'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appCss = read('public/css/app.css');
const requestScript = read('public/js/unit-requests.js');
const requestIndex = read('views/pages/unit-requests.ejs');
const qcModal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
const head = read('views/partials/head.ejs');

test('informational modal heading is shared by QC and request detail modals', () => {
  assert.match(qcModal, /modal-header informational-modal-header tech-qc-status-modal__header/);
  assert.match(qcModal, /informational-modal-heading tech-qc-modal-heading/);
  assert.match(requestScript, /modal-header informational-modal-header/);
  assert.match(requestScript, /informational-modal-heading informational-modal-heading--\$\{requestTypeTone\}/);
  assert.match(appCss, /\.informational-modal-heading \{[\s\S]*?--informational-heading-accent: var\(--blue\)/);
  assert.match(appCss, /\.informational-modal-heading__icon \{[\s\S]*?border-radius: 9px/);
});

test('request modal header promotes type, subject, requester metadata, and semantic status', () => {
  assert.match(requestScript, /getRequestHeaderTypeTone/);
  assert.match(requestScript, /includes\('processor'\).*'purple'/);
  assert.match(requestScript, /includes\('duplicate'\).*'orange'/);
  assert.match(requestScript, /includes\('qc'\).*'danger'/);
  assert.match(requestScript, /const requestMeta = summary\?\.querySelector\('\.unit-request-detail-meta'\)/);
  assert.match(requestScript, /intro\?\.remove\(\);[\s\S]*?summary\?\.remove\(\);/);
  assert.match(requestScript, /informational-modal-status informational-modal-status--\$\{statusTone\}/);
  assert.match(appCss, /\.informational-modal-status--success > strong \{ color: var\(--green\); \}/);
  assert.match(appCss, /\.informational-modal-status--danger > strong \{ color: var\(--red\); \}/);
});

test('informational modal assets are cache-busted together', () => {
  assert.match(head, /app\.css\?v=[^"\s]+/);
  assert.match(requestIndex, /unit-requests\.js\?v=20260924-informational-modal-heading/);
});
