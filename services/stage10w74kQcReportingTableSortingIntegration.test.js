'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('every QC Reporting table header is exposed as a sortable link', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const headers = [...page.matchAll(/<th(?:\s+class="[^"]*")?><a class="table-sort-link qc-report-sort-link"[^>]*data-qc-report-sort[^>]*>([^<]+)/g)]
    .map((match) => match[1].trim());

  assert.deepEqual(headers, [
    'Technician',
    'Reviewed Units',
    'First-Pass Accepted',
    'Currently Accepted',
    'Rejected First Pass',
    'Corrected After Rejection',
    'Pending Correction',
    'Ready for Recheck',
    'Rechecked Units',
    'Reviewer',
    'Reviews',
    'Accepted',
    'Rejected',
    'Acceptance Rate',
    'First-pass Reviews',
    'Rechecks',
    'Technicians Reviewed',
    'Most Recent'
  ]);
});

test('QC Reporting rows expose authoritative sort values for every visible metric', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(page, /data-sort-value="<%= String\(technician\.technicianName[\s\S]*?technician\.reviewedUnits/);
  assert.match(page, /data-sort-value="<%= sortableNumber\(technician\.firstPassAcceptedUnits\)/);
  assert.match(page, /data-sort-value="<%= sortableNumber\(technician\.currentlyAcceptedUnits\)/);
  assert.match(page, /data-sort-value="<%= sortableNumber\(technician\.repeatedReviewUnits\)/);
  assert.match(page, /data-sort-value="<%= String\(reviewer\.reviewerName/);
  assert.match(page, /data-sort-value="<%= sortableNumber\(reviewer\.acceptanceRate\)/);
  assert.match(page, /data-sort-value="<%= sortableDate\(reviewer\.latestReviewedAt\)/);
  assert.equal((page.match(/data-qc-report-sort-row/g) || []).length, 2);
});

test('table sorting toggles direction, keeps missing values last, and updates accessible sort state', () => {
  const controls = read('public/js/management-reporting-controls.js');

  assert.match(controls, /const direction = currentDirection[\s\S]*?link\.dataset\.sortInitial \|\| 'asc'/);
  assert.match(controls, /if \(left\.missing\) return 1;[\s\S]*?if \(right\.missing\) return -1/);
  assert.match(controls, /rows\.forEach\(\(row\) => body\.appendChild\(row\)\)/);
  assert.match(controls, /setAttribute\('aria-sort', direction === 'asc' \? 'ascending' : 'descending'\)/);
  assert.match(controls, /indicator\.textContent = direction === 'asc' \? '↑' : '↓'/);
  assert.match(controls, /event\.preventDefault\(\);[\s\S]*?sortReportingTable\(sortLink\)/);
});

test('name sorts begin ascending while numeric and date sorts begin descending', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(page, /data-sort-type="text" data-sort-initial="asc">Technician/);
  assert.match(page, /data-sort-type="text" data-sort-initial="asc">Reviewer/);
  assert.match(page, /data-sort-type="number" data-sort-initial="desc">Reviewed Units/);
  assert.match(page, /data-sort-type="number" data-sort-initial="desc">Acceptance Rate/);
  assert.match(page, /data-sort-type="date" data-sort-initial="desc">Most Recent/);
});

test('QC Reporting sorting uses shared table-link styling and cache-busted reporting assets', () => {
  const css = read('public/css/app.css');
  const head = read('views/partials/head.ejs');

  assert.match(css, /\.qc-report-sort-link \{[\s\S]*?white-space: nowrap/);
  assert.match(css, /\.qc-reporting-sort-indicator \{[\s\S]*?min-width: 0\.8em/);
  assert.match(head, /app\.css\?v=[^\"]+/);
  assert.match(head, /management-reporting-controls\.js\?v=20260828-stage10w74k-qc-reporting-table-sorting/);
});
