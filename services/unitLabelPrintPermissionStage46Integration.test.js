'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('Unit label printing uses effective permissions across single, bulk, and recent-print paths', () => {
  const routes = read('routes/management.js');
  for (const [route, handler] of [
    ['/tech/units/:unitId/print-label/modal', 'renderTechUnitPrintLabelModal'],
    ['/tech/units/:unitId/print-label', 'printTechUnitLabel'],
    ['/tech/units/print-labels/modal', 'renderTechUnitsBulkPrintLabelModal'],
    ['/tech/units/print-labels', 'printTechUnitsBulkLabels']
  ]) {
    const block = routes.match(new RegExp(`'${route.replaceAll('/', '\\/')}'[\\s\\S]*?requirePermission\\('units\\.labels\\.print'\\)[\\s\\S]*?${handler}`))?.[0];
    assert.ok(block, route);
  }
  assert.match(routes, /router\.use\('\/tech\/print-queue', requireAuth, requireAnyPermission\(\['labels\.print', 'units\.labels\.print'\]\)\)/);
  const controller = read('controllers/techController.js');
  assert.match(controller, /currentPermissions instanceof Set && req\.currentPermissions\.has\('units\.labels\.print'\)/);
  assert.match(controller, /Print Label is available only after the current Unit work cycle has been completed/);
  assert.match(controller, /Tech Users may print labels only for Units currently assigned to them/);
  assert.match(read('views/pages/tech-units.ejs'), /hasPermission\('labels\.print'\) \|\| hasPermission\('units\.labels\.print'\)/);
  assert.match(read('views/fragments/tech-units-table.ejs'), /hasPermission\('units\.labels\.print'\)/);
});
