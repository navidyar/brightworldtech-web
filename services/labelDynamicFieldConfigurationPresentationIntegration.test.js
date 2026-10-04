const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Label Builder Dynamic Fields use compact shared configuration-table controls', () => {
  const view = read('views/fragments/label-dynamic-fields-config-group.ejs');
  const css = read('public/css/app.css');

  assert.match(view, /configuration-values-table configuration-editable-table/);
  assert.match(view, /class="configuration-table-text-input" type="text" name="displayLabel"/);
  assert.match(view, /class="configuration-table-toggle"/);
  assert.doesNotMatch(view, /<label class="configuration-inline-checkbox">[\s\S]*?name="activeFieldKey"/);

  assert.match(css, /\.configuration-editable-table th,[\s\S]*?vertical-align: middle;/);
  assert.match(css, /\.configuration-editable-table th:last-child,[\s\S]*?min-width: 112px;/);
  assert.match(css, /\.configuration-table-text-input {[\s\S]*?width: min\(260px, 100%\);/);
  assert.match(css, /\.configuration-table-toggle {[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
});

test('Configuration app stylesheet cache-buster advances with compact table controls', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /\/css\/app\.css\?v=20260925-config-table-controls/);
});
