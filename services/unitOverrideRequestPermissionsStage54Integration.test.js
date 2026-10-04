'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route, handler) {
  return source.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?${handler}[\\s\\S]*?\\);`))?.[0] || '';
}

test('Unit override requests use granular permission while preserving requester ownership safeguards', () => {
  const routes = read('routes/management.js');
  for (const [method, route, handler] of [
    ['get', '/tech/units/:unitId/override/modal', 'renderTechOverrideRequestModal'],
    ['post', '/tech/units/:unitId/override', 'createTechOverrideRequest']
  ]) {
    const block = routeBlock(routes, method, route, handler);
    assert.ok(block.includes("requirePermission('units.override.request')"), route);
    assert.doesNotMatch(block, /requireRole\(/, route);
  }
  const controller = read('controllers/overrideController.js');
  assert.doesNotMatch(controller, /isRegularTechOverrideRequester|ELEVATED_UNIT_MANAGEMENT_ROLES/);
  assert.match(controller, /if \(!fromDuplicateIntake && isAssignedToCurrentUser\)/);
  assert.match(controller, /isAssignedToCurrentUser\s*&&[\s\S]*?requestedDestinationLotId/);
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /hasPermission\('units\.override\.request'\)/);
  assert.doesNotMatch(table, /isRegularTechOverrideRequester|isRegularTechUser/);
});
