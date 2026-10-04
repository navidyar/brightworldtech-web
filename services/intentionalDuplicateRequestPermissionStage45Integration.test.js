'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('./intentionalDuplicateRequestPolicy');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('Intentional Duplicate submission uses effective requests.submit permission', () => {
  assert.equal(policy.canRequestIntentionalDuplicate({ currentPermissions: new Set(['requests.submit']) }), true);
  assert.equal(policy.canRequestIntentionalDuplicate({ currentPermissions: new Set() }), false);
  assert.equal(policy.canRequestIntentionalDuplicate({ currentUser: { roles: ['tech'] }, currentPermissions: new Set() }), false);
  assert.equal(policy.canRequestIntentionalDuplicate({ currentUser: { roles: ['admin'] }, currentPermissions: new Set(['requests.submit']) }), true);
});

test('Create Unit and Intentional Duplicate routes require their specific permissions', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /router\.use\('\/tech\/units', requireAuth, requirePermission\('units\.view'\)\)/);
  for (const [method, route] of [['get', '/tech/units/new/modal'], ['get', '/tech/units/new'], ['post', '/tech/units/modal'], ['post', '/tech/units']]) {
    const block = routes.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, /requirePermission\('units\.create'\)/);
    assert.doesNotMatch(block, /requireRole\(techRoles\)/);
  }
  for (const [method, route] of [['post', '/tech/units/:unitId/intentional-duplicate-request/modal'], ['post', '/tech/units/:unitId/intentional-duplicate-request']]) {
    const block = routes.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?\\);`))?.[0];
    assert.ok(block, route);
    assert.match(block, /requirePermission\('units\.create'\)/);
    assert.match(block, /requirePermission\('requests\.submit'\)/);
    assert.doesNotMatch(block, /requireRole\(techRoles\)/);
  }
  const controller = read('controllers/techController.js');
  assert.match(controller, /intentionalDuplicateRequestPolicy\.canRequestIntentionalDuplicate\(req\)/);
});
