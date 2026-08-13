'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function stageSection(css) {
  const marker = '/* Stage 10W45 — application-wide visual consistency consolidation.';
  const index = css.indexOf(marker);
  assert.notEqual(index, -1, 'Stage 10W45 shared CSS section should exist');
  return css.slice(index);
}

test('shared stylesheet cache key is refreshed on normal and standalone pages', () => {
  const head = read('views/partials/head.ejs');
  const errorPage = read('views/pages/error.ejs');
  const notFoundPage = read('views/pages/not-found.ejs');

  for (const markup of [head, errorPage, notFoundPage]) {
    assert.match(markup, /\/css\/app\.css\?v=[^\"]+/);
  }
});

test('all action-modal close icons use the shared close-button class', () => {
  const fragmentsDirectory = path.join(root, 'views', 'fragments');
  const modalFiles = fs.readdirSync(fragmentsDirectory)
    .filter((filename) => filename.endsWith('.ejs'))
    .filter((filename) => read(path.join('views', 'fragments', filename)).includes('data-modal-backdrop'));

  assert.ok(modalFiles.length >= 20, 'expected the application modal inventory to be present');

  modalFiles.forEach((filename) => {
    const markup = read(path.join('views', 'fragments', filename));
    assert.doesNotMatch(markup, /class=["']modal-close["']/,
      `${filename} should not use the legacy modal-close class`);
  });
});

test('shared modal visual contract normalizes corners and typography without taking over scrolling', () => {
  const css = stageSection(read('public/css/app.css'));

  assert.match(css, /--ui-modal-radius:\s*12px/);
  assert.match(css, /\.modal-panel\s*\{[\s\S]*?border-radius:\s*var\(--ui-modal-radius\)/);
  assert.match(css, /\.modal-panel\s*>\s*:first-child\s*\{[\s\S]*?border-top-left-radius:\s*inherit[\s\S]*?border-top-right-radius:\s*inherit/);
  assert.match(css, /\.modal-panel\s*>\s*:last-child\s*\{[\s\S]*?border-bottom-right-radius:\s*inherit[\s\S]*?border-bottom-left-radius:\s*inherit/);
  assert.match(css, /\.modal-panel\s+:is\(\.modal-header h2, \.modal-section-title\)[\s\S]*?font-weight:\s*var\(--ui-font-weight-strong\)/);
  assert.match(css, /\.modal-panel\s+:is\(\.modal-close-button, \.modal-close\)/);

  const modalContractStart = css.indexOf('/* Modal visual contract.');
  const dashboardStart = css.indexOf('/* Dashboard and role surfaces:');
  const modalContract = css.slice(modalContractStart, dashboardStart);
  assert.doesNotMatch(modalContract, /overflow(?:-x|-y)?:\s*(?:hidden|auto|scroll)/,
    'shared modal visual normalization must not own feature scrolling');
});

test('dashboard surfaces and forms use the shared restrained presentation contract', () => {
  const css = stageSection(read('public/css/app.css'));

  assert.match(css, /\.dashboard-hero\s*\{[\s\S]*?border:\s*1px solid #c8d8ea[\s\S]*?border-radius:\s*var\(--ui-radius-panel\)/);
  assert.match(css, /\.dashboard-metric-card\s*\{[\s\S]*?border-top-width:\s*1px[\s\S]*?border-left:\s*3px solid/);
  assert.match(css, /\.role-dashboard-card\s*\{[\s\S]*?border:\s*1px solid var\(--ui-line\)[\s\S]*?border-radius:\s*var\(--ui-radius-panel\)/);
  assert.match(css, /\.dashboard-filter-form,\s*\n\.dashboard-period-form\s*\{[\s\S]*?align-items:\s*end !important/);
  assert.match(css, /\.dashboard-period-form[\s\S]*?border-radius:\s*var\(--ui-radius-panel\)/);
  assert.match(css, /\.dashboard-period-form\s*>\s*:is\(\.primary-button, button\.primary-button\)[\s\S]*?margin-top:\s*0 !important/);
});

test('Stage 10W45 visual layer does not style protected Lot or Unit workflow mechanics', () => {
  const css = stageSection(read('public/css/app.css'));
  const protectedTokens = [
    'lot-tree-toggle',
    'lot-tree-row-hidden',
    'data-unit-form-field-key',
    'data-unit-form-follows-key',
    'data-unit-form-auto-collapse'
  ];

  protectedTokens.forEach((token) => {
    assert.equal(css.includes(token), false, `Stage 10W45 must not style protected feature token ${token}`);
  });
});
