const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Cosmetic and Hardware Add actions live in their compact section headings', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /tech-form-section--cosmetic-issues[\s\S]*?form-section-header tech-repeatable-section-header[\s\S]*?tech-repeatable-section-heading[\s\S]*?data-add-module-row="cosmeticIssue"[^>]*>\+ Add<\/button>[\s\S]*?data-module-list="cosmeticIssue"/);
  assert.match(markup, /tech-form-section--hardware-issues[\s\S]*?form-section-header tech-repeatable-section-header[\s\S]*?tech-repeatable-section-heading[\s\S]*?data-add-module-row="hardwareIssue"[^>]*>\+ Add<\/button>[\s\S]*?data-module-list="hardwareIssue"/);
  assert.doesNotMatch(markup, /tech-repeatable-list-toolbar/);
});

test('Add controls retain a restrained fill with a stronger green border', () => {
  const css = read('public/css/tech-units-clean.css');

  assert.match(css, /button\.secondary-button\[data-add-module-row\][\s\S]*?border:\s*1px solid #6f9f7c[\s\S]*?background:\s*#edf7f0/);
  assert.match(css, /button\.secondary-button\[data-add-module-row\]:hover[\s\S]*?border-color:\s*#568762/);
});

test('Memory and Storage Remove controls align with the 39px form controls', () => {
  const css = read('public/css/tech-units-clean.css');
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(css, /\.tech-memory-edit-row > \.tech-memory-remove-button[\s\S]*?align-self:\s*end[\s\S]*?height:\s*39px[\s\S]*?min-height:\s*39px/);
  assert.match(markup, /data-module-row="memory"[\s\S]*?class="secondary-button tech-memory-remove-button"/);
  assert.match(markup, /data-module-row="storage"[\s\S]*?class="secondary-button tech-memory-remove-button"/);
});

test('Stage 10N assets are cache-busted on modal and full-page entry points', () => {
  for (const relativePath of [
    'views/pages/tech-unit-detail.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-units.ejs'
  ]) {
    assert.match(read(relativePath), /stage10q-hardware-none/);
  }
});
