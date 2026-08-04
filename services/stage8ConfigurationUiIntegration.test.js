'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Configuration Values uses the shared clean page, summary, browser, and table patterns', () => {
  const page = read('views/pages/management-config.ejs');

  assert.match(page, /class="configuration-clean-page"/);
  assert.match(page, /class="page-heading configuration-page-heading"/);
  assert.match(page, /class="site-summary-panel configuration-summary-panel"/);
  assert.match(page, /class="site-clean-section site-clean-surface configuration-browser-section"/);
  assert.match(page, /class="table-card configuration-values-table"/);
  assert.doesNotMatch(page, /dashboard-hero|dashboard-grid|config-guidance-grid/);
});

test('Configuration Values removes the redundant Model Catalog action and provides a searchable disclosure browser', () => {
  const page = read('views/pages/management-config.ejs');
  const clientScript = read('public/js/config-values.js');

  assert.doesNotMatch(page, /Manage Unit Models/);
  assert.match(page, /data-configuration-search/);
  assert.match(page, /data-configuration-expand-all/);
  assert.match(page, /data-configuration-collapse-all/);
  assert.match(page, /<details class="configuration-category"/);
  assert.match(page, /Add Value/);
  assert.match(page, />Edit</);
  assert.match(clientScript, /function applySearch/);
  assert.match(clientScript, /category\.open = true/);
  assert.match(clientScript, /data-configuration-value-row/);
});

test('Config Value create and edit use the compact shared modal contract and a normally sized Active checkbox', () => {
  const formModal = read('views/fragments/config-value-form-modal.ejs');
  const statusModal = read('views/fragments/config-value-status-modal.ejs');
  const sharedCss = read('public/css/app.css');

  assert.match(formModal, /modal-panel site-clean-modal configuration-value-modal/);
  assert.match(formModal, /configuration-value-form-grid/);
  assert.match(formModal, /configuration-inline-checkbox/);
  assert.doesNotMatch(formModal, /checkbox-card|message warning config-value-system-note/);
  assert.match(statusModal, /configuration-value-summary/);
  assert.match(sharedCss, /\.configuration-inline-checkbox input\[type='checkbox'\][\s\S]*width: 16px;[\s\S]*height: 16px;/);
});

test('shared application CSS exposes reusable summary and clean surface patterns', () => {
  const sharedCss = read('public/css/app.css');

  assert.match(sharedCss, /\.site-summary-panel/);
  assert.match(sharedCss, /\.site-summary-primary/);
  assert.match(sharedCss, /\.site-summary-stats/);
  assert.match(sharedCss, /\.site-clean-surface/);
  assert.match(sharedCss, /\.configuration-category-summary/);
});
