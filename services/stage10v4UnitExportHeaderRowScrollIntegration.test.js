
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('the synchronized scrollbar is rendered after the header and before preview data rows', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const header = modal.indexOf('<thead>');
  const scrollRow = modal.indexOf('data-unit-export-top-scroll-row');
  const firstDataLoop = modal.indexOf('safePreviewRows.forEach');

  assert.ok(header > 0);
  assert.ok(scrollRow > header);
  assert.ok(firstDataLoop > scrollRow);
  assert.match(modal, /class="unit-export-preview-scroll-row"[\s\S]*?colspan="<%= safeAvailableColumns\.length %>"/);
});

test('the header-row scrollbar stays viewport-width while representing the full table width', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /const scrollRow = modal\.querySelector\('\[data-unit-export-top-scroll-row\]'\)/);
  assert.match(client, /topScroll\.style\.width = `\$\{viewportWidth\}px`/);
  assert.match(client, /const maxScrollLeft = Math\.max\(0, contentWidth - viewportWidth\)/);
  assert.match(client, /const proportionalThumbWidth = contentWidth > 0/);
  assert.match(client, /scrollRow\.hidden = !hasHorizontalOverflow/);
});

test('the export table does not reserve an unused vertical scrollbar gutter on the right', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.unit-export-preview-table-scroll\s*\{[\s\S]*?width:\s*100%;[\s\S]*?overflow-y:\s*hidden;[\s\S]*?scrollbar-gutter:\s*auto;/);
  assert.doesNotMatch(css, /\.unit-export-preview-table-scroll\s*\{[\s\S]*?scrollbar-gutter:\s*stable;/);
  assert.match(css, /\.unit-export-preview-table\s*\{[\s\S]*?margin:\s*0;/);
});

test('Stage 10V.6 cache-busts the adjusted Export Preview assets', () => {
  assert.match(read('views/partials/head.ejs'), /app\.css\?v=20260804-stage10w-ranking-administration/);

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-units\.js\?v=20260804-stage10v6-custom-header-scrollbar/);
  }
});
