'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('legacy Configuration Values selectors are removed from the global legacy stylesheet', () => {
  const legacyCss = read('public/css/style.css');

  [
    '.config-values-control-header',
    '.config-section-list',
    '.config-guidance-grid',
    '.config-value-form-grid',
    '.config-values-table-card',
    '.config-value-row-actions'
  ].forEach((selector) => assert.doesNotMatch(legacyCss, new RegExp(selector.replace('.', '\\.'))));
});

test('Model Catalog uses the current shared inactive-row selector', () => {
  const page = read('views/pages/management-unit-models.ejs');
  const sharedCss = read('public/css/app.css');

  assert.match(page, /configuration-value-row--inactive/);
  assert.doesNotMatch(page, /config-value-row--inactive/);
  assert.match(sharedCss, /\.configuration-value-row--inactive td/);
});

test('Processor Families no longer loads a standalone stylesheet', () => {
  const page = read('views/pages/processor-families.ejs');

  assert.doesNotMatch(page, /processor-families\.css/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'public/css/processor-families.css')), false);
});

test('Processor Family table, modal, member list, and responsive mechanics live in shared CSS', () => {
  const sharedCss = read('public/css/app.css');
  const featureCss = read('public/css/features.css');

  assert.match(sharedCss, /\.processor-family-toolbar/);
  assert.match(sharedCss, /\.processor-family-modal/);
  assert.match(sharedCss, /\.processor-family-form-grid/);
  assert.match(sharedCss, /\.processor-family-member-list/);
  assert.match(featureCss, /\[hidden\][\s\S]*display: none !important/);
  assert.match(sharedCss, /@media \(max-width: 800px\)/);
});
