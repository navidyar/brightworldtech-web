const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Configure Unit Form summary has no outer border while individual metric cells retain their borders', () => {
  const css = read('public/css/app.css');

  assert.match(
    css,
    /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-summary \{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/
  );
  assert.match(
    css,
    /\.lot-unit-form-rules-summary span \{[\s\S]*?border:\s*1px solid var\(--line\);/
  );
});

test('Lots pages keep the consolidated Lots CSS scope', () => {
  for (const pagePath of [
    'views/pages/management-lot-new.ejs',
    'views/pages/management-lots.ejs',
    'views/pages/management-lot-detail.ejs'
  ]) {
    const page = read(pagePath);
    assert.match(page, /css-scope-lots/);
    assert.doesNotMatch(page, /\/css\/lots\.css/);
  }
});
