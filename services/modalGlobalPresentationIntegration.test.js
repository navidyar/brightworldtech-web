'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appCss = read('public/css/app.css');
const featuresCss = read('public/css/features.css');
const setupLinkModal = read('views/fragments/management-user-setup-link-modal.ejs');
const duplicateLotModal = read('views/fragments/lot-duplicate-modal.ejs');
const exportModal = read('views/fragments/tech-unit-export-preview-modal.ejs');
const head = read('views/partials/head.ejs');

test('shared app CSS flattens ordinary modal form and option containers globally', () => {
  assert.match(appCss, /#modal-root \.modal-panel :is\(\.app-form, \.auth-form, \.workflow-list\) \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(appCss, /#modal-root \.modal-panel \.form-section \{[\s\S]*?border-bottom: 1px solid var\(--line-soft\);[\s\S]*?border-radius: 0;/);
  assert.match(appCss, /#modal-root \.modal-panel :is\(\.checkbox-card, \.workflow-item\) \{[\s\S]*?border-bottom: 1px solid var\(--line-soft\);[\s\S]*?background: transparent;/);
  assert.match(appCss, /app-form-clean \.form-section > :is\(\.form-grid, \.workflow-list\)[\s\S]*?border: 0;/);
});

test('global modal flattening reaches representative legacy modal families without page-specific stylesheets', () => {
  assert.match(setupLinkModal, /class="app-form"/);
  assert.match(setupLinkModal, /management-user-modal-summary/);
  assert.match(duplicateLotModal, /app-form app-form-clean/);
  assert.match(duplicateLotModal, /class="checkbox-card"/);
  assert.match(appCss, /management-user-modal-summary,[\s\S]*?lot-visibility-summary/);
  assert.doesNotMatch(featuresCss, /Global modal presentation/);
});

test('export controls remain in normal document flow instead of sticking over column choices', () => {
  assert.match(exportModal, /data-unit-export-action-toolbar/);
  assert.match(appCss, /\.unit-export-action-toolbar \{[\s\S]*?position: static;[\s\S]*?border-radius: 0;[\s\S]*?box-shadow: none;/);
  assert.doesNotMatch(appCss, /\.unit-export-action-toolbar \{[\s\S]*?position: sticky;/);
});

test('shared modal presentation stays in app.css and the changed stylesheet is cache-busted', () => {
  assert.match(head, /app\.css\?v=[^"\s]+/);
  assert.doesNotMatch(featuresCss, /modal-panel \.form-section/);
});
