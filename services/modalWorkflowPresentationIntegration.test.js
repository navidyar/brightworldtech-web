'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appCss = read('public/css/app.css');
const completeModal = read('views/fragments/tech-unit-complete-work-modal.ejs');
const reverseModal = read('views/fragments/tech-unit-reverse-completion-modal.ejs');
const head = read('views/partials/head.ejs');

test('completion and reversal dialogs opt into the shared flat workflow-detail shell', () => {
  assert.match(completeModal, /site-clean-modal workflow-detail-modal tech-complete-work-modal/);
  assert.match(reverseModal, /site-clean-modal workflow-detail-modal tech-complete-work-modal/);
  assert.match(completeModal, /modal-body workflow-detail-body/);
  assert.match(reverseModal, /modal-body workflow-detail-body/);
});

test('workflow detail summaries are flattened instead of rendered as nested cards', () => {
  assert.match(completeModal, /tech-override-summary workflow-detail-summary/);
  assert.match(reverseModal, /tech-override-summary workflow-detail-summary/);
  assert.match(appCss, /workflow-detail-modal \.workflow-detail-summary \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
});

test('completion attribution choices use flat rows with a selected-state tint', () => {
  assert.match(completeModal, /checkbox-card workflow-detail-choice/);
  assert.match(appCss, /workflow-detail-modal \.workflow-detail-choice \{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid var\(--line-soft\);/);
  assert.match(appCss, /workflow-detail-choice:has\(input:checked\)[\s\S]*?background: var\(--ui-blue-soft\);/);
});

test('workflow form sections retain controls but drop unnecessary container chrome', () => {
  assert.match(completeModal, /form-section workflow-detail-section/);
  assert.match(reverseModal, /app-form workflow-detail-form workflow-detail-form--simple/);
  assert.match(appCss, /workflow-detail-modal \.workflow-detail-section \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
});

test('flat detail modal families drop the redundant outer border and shared CSS is cache-busted', () => {
  assert.match(appCss, /#modal-root \.modal-panel\.site-clean-modal:is\(\.record-detail-modal, \.workflow-detail-modal\) \{[\s\S]*?border: 0;/);
  assert.match(appCss, /#modal-root \.modal-panel\.site-clean-modal\.workflow-detail-modal > \.workflow-detail-body \{[\s\S]*?padding: 10px 18px 18px;/);
  assert.match(head, /app\.css\?v=[^"\s]+/);
});
