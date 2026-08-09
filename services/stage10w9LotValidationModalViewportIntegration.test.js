'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Unit Requirement Details uses a dedicated viewport-aware backdrop', () => {
  const modal = read('views/fragments/lot-unit-validation-modal.ejs');

  assert.match(
    modal,
    /class="modal-backdrop lot-unit-validation-modal-backdrop" data-modal-backdrop/,
  );
  assert.match(
    modal,
    /class="modal-panel site-clean-modal lot-modal lot-unit-validation-modal"/,
  );
});

test('strict-Lot validation modal constrains the shell and scrolls the body', () => {
  const css = read('public/css/lots.css');

  assert.match(
    css,
    /\.lot-unit-validation-modal\.modal-panel\.site-clean-modal\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?max-height:\s*calc\(100dvh - 32px\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.lot-unit-validation-modal\s*>\s*\.modal-body\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(css, /\.lot-unit-validation-modal-backdrop\s*\{[\s\S]*?padding-block:\s*16px;/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?max-height:\s*calc\(100dvh - 20px\);/);
});

test('both Lots pages use the viewport-scroll cache-busted stylesheet', () => {
  const expected = '/css/lots.css?v=20260807-stage10w20-lot-hierarchy-integrity';

  assert.match(read('views/pages/management-lots.ejs'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(read('views/pages/management-lot-detail.ejs'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
