'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route, handler) {
  return source.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?${handler}[\\s\\S]*?\\);`))?.[0] || '';
}

test('Unit Browser read, edit, and export entry points use effective permissions', () => {
  const routes = read('routes/management.js');
  assert.ok(routeBlock(routes, 'get', '/tech/units', 'renderTechUnitsPage').includes("requirePermission('units.view')"));
  for (const [method, route, handler] of [
    ['get', '/tech/units/:unitId/edit/modal', 'renderEditTechUnitModal'],
    ['get', '/tech/units/:unitId/edit', 'renderEditTechUnitPage'],
    ['post', '/tech/units/:unitId/modal', 'updateTechUnitModal'],
    ['post', '/tech/units/:unitId', 'updateTechUnit']
  ]) {
    assert.ok(routeBlock(routes, method, route, handler).includes("requirePermission('units.edit')"), route);
  }
  for (const [route, handler] of [
    ['/tech/units/export/preview', 'renderTechUnitsExportPreview'],
    ['/tech/units/export/csv', 'downloadTechUnitsCsv'],
    ['/tech/units/export/xlsx', 'downloadTechUnitsXlsx']
  ]) assert.ok(routeBlock(routes, 'get', route, handler).includes("requirePermission('units.export')"), route);
  const controller = read('controllers/techController.js');
  assert.ok(controller.includes("req.currentPermissions.has('units.export')"));
  const table = read('views/fragments/tech-units-table.ejs');
  assert.ok(table.includes("const canEditTechUnits = !isQcPortalMode && hasPermission('units.edit');"));
});
