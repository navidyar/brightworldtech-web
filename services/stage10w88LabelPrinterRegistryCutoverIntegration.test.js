'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Print Label printer choices now come from the per-user registry instead of the hardcoded allowlist', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /labelPrinterRuntimeService\.listPrintDestinationsForUser/);
  assert.match(controller, /labelPrinterRuntimeService\.resolvePrintDestinationForUser/);
  assert.doesNotMatch(controller, /LABEL_PRINTERS\.find\(\(candidate\) => candidate\.id === printerId\)/);
});

test('registry cutover reuses the existing authorization policy for managed, shared, owner, and Tech Lead+ printers', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  const policy = read('services/labelPrinterPolicy.js');
  const model = read('models/labelPrinterModel.js');
  assert.match(runtime, /canUsePrinter\(row, userId, roleCodes\)/);
  assert.match(policy, /printer\.scope_code\) === 'managed'/);
  assert.match(policy, /printer\.is_shared\) === 1/);
  assert.match(policy, /printer\.owner_user_id\) === Number\(userId\)/);
  assert.match(policy, /return isTechLeadPlus\(roleCodes\)/);
  assert.match(model, /listAvailablePrintersForUser/);
});

test('selected registry printer is live-probed before CUPS submission and offline printers never call lp', () => {
  const controller = read('controllers/techController.js');
  const runtime = read('services/labelPrinterRuntimeService.js');
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(controller, /preflightPrintDestination\(printer/);
  assert.match(runtime, /probeTcpPort\(printer\.host, printer\.port/);
  assert.match(runtime, /No print job was sent to CUPS/);
  assert.match(printing, /assertPrinterOnline\(resolvedPrinter\)[\s\S]*submitRasterToCups/);
});

test('RAW registry printers can receive an app-managed CUPS queue with abort-job semantics', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /BWT_LabelPrinter_/);
  assert.match(runtime, /\/usr\/sbin\/lpadmin/);
  assert.match(runtime, /socket:\/\/\$\{printer\.host\}:\$\{printer\.port\}/);
  assert.match(runtime, /printer-error-policy=abort-job/);
  assert.match(runtime, /setPrinterCupsQueue/);
  assert.match(runtime, /String\(printer\.protocolCode\) === 'raw_9100'/);
});


test('CUPS administration gets a longer timeout than normal runtime commands', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /CUPS_COMMAND_TIMEOUT_MS = 5000/);
  assert.match(runtime, /CUPS_ADMIN_COMMAND_TIMEOUT_MS = 20000/);
  assert.match(runtime, /ensureAbortJobPolicy[\s\S]*CUPS_ADMIN_COMMAND_TIMEOUT_MS/);
  assert.match(runtime, /socket:\/\/\$\{printer\.host\}:\$\{printer\.port\}[\s\S]*CUPS_ADMIN_COMMAND_TIMEOUT_MS/);
});

test('existing named CUPS queues keep their queue identity while receiving fail-fast abort-job policy', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  const config = read('config/labelPrinting.js');
  assert.match(runtime, /queue && !isAutomaticQueueName/);
  assert.match(runtime, /ensureAbortJobPolicy\(queue\)/);
  assert.match(runtime, /printer-error-policy=abort-job/);
  assert.match(config, /queue: 'BWT_NavidPrinter'/);
});

test('print history snapshots the registry printer protocol and endpoint while preserving readable names', () => {
  const history = read('models/labelPrintHistoryModel.js');
  assert.match(history, /printer_key_snapshot/);
  assert.match(history, /printer_label_snapshot/);
  assert.match(history, /printer_location_snapshot/);
  assert.match(history, /printer\?\.protocolCode \? `cups_/);
  assert.match(history, /printer\?\.endpoint/);
});

test('successful and partial CUPS submissions increment registry lifetime print usage only for submitted copies', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/labelPrinterModel.js');
  assert.match(controller, /recordQueuedCopies\(candidate, result\.copies\)/);
  assert.match(controller, /recordQueuedCopies\(candidate, copiesSubmitted\)/);
  assert.match(model, /lifetime_print_count = lifetime_print_count \+ \?/);
  assert.match(model, /last_used_at = CURRENT_TIMESTAMP\(6\)/);
});

test('Print Label modal surfaces a clear message when the current user has no eligible registry printer', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /No label printers or printer groups are currently available to your account/);
});

test('temporary configured-printer fallback remains only for an empty or unavailable registry', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /Compatibility fallback is intentionally limited to an empty registry during cutover/);
  assert.match(runtime, /if \(allRows\.length > 0\) return Object\.freeze\(\[\]\)/);
  assert.match(runtime, /labelPrintingService\.LABEL_PRINTERS\.map\(mapLegacyPrinterToPrintOption\)/);
});

test('printer/template compatibility is checked before raster data is submitted', () => {
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(printing, /assertPrinterTemplateCompatibility/);
  assert.match(printing, /requiredProfile/);
  assert.match(printing, /printerProfile !== requiredProfile/);
  assert.match(printing, /requiredMedia/);
});


test('Phase C5 read-only audit closes the MySQL pool so the command exits cleanly', () => {
  const audit = read('scripts/auditLabelLibraryPhaseC5.js');
  assert.match(audit, /const \{ pool \} = require\('\.\.\/models\/db'\)/);
  assert.match(audit, /finally \{[\s\S]*await pool\.end\(\)/);
});

test('printer/profile mismatch messages use the friendly supported-profile label', () => {
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(printing, /findLabelPrinterProfile\(requiredProfile\)\?\.label/);
  assert.match(printing, /Edit the printer registry entry and select the matching Printer Profile/);
});


test('Print Label only offers printers compatible with the selected label profile', () => {
  const controller = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(printing, /function isPrinterTemplateCompatible/);
  assert.match(controller, /selectedTemplateOptions = templateOptions\.filter/);
  assert.match(controller, /availablePrinters\.filter/);
  assert.match(controller, /destinationSupportsTemplates\(destination, selectedTemplateOptions\)/);
  assert.match(controller, /No available printer or printer group supports the selected label profile/);
});
