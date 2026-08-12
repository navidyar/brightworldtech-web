'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Configure Unit Form assigns vertical scrolling to the modal body only', () => {
  const css = read('public/css/lots.css');
  const modal = read('views/fragments/lot-unit-form-rules-modal.ejs');

  assert.match(modal, /modal-backdrop lot-unit-form-rules-backdrop/);
  assert.match(css, /lot-unit-form-rules-backdrop\.modal-backdrop \{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /lot-unit-form-rules-modal\.modal-panel\.site-clean-modal > \.modal-body \{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /lot-unit-form-rules-scroll \{[\s\S]*?overflow:\s*visible;/);
});

test('Configure Unit Form remains bounded to short viewports without a sticky action footer', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?max-height:\s*calc\(100dvh - 16px\)/);
  assert.doesNotMatch(css, /\.lot-unit-form-rules-actions\s*\{[\s\S]*?position:\s*(?:sticky|fixed)/);
});
