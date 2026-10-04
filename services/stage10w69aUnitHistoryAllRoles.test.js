'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Unit History route is controlled by the effective history permission', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /'\/tech\/units\/:unitId\/history',[\s\S]*?requirePermission\('units\.history\.view'\)[\s\S]*?renderTechUnitHistoryPanel/);
});

test('Unit Browser exposes History by permission without broadening production-weight visibility', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const controller = read('controllers/techController.js');

  assert.match(table, /const canViewUnitHistory = hasPermission\('units\.history\.view'\)/);
  assert.match(table, /<% if \(canViewUnitHistory\) \{ %>[\s\S]*?hx-get="\/tech\/units\/<%= unit\.unitId %>\/history<%= isQcPortalMode \? '\?qcPortal=1' : '' %>"[\s\S]*?>\s*History\s*<\/button>/);
  assert.match(controller, /function userCanViewProductionWeight[\s\S]*?units\.production_weight\.view/);
  assert.match(controller, /const timeline = userCanViewProductionWeight\(req\) && !qcPortalHistoryView[\s\S]*?: redactProductionWeightFromTimeline\(rawTimeline\)/);
});

test('QC status modal exposes its History shortcut by effective history permission', () => {
  const modal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');

  assert.match(modal, /const canViewUnitHistory = hasPermission\('units\.history\.view'\)/);
  assert.match(modal, /<% if \(unit && canViewUnitHistory\) \{ %>[\s\S]*?View Unit History/);
});
