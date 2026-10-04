'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function block(source, method, route) {
  const tail = source.split(`router.${method}(\n  '${route}',`)[1];
  assert.ok(tail, `Missing ${method.toUpperCase()} ${route}`);
  return tail.split('\n);')[0];
}

test('all group routes require registry view and group manage; no legacy feature gate remains', () => {
  const routes = read('routes/management.js');
  const definitions = [
    ['get', '/management/printer-groups/new/modal'],
    ['post', '/management/printer-groups'],
    ['get', '/management/printer-groups/:groupId/members/modal'],
    ['post', '/management/printer-groups/:groupId/members'],
    ['get', '/management/printer-groups/:groupId/delete/modal'],
    ['post', '/management/printer-groups/:groupId/delete']
  ];
  for (const [method, route] of definitions) {
    const guards = block(routes, method, route);
    assert.ok(guards.includes("requirePermission('printers.managed.view')"));
    assert.ok(guards.includes("requirePermission('printers.groups.manage')"));
    assert.ok(!guards.includes('requireFeature('));
  }
  assert.doesNotMatch(routes, /requireFeature\('managedPrinters'\)/);
  assert.doesNotMatch(read('config/accessPolicy.js'), /managedPrinters:/);
});

test('group controls render only for effective group managers', () => {
  const ejs = require('ejs');
  const file = path.join(root, 'views/fragments/management-printers-live.ejs');
  const locals = {
    printers: [], groups: [{ label_printer_group_id: 7, name: 'Group Seven', description: '', member_count: 0, is_active: 1 }],
    successMessage: null, errorMessages: [], oob: false, formatNumber: String
  };
  const render = (permissions) => ejs.render(fs.readFileSync(file, 'utf8'), {
    ...locals, hasPermission: (key) => permissions.includes(key)
  }, { filename: file });
  const viewer = render(['printers.managed.view']);
  assert.match(viewer, /Group Seven/);
  assert.doesNotMatch(viewer, /Manage Members|Delete Group/);
  const manager = render(['printers.managed.view', 'printers.groups.manage']);
  assert.match(manager, /Manage Members/);
  assert.match(manager, /Delete Group/);
});
