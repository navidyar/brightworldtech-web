'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('Unit history and Tool details use effective permission keys while production-weight visibility remains permission-controlled', () => {
  const routes = read('routes/management.js');
  for (const [route, key, handler] of [
    ['/tech/units/:unitId/history', 'units.history.view', 'renderTechUnitHistoryPanel'],
    ['/tech/units/:unitId/tool-details', 'units.tool_details.view', 'renderToolDetails']
  ]) {
    assert.match(routes, new RegExp(`'${escapeRegex(route)}'[\\s\\S]*?requirePermission\\('${escapeRegex(key)}'\\)[\\s\\S]*?${handler}`));
  }
  const controller = read('controllers/techController.js');
  assert.ok(controller.includes("return req?.currentPermissions instanceof Set && req.currentPermissions.has('units.production_weight.view');"));
  assert.ok(controller.includes("return req?.currentPermissions instanceof Set && req.currentPermissions.has('units.production_weight.override');"));
  const table = read('views/fragments/tech-units-table.ejs');
  assert.ok(table.includes("const canViewUnitHistory = hasPermission('units.history.view');"));
  assert.doesNotMatch(table, /My Weight Earned|my-weight-earned|data-panel=\"my-weight\"/);
  assert.ok(table.includes("hasPermission('units.tool_details.view')"));
  assert.doesNotMatch(routes, /my-weight-earned|renderMyUnitWeightPanel/);
  assert.doesNotMatch(controller, /renderMyUnitWeightPanel/);
});
