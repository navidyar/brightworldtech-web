'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Configure Unit Form keeps the panel fixed and gives the full modal body the only vertical scrollbar', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-backdrop\.modal-backdrop \{[\s\S]*?align-items:\s*center;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?display:\s*flex;[\s\S]*?overflow:\s*hidden;[\s\S]*?border-radius:\s*10px;/);
  assert.match(css, /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-modal\.modal-panel\.site-clean-modal > \.modal-body \{[\s\S]*?min-height:\s*0;[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-y:\s*auto;/);
});

test('Configure Unit Form prevents a second vertical scrollbar inside the field tables', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rule-table-card \{[\s\S]*?overflow-x:\s*auto;[\s\S]*?overflow-y:\s*hidden;/);
  assert.match(css, /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-scroll \{[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(css, /\.lot-unit-form-rules-actions\s*\{[\s\S]*?position:\s*(?:sticky|fixed)/);
});

test('Configure Unit Form stylesheet is cache-busted consistently on every Lots management page', () => {
  for (const page of [
    'views/pages/management-lots.ejs',
    'views/pages/management-lot-detail.ejs',
    'views/pages/management-lot-new.ejs'
  ]) {
    assert.match(read(page), /\/css\/lots\.css\?v=20260811-stage10w(?:36-configure-unit-form-scroll|37-summary-border)/);
  }
});

test('Configure Unit Form uses a short-height viewport rule without moving actions into a sticky footer', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /@media \(max-height: 620px\)[\s\S]*?lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?max-height:\s*calc\(100dvh - 16px\)/);
  assert.doesNotMatch(css, /lot-unit-form-rules-actions[\s\S]{0,180}position:\s*(?:sticky|fixed)/);
});
