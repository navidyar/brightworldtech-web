'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Export Preview renders an accessible custom scrollbar directly below its headers', () => {
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');

  assert.match(modal, /role="scrollbar"/);
  assert.match(modal, /aria-orientation="horizontal"/);
  assert.match(modal, /aria-valuemin="0"/);
  assert.match(modal, /aria-valuemax="0"/);
  assert.match(modal, /aria-valuenow="0"/);
  assert.match(modal, /aria-controls="unit-export-preview-table-scroll"/);
  assert.match(modal, /id="unit-export-preview-table-scroll"/);
});

test('custom scrollbar thumb is always visible when horizontal overflow exists', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /const hasHorizontalOverflow = contentWidth > viewportWidth \+ 1/);
  assert.match(client, /scrollRow\.hidden = !hasHorizontalOverflow/);
  assert.match(client, /topScroll\.hidden = !hasHorizontalOverflow/);
  assert.match(client, /Math\.max\(Math\.min\(56, trackWidth\), proportionalThumbWidth\)/);
  assert.match(client, /topScrollThumb\.style\.width = `\$\{thumbWidth\}px`/);
  assert.match(client, /topScrollThumb\.style\.transform = `translateX\(\$\{thumbOffset\}px\)`/);
});

test('custom scrollbar supports pointer dragging and track clicks', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /topScroll\.addEventListener\('pointerdown'/);
  assert.match(client, /topScroll\.addEventListener\('pointermove'/);
  assert.match(client, /topScroll\.addEventListener\('pointerup'/);
  assert.match(client, /topScroll\.setPointerCapture\(event\.pointerId\)/);
  assert.match(client, /scrollFromThumbOffset\(event\.clientX - trackRect\.left - \(geometry\.thumbWidth \/ 2\)\)/);
});

test('custom scrollbar supports keyboard navigation', () => {
  const client = read('public/js/tech-units.js');

  assert.match(client, /topScroll\.addEventListener\('keydown'/);
  assert.match(client, /event\.key === 'ArrowLeft'/);
  assert.match(client, /event\.key === 'ArrowRight'/);
  assert.match(client, /event\.key === 'PageUp'/);
  assert.match(client, /event\.key === 'PageDown'/);
  assert.match(client, /event\.key === 'Home'/);
  assert.match(client, /event\.key === 'End'/);
});

test('the native bottom scrollbar remains available and uses the shared approved colors', () => {
  const theme = read('public/css/theme.css');
  const css = read('public/css/app.css');

  assert.match(css, /\.unit-export-preview-table-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(theme, /--ui-scrollbar-track:\s*#e8eef5;/);
  assert.match(theme, /--ui-scrollbar-thumb:\s*#6f88a5;/);
  assert.match(css, /\*::-webkit-scrollbar-track[\s\S]*?background:\s*var\(--ui-scrollbar-track\);/);
  assert.match(css, /\*::-webkit-scrollbar-thumb[\s\S]*?background:\s*var\(--ui-scrollbar-thumb\);/);
});
