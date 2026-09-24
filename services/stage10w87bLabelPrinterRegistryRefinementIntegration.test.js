'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Admin can delete printer groups without deleting printers', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelPrinterController.js');
  const model = read('models/labelPrinterModel.js');
  const live = read('views/fragments/management-printers-live.ejs');
  const modal = read('views/fragments/label-printer-group-delete-modal.ejs');
  assert.match(routes, /\/management\/printer-groups\/:groupId\/delete\/modal/);
  assert.match(routes, /\/management\/printer-groups\/:groupId\/delete/);
  assert.match(controller, /renderDeleteGroupModal/);
  assert.match(controller, /labelPrinterModel\.deleteGroup/);
  assert.match(model, /eventType: 'printer_group_deleted'/);
  assert.match(live, />Delete Group</);
  assert.match(modal, /does not remove the printers themselves/);
});

test('Admin can force Share on or off for any solo printer', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelPrinterController.js');
  const model = read('models/labelPrinterModel.js');
  const live = read('views/fragments/management-printers-live.ejs');
  assert.match(routes, /\/management\/printers\/:printerId\/sharing/);
  assert.match(controller, /updateManagedPrinterSharing/);
  assert.match(model, /setSoloPrinterSharing/);
  assert.match(model, /printer_sharing_updated/);
  assert.match(model, /DELETE FROM label_printer_group_members WHERE printer_id = \?/);
  assert.match(live, /'Force Share'/);
  assert.match(live, /'Make Private'/);
});

test('ordinary Tech printer lists do not expose IP or connection details', () => {
  const controller = read('controllers/labelPrinterController.js');
  const techLive = read('views/fragments/tech-printers-live.ejs');
  const managementLive = read('views/fragments/management-printers-live.ejs');
  assert.match(controller, /showNetworkDetails: isTechLeadPlus\(req\.currentUser\.roles\)/);
  assert.match(techLive, /if \(showNetworkDetails\)/);
  assert.match(techLive, /printer\.host_address/);
  assert.match(managementLive, /printer\.host_address/);
  assert.doesNotMatch(read('views/pages/tech-printers.ejs'), /printer\.host_address/);
});

test('printer registration detects existing IP or CUPS queue before creating a duplicate', () => {
  const model = read('models/labelPrinterModel.js');
  const controller = read('controllers/labelPrinterController.js');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  assert.match(model, /findPrinterRegistrationConflict/);
  assert.match(model, /printer\.host_address = \?/);
  assert.match(model, /printer\.cups_queue_name = \?/);
  assert.match(controller, /This printer has already been added to BWTDallas/);
  assert.match(controller, /duplicatePrinter = await labelPrinterModel\.findPrinterRegistrationConflict/);
  assert.match(form, /This printer has already been added to BWTDallas/);
  assert.match(form, /duplicatePrinter && !isEdit/);
});

test('printer CRUD refreshes visible registry content through an explicit HTMX live-refresh event', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelPrinterController.js');
  const managementLive = read('views/fragments/management-printers-live.ejs');
  const techLive = read('views/fragments/tech-printers-live.ejs');
  assert.match(controller, /HX-Trigger-After-Swap/);
  assert.match(controller, /label-printer-registry-changed/);
  assert.match(routes, /\/management\/printers\/live/);
  assert.match(routes, /\/tech\/printers\/live/);
  assert.match(managementLive, /hx-get="\/management\/printers\/live"/);
  assert.match(managementLive, /hx-trigger="label-printer-registry-changed from:body"/);
  assert.match(techLive, /hx-get="\/tech\/printers\/live"/);
  assert.match(techLive, /hx-trigger="label-printer-registry-changed from:body"/);
});

test('ordinary Tech Users cannot add an offline solo printer', () => {
  const controller = read('controllers/labelPrinterController.js');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  assert.match(controller, /requireOnlineForCreate = scope === 'solo' && !management && !isTechLeadPlus/);
  assert.match(controller, /Tech Users can only add a solo printer while it is online/);
  assert.match(form, /offlineBlocked/);
  assert.match(form, /Tech Users cannot add this solo printer while it is offline/);
});

test('Admin can convert solo and managed printers without deleting the printer record', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelPrinterController.js');
  const model = read('models/labelPrinterModel.js');
  const live = read('views/fragments/management-printers-live.ejs');
  const modal = read('views/fragments/label-printer-scope-modal.ejs');
  assert.match(routes, /\/management\/printers\/:printerId\/scope\/modal/);
  assert.match(routes, /\/management\/printers\/:printerId\/scope/);
  assert.match(controller, /convertPrinterScope/);
  assert.match(model, /eventType: 'printer_scope_converted'/);
  assert.match(model, /SET scope_code = \?, owner_user_id = \?, is_shared = \?/);
  assert.match(live, /Convert to Managed/);
  assert.match(live, /Convert to Solo/);
  assert.match(modal, /Share after conversion/);
});

test('Admin sharing control is placed immediately after Remove for solo printers', () => {
  const live = read('views/fragments/management-printers-live.ejs');
  const removeIndex = live.indexOf('>Remove</a>');
  const sharingIndex = live.indexOf("'Make Private' : 'Force Share'");
  assert.ok(removeIndex >= 0);
  assert.ok(sharingIndex > removeIndex);
});

test('Admin editing a solo printer stays on managed-printer routes', () => {
  const form = read('views/fragments/label-printer-form-modal.ejs');
  const controller = read('controllers/labelPrinterController.js');
  assert.match(form, /managementContext \? '\/management\/printers' : '\/tech\/printers'/);
  assert.match(controller, /renderPrinterForm\(res, \{ printer, scope: printer\.scope_code, management \}\)/);
});

test('printer profiles use friendly allowlisted choices instead of raw internal codes', () => {
  const config = read('config/labelPrinting.js');
  const controller = read('controllers/labelPrinterController.js');
  const policy = read('services/labelPrinterPolicy.js');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  assert.match(config, /LABEL_PRINTER_PROFILES/);
  assert.match(config, /Brother QL-810W · 300 dpi/);
  assert.match(controller, /printerProfiles: LABEL_PRINTER_PROFILES/);
  assert.match(form, /<select name="printerProfileCode">/);
  assert.match(form, /Loaded Roll Width/);
  assert.match(form, /continuousMediaWidths/);
  assert.doesNotMatch(form, /placeholder="brother_ql810w_300dpi"/);
  assert.match(policy, /findLabelPrinterProfile/);
  assert.match(policy, /inferLabelPrinterProfile/);
  assert.match(policy, /mediaCode: explicitMediaCode \|\| inferredProfile\?\.mediaCode/);
  assert.match(policy, /dpi: inferredProfile\?\.dpi/);
});

test('new printer forms default to the supported print profile without changing existing unconfigured printers', () => {
  const controller = read('controllers/labelPrinterController.js');
  const form = read('views/fragments/label-printer-form-modal.ejs');
  assert.match(controller, /const defaultProfile = printer \? null : \(LABEL_PRINTER_PROFILES\[0\] \|\| null\)/);
  assert.match(controller, /printerProfileCode: printer \? \(printer\.printer_profile_code \|\| ''\) : \(defaultProfile\?\.code \|\| ''\)/);
  assert.match(controller, /mediaCode: printer \? \(printer\.media_code \|\| ''\) : \(defaultProfile\?\.mediaCode \|\| ''\)/);
  assert.match(controller, /dpi: printer \? \(printer\.dpi \|\| ''\) : \(defaultProfile\?\.dpi \|\| ''\)/);
  assert.match(form, /Printers without a supported profile remain registered but do not appear in print destinations/);
});
