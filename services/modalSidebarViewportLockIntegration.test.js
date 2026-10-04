'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('modal scroll lock preserves sticky desktop shell geometry with overflow clip', () => {
  const css = read('public/css/features.css');

  assert.match(css, /html\.modal-open,\s*body\.modal-open\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?overflow:\s*clip;[\s\S]*?overscroll-behavior:\s*none;/);
});

test('shared modal mechanics remain cache-busted after viewport lock change', () => {
  const head = read('views/partials/head.ejs');

  assert.match(head, /features\.css\?v=20260930-modal-sidebar-viewport-lock/);
});
