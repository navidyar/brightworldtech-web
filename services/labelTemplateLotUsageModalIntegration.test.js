'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Label Library Lot count opens a compact Lot usage modal', () => {
  const library = read('views/pages/management-label-library.ejs');
  assert.match(library, /label-library-lot-usage-trigger/);
  assert.match(library, /\/templates\/<%= template\.label_template_id %>\/lots\/modal/);
  assert.match(library, /aria-label="View Lots using <%= template\.name %>"/);
  assert.match(library, /> Lot<%= Number\(template\.attached_lot_count\) === 1 \? '' : 's' %><\/a>/);
});

test('Lot usage route is management-only and precedes generic action modal', () => {
  const routes = read('routes/management.js');
  const usageRoute = routes.indexOf("'/management/label-library/templates/:labelTemplateId/lots/modal'");
  const genericAction = routes.indexOf("'/management/label-library/templates/:labelTemplateId/:action/modal'");
  assert.ok(usageRoute >= 0 && genericAction >= 0 && usageRoute < genericAction);
  assert.match(routes.slice(usageRoute, genericAction), /requireRole\(managementRoles\)/);
  assert.match(routes.slice(usageRoute, genericAction), /renderTemplateLotUsageModal/);
});

test('Lot usage controller reuses existing direct and effective assignment queries', () => {
  const controller = read('controllers/labelLibraryController.js');
  assert.match(controller, /listEffectiveTemplateLotUsage\(template\.label_template_id\)/);
  assert.match(controller, /listTemplateLotAttachments\(template\.label_template_id\)/);
  assert.match(controller, /effectiveUsage\.filter\(\(row\) => Number\(row\.is_active\) === 1\)/);
});

test('Lot usage modal distinguishes direct, inherited and inactive staging assignments', () => {
  const modal = read('views/fragments/label-template-lot-usage-modal.ejs');
  assert.match(modal, /Active Effective Use/);
  assert.match(modal, /Direct Lot Configurations/);
  assert.match(modal, /usage\.is_inherited/);
  assert.match(modal, />Inherited</);
  assert.match(modal, />Direct</);
  assert.match(modal, /Inactive/);
  assert.match(modal, /data-label-lot-usage-search/);
});

test('Lot usage modal supports client-side searching for large Lot lists', () => {
  const script = read('public/js/label-library-lot-usage.js');
  assert.match(script, /data-label-lot-usage-search/);
  assert.match(script, /data-label-lot-usage-row/);
  assert.match(script, /row\.hidden = !matches/);
  assert.match(script, /htmx:afterSwap/);
});
