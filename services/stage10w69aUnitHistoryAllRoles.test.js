'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Unit History route is available to every Unit Browser role', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /const unitBrowserRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /const unitHistoryRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /'\/tech\/units\/:unitId\/history',[\s\S]*?requireRole\(unitHistoryRoles\)[\s\S]*?renderTechUnitHistoryPanel/);
});

test('Unit Browser exposes History to Regular Tech and QC without broadening weight visibility', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const controller = read('controllers/techController.js');

  assert.match(table, /const canViewUnitHistory = currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead', 'qc', 'tech'\]\.includes\(roleCode\)\)/);
  assert.match(table, /<% if \(canViewUnitHistory\) \{ %>[\s\S]*?hx-get="\/tech\/units\/<%= unit\.unitId %>\/history<%= isQcPortalMode \? '\?qcPortal=1' : '' %>"[\s\S]*?>\s*History\s*<\/button>/);
  assert.match(controller, /function userCanViewProductionWeight[\s\S]*?\['admin', 'management', 'tech_lead'\]/);
  assert.match(controller, /const timeline = userCanViewProductionWeight\(req\) && !qcPortalHistoryView[\s\S]*?: redactProductionWeightFromTimeline\(rawTimeline\)/);
});

test('QC status modal exposes its History shortcut to every Unit Browser role', () => {
  const modal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');

  assert.match(modal, /const canViewUnitHistory = currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead', 'qc', 'tech'\]\.includes\(roleCode\)\)/);
  assert.match(modal, /<% if \(unit && canViewUnitHistory\) \{ %>[\s\S]*?View Unit History/);
});
