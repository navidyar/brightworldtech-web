'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('processor catalog actions use the local modal action handler instead of relying only on HTMX', () => {
  const page = read('views/pages/management-processors.ejs');
  assert.match(page, /processor-catalog-actions\.js\?v=20260810-stage10w30-processor-catalog-integrity/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/edit\/modal/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/families\/modal/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/merge\/modal/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/delete\/modal/);
});

test('processor catalog modal forms use the local reliable submit path', () => {
  for (const file of [
    'views/fragments/processor-catalog-edit-modal.ejs',
    'views/fragments/processor-catalog-families-modal.ejs',
    'views/fragments/processor-catalog-merge-modal.ejs',
    'views/fragments/processor-catalog-delete-modal.ejs'
  ]) {
    const markup = read(file);
    assert.match(markup, /data-processor-catalog-form/);
    assert.doesNotMatch(markup, /hx-post=/);
  }

  const merge = read('views/fragments/processor-catalog-merge-modal.ejs');
  assert.match(merge, /data-processor-catalog-confirm=/);
  assert.doesNotMatch(merge, /onsubmit=/);
});

test('processor needing-review actions use the same reliable modal handler', () => {
  const page = read('views/pages/processor-families.ejs');
  assert.match(page, /processor-catalog-actions\.js\?v=20260810-stage10w30-processor-catalog-integrity/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/edit\/modal\?returnTo=processor-families"/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/families\/modal\?returnTo=processor-families"/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/merge\/modal\?returnTo=processor-families"/);
  assert.match(page, /data-processor-catalog-modal-url="\/management\/config\/processors\/<%= processor\.id %>\/delete\/modal\?returnTo=processor-families"/);
});

test('local processor action handler performs same-origin GET and POST requests and honors server redirects', () => {
  const script = read('public/js/processor-catalog-actions.js');
  assert.match(script, /credentials: 'same-origin'/);
  assert.match(script, /'HX-Request': 'true'/);
  assert.match(script, /response\.headers\.get\('HX-Redirect'\)/);
  assert.match(script, /document\.addEventListener\('click'/);
  assert.match(script, /document\.addEventListener\('submit'/);
  assert.match(script, /installModalMarkup/);
});

test('processor catalog action handler has valid JavaScript syntax', () => {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/js/processor-catalog-actions.js')], {
    stdio: 'pipe'
  });
});
