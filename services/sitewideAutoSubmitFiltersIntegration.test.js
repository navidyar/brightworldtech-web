'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('sitewide opt-in filter helper supports debounced text and immediate choice controls', () => {
  const head = read('views/partials/head.ejs');
  const client = read('public/js/auto-submit-filters.js');
  assert.match(head, /auto-submit-filters\.js\?v=20260918-fragment-preserve-focus/);
  assert.match(client, /data-auto-submit-filter-form/);
  assert.match(client, /data-auto-submit-filter="debounced"/);
  assert.match(client, /data-auto-submit-filter="immediate"/);
  assert.match(client, /requestSubmit\(\)/);
  assert.match(client, /autoSubmitFilterTarget/);
  assert.match(client, /currentTarget\.replaceWith\(incomingTarget\)/);
  assert.match(client, /history\.replaceState/);
});

test('Label Library template filters update without an Apply button', () => {
  const page = read('views/pages/management-label-library.ejs');
  assert.match(page, /data-auto-submit-filter-form/);
  assert.match(page, /data-auto-submit-filter-target="\.label-library-table-card"/);
  assert.match(page, /name="search"[\s\S]*?data-auto-submit-filter="debounced"/);
  assert.match(page, /name="category" data-auto-submit-filter="immediate"/);
  assert.match(page, /name="printScope" data-auto-submit-filter="immediate"/);
  assert.match(page, /name="status" data-auto-submit-filter="immediate"/);
  assert.doesNotMatch(page, />Apply<\/button>/);
});

test('simple Management processor and model catalog filters use the shared autosubmit behavior', () => {
  for (const file of ['views/pages/management-processors.ejs', 'views/pages/management-unit-models.ejs']) {
    const page = read(file);
    assert.match(page, /data-auto-submit-filter-form/);
    assert.match(page, /data-auto-submit-filter="debounced"/);
    assert.match(page, /data-auto-submit-filter="immediate"/);
    assert.doesNotMatch(page, />Apply Filters<\/button>/);
  }
});
