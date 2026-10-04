'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('modal backdrop owns vertical scrolling while modal chrome remains in normal document flow', () => {
  const css = read('public/css/features.css');

  assert.match(css, /#modal-root \.modal-backdrop \{[\s\S]*?align-items: start !important;[\s\S]*?overflow-y: auto !important;/);
  assert.match(css, /#modal-root \.modal-panel \{[\s\S]*?max-height: none !important;[\s\S]*?overflow: visible !important;/);
  assert.match(css, /#modal-root \.modal-panel > :is\([\s\S]*?\.modal-header,[\s\S]*?\.modal-body,[\s\S]*?\.modal-footer,[\s\S]*?\.tech-qc-modal-footer[\s\S]*?position: static !important;/);
  assert.match(css, /#modal-root \.modal-panel > :is\(\.modal-body, \.tech-qc-status-modal__body\) \{[\s\S]*?overflow: visible !important;/);
});

test('nested modal action rows and table headings cannot become sticky chrome', () => {
  const css = read('public/css/features.css');

  assert.match(css, /#modal-root \.modal-panel :is\(\.form-actions, \.modal-actions\) \{[\s\S]*?position: static !important;/);
  assert.match(css, /#modal-root \.modal-panel th \{[\s\S]*?position: static !important;[\s\S]*?top: auto !important;/);
});

test('modal natural-scroll mechanics stay in features.css and are cache-busted through the shared head', () => {
  const appCss = read('public/css/app.css');
  const featuresCss = read('public/css/features.css');
  const head = read('views/partials/head.ejs');

  assert.doesNotMatch(appCss, /Global modal natural-scroll contract/);
  assert.match(featuresCss, /Global modal natural-scroll contract/);
  assert.match(head, /features\.css\?v=20260930-modal-sidebar-viewport-lock/);
});
