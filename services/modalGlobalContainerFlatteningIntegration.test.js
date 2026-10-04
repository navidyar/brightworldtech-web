'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const css = read('public/css/app.css');
const head = read('views/partials/head.ejs');
const closeLot = read('views/fragments/lot-closure-modal.ejs');
const hideLot = read('views/fragments/lot-visibility-modal.ejs');
const parkUnit = read('views/fragments/tech-unit-park-modal.ejs');
const duplicateLot = read('views/fragments/lot-duplicate-modal.ejs');
const huddle = read('views/fragments/virtual-huddle-compose-modal.ejs');

test('global modal CSS flattens residual structural surfaces rather than adding modal-specific cards', () => {
  assert.match(css, /#modal-root \.modal-panel :where\([\s\S]*?\.site-clean-section,[\s\S]*?\.tech-delete-confirm-card,[\s\S]*?\.site-detail-list[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
  assert.match(css, /#modal-root \.modal-panel :is\([\s\S]*?\.lot-delete-summary dl > div,[\s\S]*?\.lot-delete-counts > span,[\s\S]*?\.site-summary-stats > article[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/);
});

test('lot close and visibility summaries keep their data but inherit flat global presentation', () => {
  assert.match(closeLot, /lot-delete-summary lot-closure-summary/);
  assert.match(closeLot, /<dl>/);
  assert.match(hideLot, /lot-delete-summary lot-visibility-summary/);
  assert.match(hideLot, /lot-delete-counts/);
  assert.match(css, /\.lot-delete-summary dl > div \+ div \{[\s\S]*?border-left: 1px solid var\(--line-soft\);/);
  assert.match(css, /\.lot-delete-counts > span \{[\s\S]*?border-right: 1px solid var\(--line-soft\);/);
});

test('park-unit read-only summary becomes a flat detail group while warning treatment remains semantic', () => {
  assert.match(parkUnit, /class="tech-delete-confirm-card"/);
  assert.match(parkUnit, /class="tech-delete-warning"/);
  assert.match(css, /\.tech-delete-confirm-card/);
  assert.match(css, /\.tech-delete-warning,[\s\S]*?\.tech-permanent-delete-warning/);
});

test('shared choice-row flattening reaches lot and huddle forms globally', () => {
  assert.match(duplicateLot, /class="checkbox-card/);
  assert.match(huddle, /virtual-huddle-choice-row/);
  assert.match(css, /#modal-root \.modal-panel :is\([\s\S]*?\.lot-inline-option,[\s\S]*?\.virtual-huddle-choice-row[\s\S]*?border-bottom: 1px solid var\(--line-soft\);/);
  assert.match(css, /:has\(input:checked\)[\s\S]*?background: color-mix/);
});

test('app CSS cache-buster advances with the global modal structural flattening', () => {
  assert.match(head, /app\.css\?v=20260924-global-modal-structure/);
});
