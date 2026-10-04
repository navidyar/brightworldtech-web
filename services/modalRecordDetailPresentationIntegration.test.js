'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appCss = read('public/css/app.css');
const unitRequestPage = read('views/pages/unit-request-detail.ejs');
const overrideRequestPage = read('views/pages/override-request-detail.ejs');
const unitRequestScript = read('public/js/unit-requests.js');
const unitRequestsIndex = read('views/pages/unit-requests.ejs');
const qcModal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
const head = read('views/partials/head.ejs');

test('read-heavy request and QC modals opt into the shared flat record-detail shell', () => {
  assert.match(unitRequestScript, /site-clean-modal record-detail-modal unit-request-detail-modal/);
  assert.match(unitRequestScript, /modal-body record-detail-body unit-request-modal-content/);
  assert.match(overrideRequestPage, /dashboard-hero accent-green record-detail-intro record-detail-intro--<%= request\.statusClass %>/);
  assert.match(overrideRequestPage, /content-card record-detail-shell/);
  assert.match(overrideRequestPage, /unit-request-detail-overview record-detail-split/);
  assert.match(overrideRequestPage, /unit-request-detail-card record-detail-section/);
  assert.match(qcModal, /site-clean-modal record-detail-modal tech-qc-review-modal/);
  assert.match(qcModal, /modal-body record-detail-body tech-qc-status-modal__body/);
  assert.match(appCss, /\.record-detail-modal \.record-detail-section \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
});

test('request details flatten nested cards while preserving split metadata, user content, and history', () => {
  assert.match(unitRequestPage, /dashboard-hero accent-green record-detail-intro record-detail-intro--<%= request\.statusClass %>/);
  assert.match(unitRequestPage, /content-card record-detail-shell/);
  assert.match(unitRequestPage, /unit-request-detail-overview record-detail-split/);
  assert.match(unitRequestPage, /unit-request-detail-card record-detail-section/);
  assert.match(unitRequestPage, /record-detail-user-section[\s\S]*Requester Explanation/);
  assert.match(unitRequestPage, /record-detail-history-section[\s\S]*Request History/);
  assert.match(unitRequestPage, /record-detail-status--<%= request\.statusClass %>/);
  assert.match(unitRequestPage, /record-detail-result-section--<%= request\.statusClass %>/);
  assert.match(unitRequestPage, /record-detail-event--<%= eventTone %>/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-split > \.record-detail-section \+ \.record-detail-section[\s\S]*?border-left: 1px solid var\(--line-soft\)/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-user-section \.unit-request-requester-note[\s\S]*?font-size: 0\.94rem/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-intro--success[\s\S]*?var\(--green-bg\)/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-status--success strong[\s\S]*?color: var\(--green\)/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-result-section--success > \.eyebrow[\s\S]*?color: var\(--green\)/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-event--danger > strong[\s\S]*?color: var\(--red\)/);
  assert.match(appCss, /#modal-root \.modal-panel\.site-clean-modal\.unit-request-detail-modal > \.modal-body \{[\s\S]*?padding: 0;/);
  assert.match(appCss, /unit-request-detail-modal \.record-detail-intro \{[\s\S]*?padding: 14px 18px 12px;/);
  assert.match(appCss, /unit-request-detail-modal \.unit-request-detail-header \{[\s\S]*?padding: 12px 18px 10px;/);
  assert.match(appCss, /unit-request-detail-modal \.unit-request-detail-section\.record-detail-section \{[\s\S]*?padding: 15px 18px;/);
});

test('QC keeps one semantic status alert but flattens review, note, and correction detail chrome', () => {
  assert.match(qcModal, /tech-qc-status-banner record-detail-alert/);
  assert.match(qcModal, /tech-qc-workflow record-detail-section/);
  assert.match(qcModal, /tech-qc-note-panel record-detail-section record-detail-user-section/);
  assert.match(qcModal, /tech-qc-correction-detail record-detail-section/);
  assert.match(appCss, /tech-qc-review-modal\.record-detail-modal \.record-detail-alert[\s\S]*?border-radius: 6px/);
  assert.match(appCss, /tech-qc-review-modal\.record-detail-modal \.tech-qc-note-panel\.record-detail-section,[\s\S]*?background: transparent/);
  assert.match(appCss, /record-detail-user-section \.tech-qc-note-panel__text[\s\S]*?font-size: 0\.94rem/);
});

test('changed shared CSS and Unit Requests script are cache-busted', () => {
  assert.match(head, /app\.css\?v=[^"\s]+/);
  assert.match(unitRequestsIndex, /unit-requests\.js\?v=20260924-informational-modal-heading/);
});
