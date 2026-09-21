'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shared CSS provides vertical separation between section headers and immediate content surfaces', () => {
  const css = read('public/css/app.css');
  assert.match(css, /\.content-card > \.content-header \+ :is\([\s\S]*?\.table-card,[\s\S]*?\.app-form-clean,[\s\S]*?\.virtual-huddle-message-copy,[\s\S]*?\.dashboard-filter-form,[\s\S]*?\.all-tech-metrics-scroll,[\s\S]*?\.unit-request-detail-grid[\s\S]*?\)\s*,/);
  assert.match(css, /margin-top:\s*var\(--ui-space-md\)/);
});

test('shared CSS separates notes from forms, tables, and other bordered follow-up surfaces', () => {
  const css = read('public/css/app.css');
  assert.match(css, /:is\(\.content-card, \.modal-body\) > :is\(\.message, \.notice\) \+ :is\([\s\S]*?form,[\s\S]*?\.form-grid,[\s\S]*?\.table-card,[\s\S]*?\.site-clean-section,[\s\S]*?\.virtual-huddle-message-copy/);
});

test('shared CSS separates nested Unit Form module headings from their first control grid', () => {
  const css = read('public/css/app.css');
  assert.match(css, /:where\(body\.css-scope-tech-units, body\.css-scope-unit-requests\)[\s\S]*?\.tech-unit-form \.workflow-item \.content-header \+ \.form-grid[\s\S]*?margin-top:\s*var\(--ui-space-md\)/);
});

test('Virtual Huddle table surfaces and Label Template intro note use the shared spacing boundaries', () => {
  const history = read('views/pages/management-virtual-huddle.ejs');
  const detail = read('views/pages/management-virtual-huddle-detail.ejs');
  const myHuddles = read('views/pages/my-huddles.ejs');
  const labelTemplate = read('views/fragments/label-template-form-modal.ejs');

  assert.match(history, /class="content-header"[\s\S]*?class="table-card"/);
  assert.match(detail, /Acknowledgment Status[\s\S]*?class="table-card"/);
  assert.match(myHuddles, /Acknowledged Huddles[\s\S]*?class="table-card"/);
  assert.match(labelTemplate, /class="message info"[\s\S]*?<\/div>\s*<form\b/);
});

test('shared app stylesheet cache key is bumped for the vertical-rhythm correction', () => {
  for (const relativePath of ['views/partials/head.ejs', 'views/pages/error.ejs', 'views/pages/not-found.ejs']) {
    assert.match(read(relativePath), /\/css\/app\.css\?v=20260921-shared-vertical-rhythm-final/);
  }
});
