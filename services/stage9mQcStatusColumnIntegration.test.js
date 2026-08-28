const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Unit Browser places a dedicated QC column between grade and actions', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const gradeHeaderIndex = table.indexOf('aria-label="Grade and pass-fail sorting"');
  const qcHeaderIndex = table.indexOf('tech-units-qc-column" scope="col"');
  const actionsHeaderIndex = table.indexOf('tech-units-actions-column" scope="col"');

  assert.ok(gradeHeaderIndex >= 0, 'Grade / Pass-Fail header should remain present');
  assert.ok(qcHeaderIndex > gradeHeaderIndex, 'QC header should follow Grade / Pass-Fail');
  assert.ok(actionsHeaderIndex > qcHeaderIndex, 'Unit Actions should follow the QC column');
  assert.match(table, /tech-units-qc-column" scope="col">[\s\S]*?tech-units-qc-column-label[\s\S]*?QC[\s\S]*?tech-units-actions-column" scope="col">[\s\S]*?tech-units-actions-column-label[\s\S]*?Unit Actions/);
  assert.match(table, /tech-units-qc-cell">[\s\S]*?tech-qc-status-link[\s\S]*?tech-units-actions-cell">/);
});

test('QC indicator is no longer embedded in the Grade / Pass-Fail stack', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const gradeCellStart = table.indexOf('<div class="tech-unit-summary-grade-stack">');
  const qcCellStart = table.indexOf('tech-units-qc-cell">', gradeCellStart);
  const gradeMarkup = table.slice(gradeCellStart, qcCellStart);

  assert.ok(gradeCellStart >= 0 && qcCellStart > gradeCellStart);
  assert.doesNotMatch(gradeMarkup, /tech-qc-status-link/);
  assert.match(table, /colspan="<%= browserColumnCount %>">No units match the current filters/);
  assert.match(table, /<td colspan="<%= browserColumnCount %>">\s*<div class="tech-detail-offset">/);
});

test('QC header and symbol share one centered width while actions share one right edge', () => {
  const css = read('public/css/tech-units-clean.css');
  const page = read('views/pages/tech-units.ejs');

  assert.match(css, /\.tech-units-clean-page \.tech-units-table thead th \{[\s\S]*?vertical-align: middle;/);
  const registry = require('../config/unitBrowserColumnRegistry');
  assert.equal(registry.getUnitBrowserColumnDefinition('qc').minimumWidthPx, 44);
  assert.equal(registry.getUnitBrowserColumnDefinition('unit_actions').minimumWidthPx, 180);
  assert.match(css, /\.tech-units-clean-page \.tech-units-col \{[\s\S]*?width: var\(--tu-column-base-width\);/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-col--grow-1 \{[\s\S]*?var\(--tu-secondary-growth-unit\)/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-qc-column,[\s\S]*?text-align: center;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-qc-column-label,[\s\S]*?width: 34px;[\s\S]*?margin-inline: auto;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-actions-column,[\s\S]*?min-width: 0;[\s\S]*?text-align: right;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-actions-column-label \{[\s\S]*?justify-content: flex-end;[\s\S]*?width: 100%;/);
  assert.match(page, /tech-units-clean\.css\?v=20260826-stage10w73e-browser-usability/);
});

test('pending Units use the shared blue QC symbol while not-required remains neutral', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');
  const appCss = read('public/css/app.css');
  const head = read('views/partials/head.ejs');

  assert.match(table, /class="tech-qc-status-empty tech-qc-tooltip--pending"[\s\S]*?statusCode: unit\.qcReviewStateCode/);
  assert.match(table, /class="tech-qc-status-empty tech-qc-tooltip--not-required"[\s\S]*?statusCode: 'not_required'/);
  assert.doesNotMatch(table, /tech-qc-status-empty[^>]*>—<\/span>/);
  assert.match(icon, /'not_required'[\s\S]*?'not-required'/);
  assert.match(icon, /'not_completed'[\s\S]*?'pending'/);
  assert.match(icon, /tech-qc-status-indicator__mark--neutral[\s\S]*?M7\.8 11h6\.4/);
  assert.match(appCss, /--qc-pending-ink: #2563eb/);
  assert.match(appCss, /\.tech-qc-status-indicator--pending \{[\s\S]*?--tech-qc-icon-ink: var\(--qc-pending-ink\);/);
  assert.match(appCss, /\.tech-qc-status-indicator--not-required \{[\s\S]*?--tech-qc-icon-ink: var\(--qc-neutral-ink\);/);
  assert.match(head, /app\.css\?v=[^"'\s]+/);
});
