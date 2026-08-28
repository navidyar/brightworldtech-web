'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Reporting Team picker starts collapsed even when a team is already selected', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(page, /<details class="qc-reporting-team-picker" data-reporting-team-picker>/);
  assert.doesNotMatch(page, /selectedTeamCount > 0 \? 'open'/);
  assert.match(page, /selectedTeamCount > 0 \? `\$\{selectedTeamCount\} selected` : 'All reviewed technicians'/);
});

test('Reporting Team picker closes on outside pointer focus and Escape without disturbing checkbox clicks', () => {
  const controls = read('public/js/management-reporting-controls.js');

  assert.match(controls, /querySelectorAll\('\[data-reporting-team-picker\]\[open\]'\)/);
  assert.match(controls, /if \(!picker\.contains\(target\)\) \{[\s\S]*?picker\.removeAttribute\('open'\)/);
  assert.match(controls, /document\.addEventListener\('pointerdown', \(event\) => \{[\s\S]*?closeTeamPickersOutside\(event\.target\)/);
  assert.match(controls, /event\.key !== 'Escape'/);
  assert.match(controls, /picker\.removeAttribute\('open'\);[\s\S]*?summary\.focus\(\)/);
});

test('Reporting scope actions use the empty heading space instead of a dedicated filter-grid row', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const css = read('public/css/app.css');

  assert.match(page, /qc-reporting-scope-heading-actions[\s\S]*scope\.scopeLabel[\s\S]*qc-reporting-scope-actions/);
  assert.match(page, /form="qc-reporting-scope-form"/);
  assert.match(page, /<form id="qc-reporting-scope-form" class="qc-reporting-scope-form"/);
  assert.doesNotMatch(page, /<form[^>]*qc-reporting-scope-form[\s\S]*?<div class="qc-reporting-scope-actions"/);
  assert.match(css, /\.qc-reporting-scope-heading-actions \{[\s\S]*?justify-items: end/);
  assert.match(css, /\.qc-reporting-scope-form:not\(\.has-active-date-field\) \{[\s\S]*?grid-template-columns: minmax\(240px, 0\.9fr\) minmax\(320px, 1\.3fr\)/);
});

test('QC Reporting loads cache-busted shared CSS and reporting controls after the refinement', () => {
  const head = read('views/partials/head.ejs');

  assert.match(head, /app\.css\?v=[^\"']+/);
  assert.match(head, /management-reporting-controls\.js\?v=[^\"']+/);
});
