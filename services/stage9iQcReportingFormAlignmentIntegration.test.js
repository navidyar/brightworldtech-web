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

test('QC reporting actions occupy the section heading and submit the scope form explicitly', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const css = read('public/css/app.css');

  assert.match(page, /qc-reporting-scope-heading-actions[\s\S]*qc-reporting-scope-actions/);
  assert.match(page, /button class="primary-button" type="submit" form="qc-reporting-scope-form"/);
  assert.match(css, /\.qc-reporting-scope-heading-actions \{[\s\S]*justify-items: end/);
  assert.doesNotMatch(css, /\.qc-reporting-scope-actions::before/);
  assert.doesNotMatch(css, /\.qc-reporting-scope-actions::after/);
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

  assert.match(head, /app\.css\?v=[^\"']+/);
  assert.match(head, /management-reporting-controls\.js\?v=[^\"']+/);
  assert.match(errorPage, /app\.css\?v=[^"\'\s>]+/);
  assert.match(notFoundPage, /app\.css\?v=[^"\'\s>]+/);
  assert.match(validator, /SHARED_APP_PATH = '\/css\/app\.css'/);
});
