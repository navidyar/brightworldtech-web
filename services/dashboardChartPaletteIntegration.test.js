'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('all dashboard pies share the refreshed moderate chart palette', () => {
  const theme = read('public/css/theme.css');
  const head = read('views/partials/head.ejs');
  const dashboard = read('views/fragments/dashboard-foundation.ejs');
  const tech = read('views/fragments/tech-dashboard-productivity.ejs');
  const management = read('views/fragments/management-dashboard-completion-foundation.ejs');
  for (const token of ['orange','blue','purple','red','teal','slate','green','brown']) {
    assert.match(theme, new RegExp(`--chart-${token}: #[0-9a-f]{6};`, 'i'));
    assert.match(dashboard + tech + management, new RegExp(`var\\(--chart-${token}\\)`));
  }
  assert.match(head, /theme\.css\?v=20261002-dashboard-palette-r1/);
});
