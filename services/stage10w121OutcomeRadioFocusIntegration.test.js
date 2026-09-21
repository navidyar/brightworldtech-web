'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Pass and Fail use a circular field-style focus halo on the native radio only', () => {
  const css = read('public/css/app.css');
  const marker = '/* Stage 10W.12.1 — circular keyboard-focus halo for Pass/Fail radios. */';
  const markerIndex = css.indexOf(marker);

  assert.notEqual(markerIndex, -1);

  const block = css.slice(markerIndex, markerIndex + 700);
  assert.match(block, /input\[type="radio"\]\[data-outcome-tab-stop\]:is\(:focus, :focus-visible\)/);
  assert.match(block, /border-radius:\s*50%/);
  assert.match(block, /outline:\s*none\s*!important/);
  assert.match(block, /box-shadow:\s*var\(--form-field-focus-shadow,\s*0 0 0 3px rgba\(49, 94, 157, 0\.16\)\)\s*!important/);
  assert.doesNotMatch(block, /\.tech-outcome-option:has/);
  assert.doesNotMatch(block, /border:\s*[1-9]/);
});


test('sitewide checkbox/radio rows do not receive a containing-label focus aura', () => {
  const css = read('public/css/app.css');

  assert.match(
    css,
    /body label:has\(:is\(input\[type="checkbox"\], input\[type="radio"\]\):is\(:focus, :focus-visible\)\) \{[\s\S]*?box-shadow:\s*none\s*!important;[\s\S]*?\}/
  );
  assert.doesNotMatch(
    css,
    /label:has\(input\[type="checkbox"\]:is\(:focus, :focus-visible\)\)[^{]*\{[\s\S]{0,250}?box-shadow:\s*var\(--form-field-focus-shadow\)/
  );
});

test('the shared app stylesheet carries the sitewide focus cleanup after work-area retirement', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /\/css\/app\.css\?v=/);
  assert.doesNotMatch(head, /work-area\.css/);
});

test('the outcome controls retain explicit Pass and Fail keyboard tab stops', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');
  const outcomeInputLine = markup.split('\n').find((line) => line.includes('name="outcomeCode"')) || '';

  assert.match(outcomeInputLine, /tabindex="0"/);
  assert.match(outcomeInputLine, /data-outcome-tab-stop/);
  assert.match(markup, /outcomeOptions\.forEach/);
});

test('all Add/Edit Unit entry points use the shared Tech Units CSS scope', () => {
  assert.match(read('views/partials/head.ejs'), /\/css\/app\.css\?v=/);
  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs',
  ]) {
    const page = read(relativePath);
    assert.match(page, /<body class="css-scope-tech-units">/);
    assert.doesNotMatch(page, /tech-units-clean\.css/);
  }
});
