'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Processor Types is a normal collapsible category inside the Configuration Browser', () => {
  const page = read('views/pages/management-config.ejs');
  const category = read('views/fragments/processor-types-config-category.ejs');

  assert.doesNotMatch(page, /aria-labelledby="processor-types-heading"/);
  assert.match(page, /section\.key === 'unit-workflow'/);
  assert.match(page, /include\('\.\.\/fragments\/processor-types-config-category'/);
  assert.match(category, /class="configuration-category" data-configuration-category/);
  assert.match(category, /<strong>Processor Types<\/strong>/);
  assert.match(category, /<code>processor_types<\/code>/);
});

test('Processor Type rows participate in normal Configuration Browser searching and actions', () => {
  const category = read('views/fragments/processor-types-config-category.ejs');

  assert.match(category, /data-configuration-value-row/);
  assert.match(category, /data-search-text="<%= rowSearchText %>"/);
  assert.match(category, /Add Processor Type/);
  assert.match(category, />Edit<\/a>/);
  assert.match(category, />Delete<\/a>/);
});
