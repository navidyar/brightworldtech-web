'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('new optional export columns do not change the established default selection', () => {
  const contract = require('../config/unitExportContract');

  assert.equal(contract.UNIT_EXPORT_COLUMNS.length, 57);
  assert.equal(contract.DEFAULT_UNIT_EXPORT_COLUMNS.length, 24);
  assert.equal(contract.DEFAULT_UNIT_EXPORT_COLUMNS.includes(contract.UNIT_EXPORT_COLUMNS.find((column) => column.key === 'screenSize')), false);
  assert.equal(contract.DEFAULT_UNIT_EXPORT_COLUMNS.includes(contract.UNIT_EXPORT_COLUMNS.find((column) => column.key === 'modelYear')), false);
});

test('Export Preview renders a second horizontal scrollbar directly below the table headers', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const tableScrollIndex = modal.indexOf('data-unit-export-table-scroll');
  const headerIndex = modal.indexOf('<thead>', tableScrollIndex);
  const scrollRowIndex = modal.indexOf('data-unit-export-top-scroll-row', headerIndex);
  const topScrollIndex = modal.indexOf('class="unit-export-preview-top-scroll"', scrollRowIndex);
  const previewRowIndex = modal.indexOf('safePreviewRows.forEach', topScrollIndex);

  assert.ok(tableScrollIndex > 0);
  assert.ok(headerIndex > tableScrollIndex);
  assert.ok(scrollRowIndex > headerIndex);
  assert.ok(topScrollIndex > scrollRowIndex);
  assert.ok(previewRowIndex > topScrollIndex);
  assert.match(modal, /data-unit-export-top-scroll-track/);
  assert.match(modal, /data-unit-export-top-scroll-thumb/);
  assert.doesNotMatch(modal, /data-unit-export-top-scroll-spacer/);
  assert.match(modal, /aria-label="Horizontal scrollbar for the Unit export preview table"/);
});

test('the custom header scrollbar follows native table scrolling and controls table scrollLeft', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /function initializeUnitExportTableScroll\(modal\)/);
  assert.match(client, /tableScroll\.addEventListener\('scroll', refresh/);
  assert.match(client, /tableScroll\.scrollLeft = \(clampedOffset \/ geometry\.thumbTravel\) \* geometry\.maxScrollLeft/);
  assert.match(client, /topScrollThumb\.style\.transform = `translateX\(\$\{thumbOffset\}px\)`/);
});

test('top export scrollbar sizes itself to the table and hides when horizontal overflow is absent', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /const contentWidth = Math\.max\(/);
  assert.match(client, /const proportionalThumbWidth = contentWidth > 0/);
  assert.match(client, /topScrollThumb\.style\.width = `\$\{thumbWidth\}px`/);
  assert.match(client, /scrollRow\.hidden = !hasHorizontalOverflow/);
  assert.match(client, /topScroll\.hidden = !hasHorizontalOverflow/);
  assert.match(client, /topScroll\.style\.width = `\$\{viewportWidth\}px`/);
  assert.match(client, /contentWidth > viewportWidth \+ 1/);
});

test('column changes and browser resizing recalculate the synchronized scrollbar', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /window\.requestAnimationFrame\(\(\) => \{\s*initializeUnitExportTableScroll\(modal\);\s*\}\)/);
  assert.match(client, /window\.addEventListener\('resize', \(\) => \{\s*initializeUnitExportTableScroll/);
});

test('Export Preview uses the shared restrained blue-gray scrollbar contract', () => {
  const theme = read('public/css/theme.css');
  const css = read('public/css/app.css');

  assert.match(theme, /--ui-scrollbar-track:\s*#e8eef5;/);
  assert.match(theme, /--ui-scrollbar-thumb:\s*#6f88a5;/);
  assert.match(theme, /--ui-scrollbar-thumb-hover:\s*#526f8f;/);
  assert.match(css, /\.unit-export-preview-top-scroll-track\s*\{[\s\S]*?background:\s*var\(--ui-scrollbar-track\);/);
  assert.match(css, /\.unit-export-preview-top-scroll-thumb\s*\{[\s\S]*?background:\s*var\(--ui-scrollbar-thumb\);/);
  assert.match(css, /scrollbar-color:\s*var\(--ui-scrollbar-thumb\) var\(--ui-scrollbar-track\);/);
  assert.match(css, /\*::-webkit-scrollbar-thumb[\s\S]*?background:\s*var\(--ui-scrollbar-thumb\);/);
  assert.match(css, /\*::-webkit-scrollbar-thumb:hover[\s\S]*?background:\s*var\(--ui-scrollbar-thumb-hover\);/);
  assert.match(css, /\*::-webkit-scrollbar-track[\s\S]*?background:\s*var\(--ui-scrollbar-track\);/);
});

test('Stage 10V.6 cache-busts the changed shared CSS and Unit Browser script', () => {
  assert.match(read('views/partials/head.ejs'), /app\.css\?v=20260804-stage10w-ranking-administration/);

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-units\.js\?v=20260804-stage10v6-custom-header-scrollbar/);
  }
});
