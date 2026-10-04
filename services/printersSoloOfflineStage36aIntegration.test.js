'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canManageAnySoloPrinter } = require('./managedPrinterPermissions');

const controller = fs.readFileSync(path.join(__dirname, '..', 'controllers/labelPrinterController.js'), 'utf8');

test('offline solo registration follows effective manage-any permission, including user DENY', () => {
  assert.equal(canManageAnySoloPrinter(new Set(['printers.solo.manage_any'])), true);
  assert.equal(canManageAnySoloPrinter(new Set(['printers.solo.manage'])), false);
  assert.equal(canManageAnySoloPrinter(new Set()), false);
  assert.match(controller, /requireOnlineForCreate: !canManageAnySoloPrinter\(req\.currentPermissions\)/);
  assert.match(controller, /const requireOnlineForCreate = scope === 'solo' && !management && !canManageAnySoloPrinter\(req\.currentPermissions\)/);
  assert.doesNotMatch(controller, /isTechLeadPlus\(req\.currentUser\.roles\)/);
  assert.match(controller, /if \(requireOnlineForCreate && !probeResult\.reachable\)/);
});
