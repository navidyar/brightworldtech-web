const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('processor catalog does not display database id beneath processor name', () => {
  const view = read('views/pages/management-processors.ejs');
  assert.match(view, /<td><strong><%= processor\.modelCode %><\/strong><\/td>/);
  assert.doesNotMatch(view, /table-muted-line">#<%= processor\.id %>/);
});

test('configuration browser action buttons stay linear until the shared responsive breakpoint', () => {
  const css = read('public/css/app.css');
  const head = read('views/partials/head.ejs');
  assert.match(css, /\.configuration-value-actions\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*?\.configuration-value-actions,[\s\S]*?\.model-catalog-row-actions\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*stretch;[\s\S]*?white-space:\s*normal;/);
  assert.match(head, /app\.css\?v=20260811-stage10w41-config-subtab-actions/);
});
