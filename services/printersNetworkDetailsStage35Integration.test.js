'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canViewOtherPrinterNetworkDetails } = require('./managedPrinterPermissions');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('network detail visibility follows effective permission, including a user DENY', () => {
  assert.equal(canViewOtherPrinterNetworkDetails(new Set(['printers.network_details.view'])), true);
  assert.equal(canViewOtherPrinterNetworkDetails(new Set(['printers.solo.manage_any'])), false);
  assert.equal(canViewOtherPrinterNetworkDetails(new Set()), false);
  const controller = read('controllers/labelPrinterController.js');
  assert.match(controller, /showNetworkDetails: canViewOtherPrinterNetworkDetails\(req\.currentPermissions\)/);
  assert.doesNotMatch(controller, /showNetworkDetails: isTechLeadPlus/);
});

test('compatibility grants preserve prior Tech Lead and Management detail visibility', () => {
  for (const code of ['tech_lead', 'management', 'admin', 'super_admin']) {
    assert.ok(LEGACY_ROLE_GRANTS[code].includes('printers.network_details.view'), code);
  }
  for (const code of ['tech', 'qc']) {
    assert.equal(LEGACY_ROLE_GRANTS[code].includes('printers.network_details.view'), false, code);
  }
  const script = read('scripts/migratePrinterNetworkDetailsCompatibility.js');
  assert.match(script, /PERMISSION_KEY = 'printers\.network_details\.view'/);
  assert.match(script, /LEGACY_ROLE_CODES = Object\.freeze\(\['tech_lead', 'management'\]\)/);
  assert.match(script, /INSERT IGNORE INTO role_permissions/);
  assert.match(script, /await connection\.rollback\(\)/);
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['migrate:printer-network-details-compatibility'], 'node scripts/migratePrinterNetworkDetailsCompatibility.js --apply');
});

test('Tech printer list masks network details without the grant while retaining owned edit', () => {
  const ejs = require('ejs');
  const file = path.join(__dirname, '..', 'views/fragments/tech-printers-live.ejs');
  const printer = { label_printer_id: 3, display_name: 'Solo Three', location_label: '', printer_profile_code: '', host_address: '10.0.0.3', port: 9100, protocol_code: 'raw_9100', scope_code: 'solo', is_shared: 0, is_enabled: 1, last_probe_status: '' };
  function render(showNetworkDetails) {
    return ejs.render(fs.readFileSync(file, 'utf8'), {
      ownedPrinters: [printer], availablePrinters: [printer], showNetworkDetails,
      successMessage: null, errorMessages: [], oob: false
    }, { filename: file });
  }
  const hidden = render(false);
  assert.doesNotMatch(hidden, /10\.0\.0\.3/);
  assert.match(hidden, /\/tech\/printers\/3\/edit\/modal/);
  assert.match(render(true), /10\.0\.0\.3/);
});
