'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routes = fs.readFileSync(path.join(__dirname, '..', 'routes/management.js'), 'utf8');

function block(method, route) {
  const tail = routes.split(`router.${method}(\n  '${route}',`)[1];
  assert.ok(tail, `Missing ${method.toUpperCase()} ${route}`);
  return tail.split('\n);')[0];
}

test('all My Printers routes accept effective solo-manage permission without a compatibility role', () => {
  const prefix = "router.use('/tech/printers', requireAuth, requirePermission('printers.solo.manage'));";
  assert.ok(routes.includes(prefix));
  assert.ok(routes.indexOf(prefix) < routes.indexOf("  '/tech/printers',"));
  for (const [method, route] of [
    ['get', '/tech/printers'],
    ['get', '/tech/printers/live'],
    ['get', '/tech/printers/new/modal'],
    ['post', '/tech/printers/probe'],
    ['post', '/tech/printers'],
    ['get', '/tech/printers/:printerId/edit/modal'],
    ['post', '/tech/printers/:printerId/edit/modal'],
    ['get', '/tech/printers/:printerId/delete/modal'],
    ['post', '/tech/printers/:printerId/delete']
  ]) {
    const routeSource = block(method, route);
    assert.ok(routeSource.includes('requireAuth'));
    assert.doesNotMatch(routeSource, /requireRole\(techRoles\)/);
  }
});
