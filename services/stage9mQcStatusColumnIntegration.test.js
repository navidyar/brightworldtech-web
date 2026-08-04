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
  const qcHeaderIndex = table.indexOf('class="tech-units-qc-column"');
  const actionsHeaderIndex = table.indexOf('class="tech-units-actions-column"');

  assert.ok(gradeHeaderIndex >= 0, 'Grade / Pass-Fail header should remain present');
  assert.ok(qcHeaderIndex > gradeHeaderIndex, 'QC header should follow Grade / Pass-Fail');
  assert.ok(actionsHeaderIndex > qcHeaderIndex, 'Unit Actions should follow the QC column');
  assert.match(table, /<th class="tech-units-qc-column" scope="col">[\s\S]*?tech-units-qc-column-label[\s\S]*?QC[\s\S]*?<th class="tech-units-actions-column" scope="col">[\s\S]*?tech-units-actions-column-label[\s\S]*?Unit Actions/);
  assert.match(table, /<td class="tech-units-qc-cell">[\s\S]*?tech-qc-status-link[\s\S]*?<td class="tech-units-actions-cell">/);
});

test('QC indicator is no longer embedded in the Grade / Pass-Fail stack', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const gradeCellStart = table.indexOf('<div class="tech-unit-summary-grade-stack">');
  const qcCellStart = table.indexOf('<td class="tech-units-qc-cell">', gradeCellStart);
  const gradeMarkup = table.slice(gradeCellStart, qcCellStart);

  assert.ok(gradeCellStart >= 0 && qcCellStart > gradeCellStart);
  assert.doesNotMatch(gradeMarkup, /tech-qc-status-link/);
  assert.match(table, /colspan="7">No units match the current filters/);
  assert.match(table, /<td colspan="7">\s*<div class="tech-detail-offset">/);
});

test('QC header and symbol share one centered width while actions share one right edge', () => {
  const css = read('public/css/tech-units-clean.css');
  const page = read('views/pages/tech-units.ejs');

  assert.match(css, /\.tech-units-clean-page \.tech-units-table thead th \{[\s\S]*?vertical-align: middle;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-qc-column,[\s\S]*?min-width: 58px;[\s\S]*?text-align: center;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-qc-column-label,[\s\S]*?width: 34px;[\s\S]*?margin-inline: auto;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-actions-column,[\s\S]*?min-width: 154px;[\s\S]*?padding-right: 12px;[\s\S]*?text-align: right;/);
  assert.match(css, /\.tech-units-clean-page \.tech-units-actions-column-label \{[\s\S]*?justify-content: flex-end;[\s\S]*?width: 100%;/);
  assert.match(page, /tech-units-clean\.css\?v=20260730-stage10a-unit-export/);
});

test('unreviewed Units use the shared subtle neutral QC symbol instead of a dash', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');
  const appCss = read('public/css/app.css');
  const head = read('views/partials/head.ejs');

  assert.match(table, /class="tech-qc-status-empty"[\s\S]*?aria-label="Quality Control not performed"[\s\S]*?statusCode: 'not_reviewed'/);
  assert.doesNotMatch(table, /tech-qc-status-empty[^>]*>—<\/span>/);
  assert.match(icon, /'not_reviewed'[\s\S]*?'not-reviewed'/);
  assert.match(icon, /tech-qc-status-indicator__mark--neutral[\s\S]*?M7\.8 11h6\.4/);
  assert.match(appCss, /--qc-neutral-ink:/);
  assert.match(appCss, /\.tech-qc-status-indicator--not-reviewed \{[\s\S]*?--tech-qc-icon-ink: var\(--qc-neutral-ink\);/);
  assert.match(head, /app\.css\?v=20260731-stage10c-hardware-matrix/);
});
