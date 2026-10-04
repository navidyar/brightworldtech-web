'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canManageRegistryPrinter, canConvertPrinterScope } = require('./managedPrinterPermissions');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route) {
  const start = `router.${method}(\n  '${route}',`;
  const tail = source.split(start)[1];
  assert.ok(tail, `Missing ${method.toUpperCase()} ${route}`);
  return tail.split('\n);')[0];
}

test('registry mutations respect printer scope and effective permission DENY', () => {
  const managed = { scope_code: 'managed' };
  const solo = { scope_code: 'solo' };
  const managedOnly = new Set(['printers.managed.manage']);
  const soloAnyOnly = new Set(['printers.solo.manage_any']);
  const both = new Set([...managedOnly, ...soloAnyOnly]);
  assert.equal(canManageRegistryPrinter(managedOnly, managed), true);
  assert.equal(canManageRegistryPrinter(managedOnly, solo), false);
  assert.equal(canManageRegistryPrinter(soloAnyOnly, solo), true);
  assert.equal(canManageRegistryPrinter(soloAnyOnly, managed), false);
  assert.equal(canManageRegistryPrinter(new Set(), managed), false);
  assert.equal(canManageRegistryPrinter(both, { scope_code: 'unknown' }), false);
  assert.equal(canConvertPrinterScope(managedOnly), false);
  assert.equal(canConvertPrinterScope(soloAnyOnly), false);
  assert.equal(canConvertPrinterScope(both), true);
  both.delete('printers.solo.manage_any');
  assert.equal(canConvertPrinterScope(both), false);
});

test('managed registry routes separate creation, solo sharing, conversion, edit, and deletion authority', () => {
  const routes = read('routes/management.js');
  const definitions = [
    ['get', '/management/printers/new/modal', "requirePermission('printers.managed.manage')"],
    ['post', '/management/printers/probe', "requirePermission('printers.managed.manage')"],
    ['post', '/management/printers', "requirePermission('printers.managed.manage')"],
    ['post', '/management/printers/:printerId/sharing', "requirePermission('printers.solo.manage_any')"],
    ['get', '/management/printers/:printerId/scope/modal', "requirePermission('printers.managed.manage')"],
    ['post', '/management/printers/:printerId/scope', "requirePermission('printers.managed.manage')"],
    ['get', '/management/printers/:printerId/edit/modal', "requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any'])"],
    ['post', '/management/printers/:printerId/edit/modal', "requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any'])"],
    ['get', '/management/printers/:printerId/delete/modal', "requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any'])"],
    ['post', '/management/printers/:printerId/delete', "requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any'])"]
  ];
  for (const [method, route, guard] of definitions) {
    const block = routeBlock(routes, method, route);
    assert.ok(block.includes("requirePermission('printers.managed.view')"), route);
    assert.ok(block.includes(guard), route);
    assert.ok(!block.includes("requireFeature('managedPrinters')"), route);
  }
  for (const method of ['get', 'post']) {
    const scope = routeBlock(routes, method, `/management/printers/:printerId/scope${method === 'get' ? '/modal' : ''}`);
    assert.ok(scope.includes("requirePermission('printers.solo.manage_any')"));
    const edit = routeBlock(routes, method, '/management/printers/:printerId/edit/modal');
    assert.ok(edit.includes("requirePermission('printers.network_details.view')"));
  }
  const controller = read('controllers/labelPrinterController.js');
  assert.match(controller, /if \(management\) return \{ printer, allowed: canManageRegistryPrinter\(req\.currentPermissions, printer\) \};/);
});

test('rendered registry hides actions outside the current scope and network grant', () => {
  const ejs = require('ejs');
  const file = path.join(__dirname, '..', 'views/fragments/management-printers-live.ejs');
  const base = { location_label: '', manufacturer: '', model: '', printer_profile_code: '', port: 9100, protocol_code: 'raw_9100', cups_queue_name: 'PRIVATE_QUEUE', is_enabled: 1, last_probe_status: '', group_count: 0, is_shared: 1, ownerLabel: 'Owner' };
  const printers = [
    { ...base, label_printer_id: 1, display_name: 'Managed One', host_address: '10.0.0.1', scope_code: 'managed' },
    { ...base, label_printer_id: 2, display_name: 'Solo Two', host_address: '10.0.0.2', scope_code: 'solo' }
  ];
  function render(keys) {
    return ejs.render(fs.readFileSync(file, 'utf8'), {
      printers, groups: [], successMessage: null, errorMessages: [], oob: false,
      hasPermission: (key) => keys.includes(key), formatNumber: String
    }, { filename: file });
  }
  const managedOnly = render(['printers.managed.view', 'printers.managed.manage']);
  assert.match(managedOnly, /\/management\/printers\/1\/delete\/modal/);
  assert.doesNotMatch(managedOnly, /\/management\/printers\/2\/delete\/modal/);
  assert.doesNotMatch(managedOnly, /\/management\/printers\/1\/edit\/modal/);
  assert.doesNotMatch(managedOnly, /10\.0\.0\.[12]|PRIVATE_QUEUE/);
  const soloOnly = render(['printers.managed.view', 'printers.solo.manage_any']);
  assert.match(soloOnly, /\/management\/printers\/2\/delete\/modal/);
  assert.doesNotMatch(soloOnly, /\/management\/printers\/1\/delete\/modal/);
  assert.doesNotMatch(soloOnly, /\/scope\/modal/);
  const all = render(['printers.managed.view', 'printers.managed.manage', 'printers.solo.manage_any', 'printers.network_details.view']);
  assert.match(all, /\/management\/printers\/1\/edit\/modal/);
  assert.match(all, /\/management\/printers\/2\/edit\/modal/);
  assert.match(all, /\/scope\/modal/);
  assert.match(all, /10\.0\.0\.1/);
});

test('registry actions match managed, solo-any, conversion, and network permissions', () => {
  const live = read('views/fragments/management-printers-live.ejs');
  assert.match(live, /printer\.scope_code === 'managed'[\s\S]*?printers\.managed\.manage[\s\S]*?printers\.solo\.manage_any/);
  assert.match(live, /canConvertScope[\s\S]*?printers\.managed\.manage[\s\S]*?printers\.solo\.manage_any/);
  assert.match(live, /printers\.network_details\.view[\s\S]*?\>Edit</);
});
