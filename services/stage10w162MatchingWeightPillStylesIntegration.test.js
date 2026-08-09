'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Lot and individual Unit weight pills share the same blue background and border', () => {
  const css = read('public/css/tech-units-clean.css');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(
    css,
    /\.tech-units-clean-page \.tech-unit-summary-weight-value \{[\s\S]*?border: 1px solid #c6d9ee;[\s\S]*?background: #edf5ff;/,
  );
  assert.doesNotMatch(css, /\.tech-unit-summary-weight-value--override\s*\{/);
  assert.match(table, /class="tech-unit-summary-weight-value"[\s\S]*?Current lot weight/);
  assert.match(table, /class="tech-unit-summary-weight-value tech-unit-summary-weight-value--override"[\s\S]*?Individual weight/);
});

test('all Unit Browser entry points use the matched-weight-pill stylesheet version', () => {
  const expected = '/css/tech-units-clean.css?v=20260806-stage10w162-matched-weight-pill-styles';

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    assert.match(read(relativePath), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
