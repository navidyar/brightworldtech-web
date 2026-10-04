'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appCss = read('public/css/app.css');
const editModal = read('views/fragments/management-user-edit-modal.ejs');
const createModal = read('views/fragments/management-user-create-modal.ejs');
const head = read('views/partials/head.ejs');

test('management create/edit user dialogs opt into the flat form modal pattern', () => {
  assert.match(editModal, /management-user-form-modal flat-form-modal/);
  assert.match(createModal, /management-user-form-modal flat-form-modal/);
  assert.match(appCss, /#modal-root \.flat-form-modal \.auth-form \{[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
});

test('management user status and role choices use flat sections instead of nested containers', () => {
  assert.match(appCss, /#modal-root \.flat-form-modal \.management-user-modal-summary \{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid var\(--line-soft\);/);
  assert.match(appCss, /#modal-root \.flat-form-modal \.management-user-modal-roles \{[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.match(appCss, /#modal-root \.flat-form-modal \.management-user-modal-roles \.workflow-item \{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid var\(--line-soft\);[\s\S]*?border-radius: 0;/);
  assert.match(appCss, /workflow-item:is\(\.active, :has\(input:checked\)\)[\s\S]*?background: color-mix/);
});

test('flat form modal CSS is cache-busted', () => {
  assert.match(head, /app\.css\?v=[^"\s]+/);
});
