const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Configure Unit Form summary has no outer border while individual metric cells retain their borders', () => {
  const css = read('public/css/lots.css');

  assert.match(
    css,
    /body\.lots-lookup-ui-preview #modal-root \.lot-unit-form-rules-summary \{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/
  );
  assert.match(
    css,
    /\.lot-unit-form-rules-summary span \{[\s\S]*?border:\s*1px solid var\(--line\);/
  );
});

test('Lots pages load the Stage 10W37 cache-busted stylesheet', () => {
  for (const page of [
    'views/pages/management-lot-new.ejs',
    'views/pages/management-lots.ejs',
    'views/pages/management-lot-detail.ejs'
  ]) {
    assert.match(read(page), /\/css\/lots\.css\?v=20260811-stage10w37-summary-border/);
  }
});
