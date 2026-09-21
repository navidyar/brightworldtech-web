'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const representativePages = [
  'views/pages/dashboard.ejs',
  'views/pages/management-lots.ejs',
  'views/pages/management-lot-detail.ejs',
  'views/pages/management-qc-reporting.ejs',
  'views/pages/management-label-library.ejs',
  'views/pages/management-label-builder.ejs',
  'views/pages/management-virtual-huddle.ejs',
  'views/pages/my-huddles.ejs',
  'views/pages/tech-units.ejs',
  'views/pages/tech-unit-detail.ejs',
  'views/pages/tech-unit-form.ejs',
  'views/pages/unit-requests.ejs',
  'views/pages/unit-request-detail.ejs'
];

test('representative application surfaces all enter through the shared three-file head', () => {
  representativePages.forEach((relativePath) => {
    const page = read(relativePath);
    assert.match(page, /include\('\.\.\/partials\/head', \{ pageTitle \}\)/, `${relativePath} must use the shared head`);
    assert.doesNotMatch(page, /<link\b[^>]*rel=["']stylesheet["']/i, `${relativePath} must not load CSS directly`);
  });

  const head = read('views/partials/head.ejs');
  const themeIndex = head.indexOf('/css/theme.css');
  const appIndex = head.indexOf('/css/app.css');
  const featuresIndex = head.indexOf('/css/features.css');
  assert.ok(themeIndex >= 0 && appIndex > themeIndex && featuresIndex > appIndex);
});

test('feature-heavy surfaces retain the explicit scopes required by consolidated selectors', () => {
  for (const relativePath of [
    'views/pages/management-lots.ejs',
    'views/pages/management-lot-detail.ejs',
    'views/pages/management-lot-new.ejs'
  ]) {
    assert.match(read(relativePath), /css-scope-lots/, `${relativePath} must retain the Lots scope`);
  }

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-detail.ejs',
    'views/pages/tech-unit-form.ejs'
  ]) {
    assert.match(read(relativePath), /css-scope-tech-units/, `${relativePath} must retain the Tech Units scope`);
  }

  for (const relativePath of [
    'views/pages/unit-requests.ejs',
    'views/pages/unit-request-detail.ejs',
    'views/pages/override-request-detail.ejs'
  ]) {
    assert.match(read(relativePath), /css-scope-unit-requests/, `${relativePath} must retain the Unit Requests scope`);
  }

  assert.match(read('views/pages/management-label-library.ejs'), /css-scope-management/);
  assert.match(read('views/pages/management-label-builder.ejs'), /css-scope-management[^"']*css-scope-label-builder|css-scope-label-builder[^"']*css-scope-management/);
});

test('shared presentation primitives are used by representative management and reporting surfaces', () => {
  const lots = read('views/pages/management-lots.ejs');
  const lotDetail = read('views/pages/management-lot-detail.ejs');
  const labelLibrary = read('views/pages/management-label-library.ejs');
  const qcReporting = read('views/pages/management-qc-reporting.ejs');
  const huddles = read('views/pages/my-huddles.ejs');

  assert.match(lots, /site-summary-panel/);
  assert.match(lotDetail, /site-summary-panel/);
  assert.match(labelLibrary, /site-summary-panel/);
  assert.match(qcReporting, /site-summary-panel/);
  assert.match(qcReporting, /site-clean-section/);
  assert.match(lots, /table-card/);
  assert.match(labelLibrary, /table-card/);
  assert.match(qcReporting, /table-card/);
  assert.match(huddles, /table-card/);
});

test('behavior-critical mechanics remain owned by features.css after application-wide consolidation', () => {
  const features = read('public/css/features.css');
  const app = read('public/css/app.css');
  const requiredMechanics = [
    '[hidden]',
    'lot-tree-row-hidden',
    'data-unit-form-field-key',
    '#modal-root:empty',
    'html.modal-open',
    '.site-date-picker-native',
    '.label-builder-canvas',
    '.label-builder-region',
    '.label-builder-resize-handle',
    '.virtual-huddle-backdrop'
  ];

  requiredMechanics.forEach((token) => {
    assert.ok(features.includes(token), `features.css must retain ${token}`);
  });

  for (const protectedToken of ['lot-tree-row-hidden', 'data-unit-form-field-key', 'label-builder-canvas', 'label-builder-resize-handle']) {
    assert.ok(!app.includes(protectedToken), `app.css must not take ownership of ${protectedToken}`);
  }
});

test('runtime CSS values remain custom-property inputs rather than inline presentation', () => {
  const viewsRoot = path.join(root, 'views');
  const violations = [];

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.name.endsWith('.ejs')) continue;
      const content = fs.readFileSync(absolutePath, 'utf8');
      for (const match of content.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/g)) {
        const declarations = match[2].split(';').map((value) => value.trim()).filter(Boolean);
        if (declarations.some((declaration) => !declaration.startsWith('--'))) {
          violations.push(path.relative(root, absolutePath));
          break;
        }
      }
    }
  };

  walk(viewsRoot);
  assert.deepEqual(violations, []);
});
