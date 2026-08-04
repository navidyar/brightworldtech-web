'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const {
  mergeVisibleOrderIntoFullOrder
} = require('../public/js/config-values.js');

test('filtered ordering swaps only matching value slots and preserves hidden positions', () => {
  assert.deepEqual(
    mergeVisibleOrderIntoFullOrder(
      [1, 2, 3, 4, 5],
      [2, 4],
      [4, 2]
    ),
    [1, 4, 3, 2, 5]
  );
});

test('filtered ordering supports moving a matching value to the first matching slot', () => {
  assert.deepEqual(
    mergeVisibleOrderIntoFullOrder(
      [10, 20, 30, 40, 50, 60],
      [20, 40, 60],
      [60, 20, 40]
    ),
    [10, 60, 30, 20, 50, 40]
  );
});

test('invalid filtered order sets leave the complete order unchanged', () => {
  assert.deepEqual(
    mergeVisibleOrderIntoFullOrder([1, 2, 3], [1, 3], [3]),
    [1, 2, 3]
  );
  assert.deepEqual(
    mergeVisibleOrderIntoFullOrder([1, 2, 3], [1, 3], [3, 2]),
    [1, 2, 3]
  );
});

test('Configuration handles use pointer events rather than native draggable buttons', () => {
  const client = read('public/js/config-values.js');
  const page = read('views/pages/management-config.ejs');

  assert.match(client, /addEventListener\('pointerdown'/);
  assert.match(client, /addEventListener\('pointermove'/);
  assert.match(client, /addEventListener\('pointerup'/);
  assert.match(client, /addEventListener\('pointercancel'/);
  assert.doesNotMatch(client, /addEventListener\('dragstart'/);
  assert.doesNotMatch(page, /draggable="true"/);
});

test('search remains compatible with pointer and keyboard ordering', () => {
  const client = read('public/js/config-values.js');
  const page = read('views/pages/management-config.ejs');

  assert.match(client, /const disabled = saveInProgress/);
  assert.doesNotMatch(client, /saveInProgress \|\| searchActive/);
  assert.match(client, /getVisibleOrderRows\(list\)/);
  assert.match(client, /matching values can move; hidden values keep their positions/i);
  assert.match(page, /Search can remain active/);
  assert.match(page, /hidden values keep their positions/);
});

test('filtered ordering still submits the complete category order', () => {
  const client = read('public/js/config-values.js');

  assert.match(client, /const orderedConfigValueIds = getOrderIds\(list\)/);
  assert.match(client, /body: JSON\.stringify\(\{[\s\S]*orderedConfigValueIds/);
  assert.match(client, /restoreOrder\(list, previousOrder\)/);
});

test('pointer drag styling exposes a visible live drop position', () => {
  const css = read('public/css/app.css');

  assert.match(css, /is-pointer-dragging/);
  assert.match(css, /box-shadow: inset 0 2px 0/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /configuration-pointer-dragging/);
});

test('Configuration assets use the Stage 10S cache version', () => {
  const page = read('views/pages/management-config.ejs');
  const head = read('views/partials/head.ejs');

  assert.match(page, /stage10s-pointer-filtered-drag-order/);
  assert.match(head, /stage10s-pointer-filtered-drag-order/);
});
