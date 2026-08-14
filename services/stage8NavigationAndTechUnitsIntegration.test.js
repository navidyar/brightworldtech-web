'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('all shared Configuration routes are grouped under the Admin-only config router', () => {
  const configRoutes = read('routes/config.js');
  const lotRoutes = read('routes/lots.js');
  const systemRoutes = read('routes/system.js');

  assert.match(configRoutes, /const configRoles = \['admin'\]/);
  assert.match(configRoutes, /\/management\/config\/processor-families/);
  assert.match(configRoutes, /\/management\/config\/models/);
  assert.match(configRoutes, /\/management\/config\/database/);
  assert.match(configRoutes, /requireRole\(configRoles\)/);
  assert.doesNotMatch(lotRoutes, /processorFamilyController|processor-families/);
  assert.doesNotMatch(systemRoutes, /router\.get\([\s\S]*['"]\/database['"]/);
});

test('Admin navigation presents one Configuration entry with internal configuration tabs', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const configurationNav = read('views/partials/configuration-nav.ejs');

  assert.match(sidebar, /canAccessMenuArea\('admin'\)/);
  assert.match(sidebar, />Configuration</);
  assert.doesNotMatch(sidebar, />Config Values<[\s\S]*Management/);
  assert.doesNotMatch(sidebar, /href="\/database"/);
  assert.match(configurationNav, /label: 'Config Values'/);
  assert.match(configurationNav, /label: 'Processor Families'/);
  assert.match(configurationNav, /label: 'Model Catalog'/);
  assert.match(configurationNav, /label: 'Database Check'/);
});

test('every Admin Configuration page includes the shared section navigation', () => {
  for (const page of [
    'views/pages/management-config.ejs',
    'views/pages/processor-families.ejs',
    'views/pages/management-unit-models.ejs',
    'views/pages/database-check.ejs'
  ]) {
    assert.match(read(page), /partials\/configuration-nav/);
  }
});

test('Lot requirements select existing Processor Families without managing shared membership', () => {
  const lotRequirementsModal = read('views/fragments/lot-requirements-modal.ejs');
  const processorFamilyModal = read('views/fragments/processor-family-form-modal.ejs');

  assert.doesNotMatch(lotRequirementsModal, /Manage Processor Families/);
  assert.match(processorFamilyModal, /\/management\/config\/processor-families/);
});

test('Lot Details can open direct or descendant-inclusive Lot scope in the Tech Units Browser', () => {
  const lotDetail = read('views/pages/management-lot-detail.ejs');
  const techController = read('controllers/techController.js');
  const techUnitModel = read('models/techUnitModel.js');

  assert.match(lotDetail, /Open Direct Units/);
  assert.match(lotDetail, /Open Lot \+ Descendants/);
  assert.match(lotDetail, /\/tech\/units\?lotId=<%= lot\.lot_id %>&amp;lotScope=direct&amp;perPage=all/);
  assert.match(lotDetail, /\/tech\/units\?lotId=<%= lot\.lot_id %>&amp;lotScope=descendants&amp;perPage=all/);
  assert.match(techController, /allowAnyLotFilter: canViewAnyLotFilter\(req\)/);
  assert.match(techController, /\['admin', 'management'\]/);
  assert.match(techUnitModel, /availableFilterLots/);
  assert.match(techUnitModel, /filters\.allowAnyLotFilter === true/);
});

test('Tech Units use compact semantic actions and a prominent restrained Lot name', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /tech-unit-summary-lot/);
  assert.match(table, /tech-action-button--complete/);
  assert.match(table, /tech-action-button--edit/);
  assert.match(table, /tech-action-button--park/);
  assert.match(table, /tech-action-button--request/);
  assert.match(css, /\.tech-unit-summary-lot > strong/);
  assert.match(css, /#9a641f/);
  assert.match(css, /--tech-action-background/);
  assert.match(css, /\.tech-action-button--complete/);
  assert.match(css, /\.tech-action-button--edit/);
});

test('the sidebar remains scrollable while its scrollbar is visually hidden', () => {
  const sharedCss = read('public/css/app.css');

  assert.match(sharedCss, /\.sidebar \{[\s\S]*scrollbar-width: none/);
  assert.match(sharedCss, /\.sidebar::-webkit-scrollbar/);
  assert.match(sharedCss, /width: 0/);
});
