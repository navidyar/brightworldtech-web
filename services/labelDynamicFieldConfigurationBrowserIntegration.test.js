'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Label Builder Dynamic Fields is a searchable Label Printing category inside Configuration Browser', () => {
  const page = read('views/pages/management-config.ejs');
  const category = read('views/fragments/label-dynamic-fields-config-group.ejs');

  assert.doesNotMatch(page, /<section class="site-clean-section site-clean-surface">[\s\S]*?<h2>Label Builder Dynamic Fields<\/h2>/);
  assert.match(page, /data-configuration-browser/);
  assert.match(page, /label-dynamic-fields-config-group/);
  assert.match(category, /<h2>Label Printing<\/h2>/);
  assert.match(category, /class="configuration-category" data-configuration-category/);
  assert.match(category, /<strong>Label Builder Dynamic Fields<\/strong>/);
  assert.match(category, /<code>label_dynamic_field_config<\/code>/);
});

test('Dynamic field rows participate in Configuration Browser search without changing protected field keys', () => {
  const category = read('views/fragments/label-dynamic-fields-config-group.ejs');

  assert.match(category, /data-configuration-value-row/);
  assert.match(category, /data-search-text="<%= fieldSearchText %>"/);
  assert.match(category, /field\.defaultLabel/);
  assert.match(category, /field\.key/);
  assert.match(category, /type="hidden" name="fieldKey"/);
  assert.match(category, /name="displayLabel"/);
  assert.match(category, /name="activeFieldKey"/);
});

test('Configuration Browser search disables Dynamic Field reordering until search is cleared', () => {
  const browser = read('public/js/config-values.js');
  const category = read('views/fragments/label-dynamic-fields-config-group.ejs');

  assert.match(browser, /labelDynamicFieldOrderLists = Array\.from\(browser\.querySelectorAll\('\[data-label-dynamic-field-order-list\]'\)\)/);
  assert.match(browser, /\[\.\.\.reorderLists, \.\.\.labelDynamicFieldOrderLists\]\.forEach/);
  assert.match(browser, /list\.addEventListener\('configuration:searchstate'/);
  assert.match(browser, /Clear Configuration Browser search to reorder Dynamic Fields\./);
  assert.match(category, /data-reorder-url="\/management\/config\/label-dynamic-fields\/order"/);
  assert.match(browser, /const disabled = searchActive \|\| saveInProgress/);
  assert.match(browser, /Saving order…/);
  assert.match(browser, /Order saved\./);
});
