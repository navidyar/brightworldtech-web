'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Model Catalog uses the shared Configuration page, summary, filter, and table patterns', () => {
  const page = read('views/pages/management-unit-models.ejs');

  assert.match(page, /class="content-shell configuration-page model-catalog-page"/);
  assert.match(page, /class="page-heading configuration-page-heading"/);
  assert.match(page, /class="site-summary-panel model-catalog-summary-panel"/);
  assert.match(page, /class="site-clean-section site-clean-surface model-catalog-filter-section"/);
  assert.match(page, /class="table-card model-catalog-table"/);
  assert.doesNotMatch(page, /dashboard-hero|content-card|tech-filter-form/);
});

test('Model Catalog retains its filters and HTMX create, edit, activate, and deactivate actions', () => {
  const page = read('views/pages/management-unit-models.ejs');

  assert.match(page, /method="get" action="\/management\/config\/models"/);
  assert.match(page, /name="manufacturerId"/);
  assert.match(page, /name="unitCategoryConfigValueId"/);
  assert.match(page, /name="includeInactive"/);
  assert.match(page, /name="search"/);
  assert.match(page, /\/management\/config\/models\/new\/modal/);
  assert.match(page, /\/edit\/modal/);
  assert.match(page, /'deactivate' : 'activate'/);
  assert.match(page, /hx-target="#modal-root"/);
});

test('Unit Model modals use the compact shared modal and normally sized Active checkbox patterns', () => {
  const formModal = read('views/fragments/unit-model-form-modal.ejs');
  const statusModal = read('views/fragments/unit-model-status-modal.ejs');

  assert.match(formModal, /modal-panel site-clean-modal unit-model-modal/);
  assert.match(formModal, /app-form app-form-clean unit-model-form/);
  assert.match(formModal, /configuration-inline-checkbox unit-model-active-toggle/);
  assert.match(formModal, /type="checkbox" name="isActive" value="1"/);
  assert.doesNotMatch(formModal, /<select name="isActive">/);
  assert.match(statusModal, /modal-panel site-clean-modal unit-model-modal unit-model-status-modal/);
  assert.match(statusModal, /class="site-detail-list unit-model-summary"/);
});

test('Database Check uses the shared read-only summary and clean table surfaces without legacy status cards', () => {
  const page = read('views/pages/database-check.ejs');

  assert.match(page, /class="content-shell configuration-page database-check-page"/);
  assert.match(page, /class="site-summary-panel database-check-summary-panel"/);
  assert.match(page, /class="site-clean-section site-clean-surface database-summary-counts-section"/);
  assert.match(page, /class="site-clean-section site-clean-surface database-required-objects-section"/);
  assert.match(page, /class="database-object-grid"/);
  assert.doesNotMatch(page, /content-card|status-card|status-grid/);
});

test('Processor Families uses the shared summary and clean surfaces while retaining search and HTMX editing', () => {
  const page = read('views/pages/processor-families.ejs');
  const sharedCss = read('public/css/app.css');

  assert.match(page, /class="content-shell configuration-page processor-family-page"/);
  assert.match(page, /class="site-summary-panel processor-family-summary-panel"/);
  assert.match(page, /site-clean-section site-clean-surface processor-family-catalog-section/);
  assert.match(page, /site-clean-section site-clean-surface processor-family-unmapped-section/);
  assert.match(page, /data-processor-family-table-search/);
  assert.match(page, /\/edit\/modal/);
  assert.doesNotMatch(page, /class="processor-family-summary"/);
  assert.doesNotMatch(sharedCss, /\.processor-family-summary/);
  assert.match(sharedCss, /\.processor-family-member-list/);
});

test('shared application CSS contains the Configuration consistency layouts and reusable detail list', () => {
  const sharedCss = read('public/css/app.css');

  assert.match(sharedCss, /\.model-catalog-filter-form/);
  assert.match(sharedCss, /\.database-object-grid/);
  assert.match(sharedCss, /\.site-detail-list/);
  assert.match(sharedCss, /\.unit-model-form-grid/);
});
