'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../models/labelPrinterModel');
const runtime = require('./labelPrinterRuntimeService');
const { canUsePrinter } = require('./labelPrinterPolicy');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const privateSolo = { label_printer_id: 8, scope_code: 'solo', owner_user_id: 10, is_shared: 0, is_enabled: 1, protocol_code: 'raw_9100', host_address: '10.0.0.8', port: 9100, display_name: 'Private Solo' };

test('effective manage-any permission controls private solo visibility and selected printer resolution', async () => {
  const originalList = model.listAvailablePrintersForUser;
  const originalGet = model.getPrinterById;
  const seen = [];
  model.listAvailablePrintersForUser = async (options) => {
    seen.push(options);
    return [privateSolo];
  };
  model.getPrinterById = async () => privateSolo;
  try {
    const denied = new Set(['printers.solo.manage']);
    const allowed = new Set(['printers.solo.manage_any']);
    assert.equal(canUsePrinter(privateSolo, 20, denied), false);
    assert.equal(canUsePrinter(privateSolo, 20, allowed), true);
    assert.equal((await runtime.listPrintPrintersForUser({ userId: 20, permissions: denied })).length, 0);
    assert.equal((await runtime.listPrintPrintersForUser({ userId: 20, permissions: allowed })).length, 1);
    assert.equal(await runtime.resolvePrintPrinterForUser({ printerId: 'registry-8', userId: 20, permissions: denied }), null);
    assert.ok(await runtime.resolvePrintPrinterForUser({ printerId: 'registry-8', userId: 20, permissions: allowed }));
    assert.equal(seen[0].canAccessPrivateSoloPrinters, false);
    assert.equal(seen[1].canAccessPrivateSoloPrinters, true);
  } finally {
    model.listAvailablePrintersForUser = originalList;
    model.getPrinterById = originalGet;
  }
});

test('all print entrypoints forward effective permissions to destination list and lookup', () => {
  const library = read('controllers/labelLibraryController.js');
  const tech = read('controllers/techController.js');
  const controller = read('controllers/labelPrinterController.js');
  const runtimeSource = read('services/labelPrinterRuntimeService.js');
  assert.equal((library.match(/permissions: req\.currentPermissions/g) || []).length, 10);
  assert.ok((tech.match(/permissions: req\.currentPermissions/g) || []).length >= 10);
  assert.match(controller, /canAccessPrivateSoloPrinters: canManageAnySoloPrinter\(req\.currentPermissions\)/);
  assert.doesNotMatch(runtimeSource, /roleCodes/);
  assert.doesNotMatch(read('models/labelPrinterModel.js'), /isLeadPlus|roleCodes\.some/);
});
