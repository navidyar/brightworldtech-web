'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Dynamic Field drag order auto-saves while labels and active state keep explicit Save', () => {
  const category = read('views/fragments/label-dynamic-fields-config-group.ejs');
  const browser = read('public/js/config-values.js');
  const page = read('views/pages/management-config.ejs');

  assert.match(category, /Order saves automatically\./);
  assert.match(category, /Display Label and Active changes still require Save Dynamic Fields\./);
  assert.match(category, /data-reorder-url="\/management\/config\/label-dynamic-fields\/order"/);
  assert.match(category, /<button class="primary-button" type="submit">Save Dynamic Fields<\/button>/);
  assert.match(browser, /fetch\(list\.dataset\.reorderUrl/);
  assert.match(browser, /orderedFieldKeys/);
  assert.match(page, /config-values\.js\?v=20260925-label-dynamic-order-autosave/);
});
