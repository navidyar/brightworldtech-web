'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('select values use one lighter shared typography contract', () => {
  const css = read('public/css/app.css');

  assert.match(css, /--form-select-value-ink:\s*#40566e/);
  assert.match(css, /--form-select-value-font-weight:\s*400/);
  assert.match(css, /body select:not\(\[multiple\]\):not\(\[hidden\]\)[\s\S]*?font-weight:\s*var\(--form-select-value-font-weight\) !important/);
  assert.match(css, /body :is\(\.site-date-picker-trigger, \.tech-created-date-picker-trigger\)[\s\S]*?font-weight:\s*var\(--form-select-value-font-weight\) !important/);
});

test('Configuration Browser uses restrained alternating and active-row color cues', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.configuration-category:nth-child\(even\) > \.configuration-category-summary[\s\S]*?background:\s*#f8fbfe/);
  assert.match(css, /\.configuration-category\[open\] > \.configuration-category-summary[\s\S]*?background:\s*#f1f6fc/);
  assert.match(css, /\.configuration-values-table tbody tr:nth-child\(even\):not\(\.configuration-value-row--inactive\) td[\s\S]*?background:\s*#f7fafd/);
  assert.match(css, /\.configuration-values-table tbody tr:not\(\.configuration-value-row--inactive\):hover td[\s\S]*?background:\s*#eef5fc/);
});

test('all shared date calendars expose direct Month and Year selectors', () => {
  const sharedPicker = read('public/js/date-picker-only.js');
  const techPicker = read('public/js/tech-units-date-picker.js');
  const techUnitsPage = read('views/pages/tech-units.ejs');

  assert.match(sharedPicker, /data-site-date-picker-month/);
  assert.match(sharedPicker, /data-site-date-picker-year/);
  assert.match(sharedPicker, /monthSelect\?\.addEventListener\('change'/);
  assert.match(sharedPicker, /yearSelect\.addEventListener\('change'/);
  assert.match(sharedPicker, /getYearBounds/);

  assert.match(techPicker, /data-tech-created-date-picker-month/);
  assert.match(techPicker, /data-tech-created-date-picker-year/);
  assert.match(techPicker, /monthSelect\.addEventListener\('change'/);
  assert.match(techPicker, /yearSelect\.addEventListener\('change'/);

  assert.equal((techUnitsPage.match(/data-tech-created-date-picker-month/g) || []).length, 2);
  assert.equal((techUnitsPage.match(/data-tech-created-date-picker-year/g) || []).length, 2);
});

test('Lot checkbox and Requirement presentation removes unnecessary framing/text', () => {
  const css = read('public/css/app.css');
  const lotModal = read('views/fragments/lot-form-modal.ejs');
  const lotNew = read('views/pages/management-lot-new.ejs');
  const requirements = read('views/fragments/lot-requirements-modal.ejs');

  assert.match(css, /\.plain-checkbox-row\s*\{[\s\S]*?border:\s*0 !important[\s\S]*?background:\s*transparent !important/);
  assert.match(lotModal, /plain-checkbox-row[^>]*for="allowDuplicateUnitAssumptionModal"/);
  assert.match(lotModal, /plain-checkbox-row[^>]*for="startNewProductionCycleOnMoveModal"/);
  assert.match(lotNew, /plain-checkbox-row[^>]*for="allowDuplicateUnitAssumption"/);
  assert.doesNotMatch(requirements, /<small>This Lot<\/small>/);
});

test('modal close buttons use one centered Add/Edit Unit style and legacy CSS duplicates are removed', () => {
  const appCss = read('public/css/app.css');
  const legacyCssFiles = [
    'public/css/modal.css',
    'public/css/work-area.css',
    'public/css/lots.css',
    'public/css/tech-units-clean.css'
  ];
  const techModal = read('views/fragments/tech-unit-modal.ejs');

  assert.match(appCss, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)[\s\S]*?width:\s*34px[\s\S]*?border-radius:\s*7px[\s\S]*?background:\s*var\(--ui-blue\)/);
  assert.match(appCss, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)::before/);
  assert.match(appCss, /\.modal-panel :is\(\.modal-close-button, \.modal-close\)::after/);
  assert.doesNotMatch(techModal, /tech-unit-modal-close-icon/);

  legacyCssFiles.forEach((relativePath) => {
    assert.doesNotMatch(read(relativePath), /modal-close-button/, `${relativePath} should no longer own modal close-button presentation`);
  });
});

test('shared UI assets remain cache-busted without pinning later visual revisions', () => {
  const head = read('views/partials/head.ejs');
  const techUnits = read('views/pages/tech-units.ejs');

  assert.match(head, /app\.css\?v=[^\"'\s>]+/);
  assert.match(head, /work-area\.css\?v=[^\"'\s>]+/);
  assert.match(head, /date-picker-only\.js\?v=20260812-stage10w48-cross-browser-period-picker/);
  assert.match(techUnits, /tech-units-date-picker\.js\?v=20260812-stage10w46-month-year-picker/);
});
