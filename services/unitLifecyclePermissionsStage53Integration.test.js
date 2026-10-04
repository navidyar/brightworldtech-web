'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route, handler) {
  return source.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?${handler}[\\s\\S]*?\\);`))?.[0] || '';
}

test('Unit lifecycle routes and action controls use effective granular permissions', () => {
  const routes = read('routes/management.js');
  for (const [method, route, handler, permission] of [
    ['get', '/tech/units/:unitId/complete-work/modal', 'renderCompleteTechUnitWorkModal', 'units.complete'],
    ['post', '/tech/units/:unitId/complete-work', 'completeTechUnitWork', 'units.complete'],
    ['get', '/tech/units/:unitId/completions/:completionId/reverse/modal', 'renderReverseTechUnitCompletionModal', 'units.reverse_completion'],
    ['post', '/tech/units/:unitId/completions/:completionId/reverse', 'reverseTechUnitCompletion', 'units.reverse_completion'],
    ['get', '/tech/units/:unitId/permanent-delete/modal', 'renderPermanentDeleteTechUnitModal', 'units.delete'],
    ['post', '/tech/units/:unitId/permanent-delete', 'permanentlyDeleteTechUnit', 'units.delete'],
    ['get', '/tech/units/:unitId/park/modal', 'renderParkTechUnitModal', 'units.park'],
    ['post', '/tech/units/:unitId/park', 'parkTechUnit', 'units.park'],
    ['get', '/tech/units/:unitId/return-to-active/modal', 'renderReturnTechUnitToActiveModal', 'units.return_to_active'],
    ['post', '/tech/units/:unitId/return-to-active', 'returnTechUnitToActive', 'units.return_to_active']
  ]) {
    const block = routeBlock(routes, method, route, handler);
    assert.ok(block.includes(`requirePermission('${permission}')`), `${method.toUpperCase()} ${route} requires ${permission}`);
    assert.doesNotMatch(block, /requireRole\(/, `${method.toUpperCase()} ${route} must not rely on transitional roles`);
  }
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /const canDeleteTechUnits = !isQcPortalMode && hasPermission\('units\.delete'\)/);
  assert.match(table, /const canParkTechUnits = !isQcPortalMode && hasPermission\('units\.park'\)/);
  assert.match(table, /const canReturnTechUnitsToActive = !isQcPortalMode && hasPermission\('units\.return_to_active'\)/);
  assert.match(table, /const canCompleteTechUnits = !isQcPortalMode && hasPermission\('units\.complete'\)/);
  assert.match(table, /const canReverseTechUnitCompletion = !isQcPortalMode && hasPermission\('units\.reverse_completion'\)/);
});
