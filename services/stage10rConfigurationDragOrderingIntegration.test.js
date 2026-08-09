'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Configuration exposes an Admin-only category order endpoint', () => {
  const routes = read('routes/config.js');
  const controller = read('controllers/configController.js');

  assert.match(routes, /\/management\/config\/categories\/:configCategoryId\/order/);
  assert.match(routes, /requireRole\(configRoles\)[\s\S]*configController\.reorderConfigValues/);
  assert.match(controller, /async function reorderConfigValues/);
  assert.match(controller, /orderedConfigValueIds/);
  assert.match(controller, /res\.status\(error\.statusCode\)\.json/);
});

test('manual ordering policy excludes popularity lists and requires three active values', () => {
  const policy = read('services/configurationOrderingPolicy.js');
  const model = read('models/configModel.js');

  assert.match(policy, /MINIMUM_DRAG_ORDER_VALUES = 3/);
  assert.match(policy, /'unit_categories'/);
  assert.match(policy, /'cosmetic_issue_types'/);
  assert.match(policy, /'hardware_issue_types'/);
  assert.match(policy, /'issue_locations'/);
  assert.match(model, /getConfigCategoryOrderingPolicy\(category\.code, activeValues\.length\)/);
  assert.match(model, /usesPopularitySorting/);
  assert.match(model, /supportsDragOrdering/);
});

test('server-side reorder validates the exact list and saves one transactional normalized order', () => {
  const model = read('models/configModel.js');

  assert.match(model, /async function reorderConfigValues/);
  assert.match(model, /beginTransaction\(\)/);
  assert.match(model, /FOR UPDATE/);
  assert.match(model, /isPopularitySortedConfigCategory\(category\.code\)/);
  assert.match(model, /reorderableRows\.length < 3/);
  assert.match(model, /hasExactValueSet/);
  assert.match(model, /CONFIG_ORDER_STALE/);
  assert.match(model, /SET sort_order = CASE config_value_id/);
  assert.match(model, /\(index \+ 1\) \* 10/);
  assert.match(model, /commit\(\)/);
  assert.match(model, /rollback\(\)/);
});

test('eligible Configuration tables render compact drag handles and popularity lists remain labeled', () => {
  const page = read('views/pages/management-config.ejs');

  assert.match(page, /category\.supportsDragOrdering && category\.values\.length >= 3/);
  assert.match(page, /data-configuration-reorder-list/);
  assert.match(page, /data-reorder-url="\/management\/config\/categories\//);
  assert.match(page, /data-configuration-order-row/);
  assert.match(page, /data-configuration-drag-handle/);
  assert.match(page, /Popularity sorted/);
  assert.match(page, /Drag order/);
  assert.match(page, /Changes save automatically/);
  assert.match(page, /stage10w-ranking-administration/);
});

test('client drag ordering supports pointer input, keyboard, autosave, rollback, and filtered search', () => {
  const client = read('public/js/config-values.js');

  assert.match(client, /pointerdown/);
  assert.match(client, /pointermove/);
  assert.match(client, /pointerup/);
  assert.match(client, /pointercancel/);
  assert.match(client, /ArrowUp/);
  assert.match(client, /ArrowDown/);
  assert.match(client, /Home/);
  assert.match(client, /End/);
  assert.match(client, /fetch\(list\.dataset\.reorderUrl/);
  assert.match(client, /Order saved\./);
  assert.match(client, /restoreOrder\(list, previousOrder\)/);
  assert.match(client, /Filtered ordering is active/);
  assert.match(client, /applyVisibleRowOrder/);
  assert.match(client, /mergeVisibleOrderIntoFullOrder/);
  assert.match(client, /configuration:searchstate/);
});

test('drag-managed modal values append automatically and no longer require numeric maintenance', () => {
  const modal = read('views/fragments/config-value-form-modal.ejs');
  const client = read('public/js/config-values.js');
  const controller = read('controllers/configController.js');
  const model = read('models/configModel.js');

  assert.match(modal, /data-drag-order-managed/);
  assert.match(modal, /data-configuration-sort-order-field/);
  assert.match(modal, /data-configuration-form-ordering-note/);
  assert.match(client, /sortField\.hidden = dragOrderManaged/);
  assert.match(client, /new value will be added to the end/);
  assert.match(controller, /getNextConfigValueSortOrder/);
  assert.match(model, /COALESCE\(MAX\(sort_order\), 0\) \+ 10/);
});

test('shared Configuration styling keeps the reorder affordance compact', () => {
  const css = read('public/css/app.css');
  const head = read('views/partials/head.ejs');

  assert.match(css, /\.configuration-drag-handle/);
  assert.match(css, /width: 30px/);
  assert.match(css, /height: 30px/);
  assert.match(css, /cursor: grab/);
  assert.match(css, /\.configuration-order-column/);
  assert.match(css, /\.configuration-ordering-status\[data-state='error'\]/);
  assert.match(head, /app\.css\?v=20260804-stage10w-ranking-administration/);
});
