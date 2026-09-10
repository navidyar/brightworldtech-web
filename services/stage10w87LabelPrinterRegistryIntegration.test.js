'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizePrinterInput,
  normalizeHostAddress,
  canUsePrinter,
  canEditSoloPrinter,
  canJoinPrinterGroup
} = require('./labelPrinterPolicy');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('solo printers are private by default while Tech Lead+ retains access', () => {
  const input = normalizePrinterInput({
    displayName: 'Bench Printer',
    hostAddress: '10.0.2.211',
    protocolCode: 'raw_9100',
    port: '9100'
  }, { scope: 'solo' });
  assert.equal(input.isShared, false);

  const printer = { scope_code: 'solo', owner_user_id: 10, is_shared: 0, is_enabled: 1 };
  assert.equal(canUsePrinter(printer, 10, ['tech']), true);
  assert.equal(canUsePrinter(printer, 20, ['tech']), false);
  assert.equal(canUsePrinter(printer, 20, ['tech_lead']), true);
  assert.equal(canUsePrinter(printer, 20, ['management']), true);
  assert.equal(canUsePrinter(printer, 20, ['admin']), true);
  assert.equal(canEditSoloPrinter(printer, 20, ['tech_lead']), false);
  assert.equal(canEditSoloPrinter(printer, 20, ['management']), true);
});

test('printer probing is restricted to private/local IPv4 addresses', () => {
  assert.equal(normalizeHostAddress('10.0.2.210'), '10.0.2.210');
  assert.throws(() => normalizeHostAddress('8.8.8.8'), /private\/local IPv4/);
  assert.throws(() => normalizeHostAddress('example.com'), /private\/local IPv4/);
});

test('only managed or shared solo printers are eligible for shared groups', () => {
  assert.equal(canJoinPrinterGroup({ scope_code: 'managed', is_shared: 1, is_enabled: 1 }), true);
  assert.equal(canJoinPrinterGroup({ scope_code: 'solo', is_shared: 1, is_enabled: 1 }), true);
  assert.equal(canJoinPrinterGroup({ scope_code: 'solo', is_shared: 0, is_enabled: 1 }), false);
  assert.equal(canJoinPrinterGroup({ scope_code: 'managed', is_shared: 1, is_enabled: 0 }), false);
});

test('printer registry listing avoids MySQL reserved-word aliases', () => {
  const model = read('models/labelPrinterModel.js');
  assert.match(model, /group_counts\.group_count/);
  assert.doesNotMatch(model, /\) groups ON groups\./);
});

test('printer registry migration is additive and seeds the existing CUPS printer metadata', () => {
  const migration = read('scripts/migrateLabelPrinterRegistry.js');
  const config = read('config/labelPrinting.js');
  assert.match(migration, /CREATE TABLE label_printers/);
  assert.match(migration, /CREATE TABLE label_printer_groups/);
  assert.match(migration, /CREATE TABLE label_printer_group_members/);
  assert.match(migration, /register_current_cups_printer/);
  assert.match(config, /queue: 'BWT_NavidPrinter'/);
  assert.match(config, /host: '10\.0\.2\.210'/);
  assert.match(config, /protocolCode: 'raw_9100'/);
});

test('Management+ receives registry/group controls and Tech users receive owner-scoped solo controls', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelPrinterController.js');
  assert.match(routes, /\/management\/printers/);
  assert.match(routes, /\/management\/printer-groups/);
  assert.match(routes, /requireRole\(managementRoles\)/);
  assert.match(routes, /\/tech\/printers/);
  assert.match(routes, /requireRole\(techRoles\)/);
  assert.match(controller, /listOwnedSoloPrinters\(req\.currentUser\.user_id\)/);
  assert.match(controller, /canEditSoloPrinter/);
});

test('printer registration supports probe-and-review without switching production Print Label to the registry', () => {
  const policy = read('services/labelPrinterPolicy.js');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  const printingService = read('services/labelPrintingService.js');
  const labelConfig = read('config/labelPrinting.js');
  assert.match(policy, /probeTcpPort/);
  assert.match(policy, /raw_9100/);
  assert.match(policy, /defaultPort: 515/);
  assert.match(policy, /defaultPort: 631/);
  assert.match(form, />Detect</);
  assert.match(printingService, /\/usr\/bin\/lp/);
  assert.match(labelConfig, /findLabelPrinter/);
});

test('sidebar exposes Printers for Management and My Printers for Tech without exposing QC-only access', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /href="\/management\/printers"/);
  assert.match(sidebar, />Printers</);
  assert.match(sidebar, /href="\/tech\/printers"/);
  assert.match(sidebar, />My Printers</);
  assert.match(sidebar, /canAccessMenuArea\('tech'\) && !isQcOnlyNavigationUser/);
});
