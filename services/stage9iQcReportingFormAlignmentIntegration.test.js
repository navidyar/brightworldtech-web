'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC reporting scope controls use one label, control, and helper-row contract', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const css = read('public/css/app.css');

  assert.match(page, /qc-reporting-period-main-field[\s\S]*data-period-guidance/);
  assert.match(page, /Completion Day[\s\S]*Includes completion cycles recorded on this date/);
  assert.match(page, /Completion Week[\s\S]*Reports Monday through Sunday/);
  assert.match(page, /Completion Month[\s\S]*selected full calendar month/);
  assert.match(page, /qc-reporting-team-field qc-reporting-scope-control/);
  assert.match(page, /Leave every technician unchecked to include all reviewed technicians/);

  assert.match(
    css,
    /\.qc-reporting-scope-control \{[\s\S]*grid-template-rows: minmax\(1\.05rem, auto\) minmax\(42px, auto\) minmax\(2\.4em, auto\)/
  );
  assert.match(css, /\.qc-reporting-scope-form \{[\s\S]*align-items: start/);
  assert.doesNotMatch(css, /\.qc-reporting-scope-form \{[\s\S]{0,260}align-items: end/);
});

test('QC reporting actions reserve the same label and helper rows as the fields', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.qc-reporting-scope-actions \{[\s\S]*grid-template-rows:/);
  assert.match(css, /\.qc-reporting-scope-actions::before,[\s\S]*\.qc-reporting-scope-actions::after/);
  assert.match(css, /\.qc-reporting-scope-actions::before \{[\s\S]*grid-row: 1/);
  assert.match(css, /\.qc-reporting-scope-actions::after \{[\s\S]*grid-row: 3/);
  assert.match(css, /\.qc-reporting-scope-actions :is\(\.primary-button, \.secondary-button\) \{[\s\S]*grid-row: 2/);
});

test('All Time removes the empty date column and custom ranges retain the wider date area', () => {
  const controls = read('public/js/management-reporting-controls.js');
  const css = read('public/css/app.css');

  assert.match(controls, /classList\.toggle\('has-active-date-field', period !== 'all_time'\)/);
  assert.match(controls, /classList\.toggle\('is-custom-range', period === 'custom_range'\)/);
  assert.match(css, /\.qc-reporting-scope-form:not\(\.has-active-date-field\) \{[\s\S]*grid-template-columns/);
  assert.match(css, /\.qc-reporting-period-field--range\.is-active \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test('QC reporting alignment assets are cache-busted consistently', () => {
  const head = read('views/partials/head.ejs');
  const errorPage = read('views/pages/error.ejs');
  const notFoundPage = read('views/pages/not-found.ejs');
  const validator = read('services/sharedCssFoundationValidator.js');

  assert.match(head, /app\.css\?v=20260731-stage10c-hardware-matrix/);
  assert.match(head, /management-reporting-controls\.js\?v=20260729-stage9i-qc-reporting-clarity/);
  assert.match(errorPage, /app\.css\?v=20260731-stage10c-hardware-matrix/);
  assert.match(notFoundPage, /app\.css\?v=20260731-stage10c-hardware-matrix/);
  assert.match(validator, /app\.css\?v=20260731-stage10c-hardware-matrix/);
});
