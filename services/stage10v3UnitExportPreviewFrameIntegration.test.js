'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Export Preview keeps the header-row scrollbar and table inside one seamless frame', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const frameStart = modal.indexOf('class="unit-export-preview-table-frame"');
  const tableScroll = modal.indexOf('data-unit-export-table-scroll', frameStart);
  const header = modal.indexOf('<thead>', tableScroll);
  const topScroll = modal.indexOf('data-unit-export-top-scroll', header);
  const frameEnd = modal.indexOf('</table>', topScroll);

  assert.ok(frameStart > 0);
  assert.ok(tableScroll > frameStart);
  assert.ok(header > tableScroll);
  assert.ok(topScroll > header);
  assert.ok(frameEnd > topScroll);
});

test('Export Preview scrollbar is a flush row below the headers rather than a detached bordered pill', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.unit-export-preview-table-frame\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?border:\s*1px solid var\(--ui-line\);[\s\S]*?border-radius:\s*8px;/);
  assert.match(css, /\.unit-export-preview-scroll-row > td\s*\{[\s\S]*?padding:\s*0 !important;[\s\S]*?border-bottom:\s*1px solid #d7e0ea;[\s\S]*?background:\s*var\(--ui-scrollbar-track\);/);
  assert.match(css, /\.unit-export-preview-top-scroll\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?left:\s*0;[\s\S]*?margin:\s*0;[\s\S]*?border:\s*0;/);
  assert.match(css, /\.unit-export-preview-table-frame \.unit-export-preview-table\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/);
});

test('Export Preview no longer renders aggregate Previous and Current capacity totals above the table', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const css = read('public/css/app.css');

  assert.doesNotMatch(modal, /unit-export-capacity-totals/);
  assert.doesNotMatch(modal, /Separate previous and current hardware capacity totals/);
  assert.doesNotMatch(css, /\.unit-export-capacity-totals/);
});

test('Stage 10V.6 cache-busts the integrated Export Preview frame styles', () => {
  assert.match(read('views/partials/head.ejs'), /app\.css\?v=[^"\'\s>]+/);

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-units\.js\?v=20260826-stage10w73c-browser-refinement/);
  }
});
