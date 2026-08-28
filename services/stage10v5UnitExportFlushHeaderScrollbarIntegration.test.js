'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('the Export Preview custom scrollbar fills the header-adjacent row without an empty native-scrollbar host', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const css = read('public/css/app.css');

  assert.match(modal, /data-unit-export-top-scroll-track/);
  assert.match(modal, /data-unit-export-top-scroll-thumb/);
  assert.doesNotMatch(modal, /data-unit-export-top-scroll-spacer/);
  assert.match(css, /\.unit-export-preview-scroll-row > td\s*\{[\s\S]*?height:\s*var\(--ui-scrollbar-size\);[\s\S]*?background:\s*var\(--ui-scrollbar-track\);[\s\S]*?line-height:\s*0;[\s\S]*?vertical-align:\s*top;/);
  assert.match(css, /\.unit-export-preview-top-scroll\s*\{[\s\S]*?height:\s*var\(--ui-scrollbar-size\);[\s\S]*?padding:\s*2px;[\s\S]*?background:\s*var\(--ui-scrollbar-track\);/);
});

test('the top control does not depend on a native horizontal scrollbar being rendered', () => {
  const css = read('public/css/app.css');

  assert.doesNotMatch(css, /\.unit-export-preview-top-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.doesNotMatch(css, /\.unit-export-preview-top-scroll::-webkit-scrollbar/);
  assert.match(css, /\.unit-export-preview-top-scroll-thumb\s*\{[\s\S]*?height:\s*calc\(var\(--ui-scrollbar-size\) - 4px\);[\s\S]*?background:\s*var\(--ui-scrollbar-thumb\);/);
});

test('Stage 10V.6 cache-busts the adjusted Export Preview CSS and script', () => {
  assert.match(read('views/partials/head.ejs'), /app\.css\?v=[^"\'\s>]+/);

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), /tech-units\.js\?v=20260826-stage10w73c-browser-refinement/);
  }
});
