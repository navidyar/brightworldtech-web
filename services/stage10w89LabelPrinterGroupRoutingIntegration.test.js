'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Print Label exposes active printer groups alongside direct printers', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  const model = read('models/labelPrinterModel.js');
  const controller = read('controllers/techController.js');
  assert.match(runtime, /GROUP_ID_PREFIX = 'group-'/);
  assert.match(runtime, /listPrintDestinationsForUser/);
  assert.match(runtime, /Group ·/);
  assert.match(model, /listRoutingGroupRows/);
  assert.match(model, /groupRow\.is_active = 1/);
  assert.match(controller, /resolvePrintDestinationForUser/);
});

test('group routing ranks only online printers by current CUPS load then lifetime balance', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  const policy = read('services/labelPrinterRoutingPolicy.js');
  assert.match(runtime, /rankAvailablePrinters/);
  assert.match(runtime, /PRINTER_PROBE_FAST_ROUTE_TIMEOUT_MS = 500/);
  assert.match(runtime, /PRINTER_PROBE_RETRY_TIMEOUT_MS = 3500/);
  assert.match(runtime, /fastReachability\.some\(Boolean\)/);
  assert.match(runtime, /useRetryPass/);
  assert.match(runtime, /getPrinterQueueLoads/);
  assert.match(runtime, /lpstat', \['-p'\]/);
  assert.match(runtime, /lpstat', \['-o'\]/);
  assert.match(policy, /queueDepth/);
  assert.match(policy, /lifetimePrintCount/);
  assert.match(policy, /groupSortOrder/);
});

test('group preflight requires an online compatible member without submitting a label', () => {
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(printing, /destinationSupportsTemplates/);
  assert.match(printing, /preflightPrintDestination/);
  assert.match(printing, /rankAvailablePrinters\(compatible\)/);
  assert.match(printing, /No print job was sent to CUPS/);
});

test('group print attempts fail over only before any copies were accepted', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /attemptNumber: candidateIndex \+ 1/);
  assert.match(controller, /destination\?\.kind === 'group' && !partial/);
  assert.match(controller, /candidateIndex < candidates\.length - 1/);
  assert.match(controller, /if \(mayFailOver\) continue/);
  assert.match(controller, /copiesSubmitted > 0/);
});

test('bulk and single print results report actual routed printer pickup locations', () => {
  const controller = read('controllers/techController.js');
  const bulkView = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  const singleView = read('views/fragments/tech-unit-print-label-modal.ejs');
  assert.match(controller, /actualPrinterLabels/);
  assert.match(controller, /via \$\{printer\.label\}/);
  assert.match(bulkView, /result\.printerLabels\.join/);
  assert.match(singleView, /Printer or Group/);
  assert.match(bulkView, /Printer or Group/);
});


test('offline failures keep Print Label retryable with another destination without reopening the modal', () => {
  const controller = read('controllers/techController.js');
  const singleView = read('views/fragments/tech-unit-print-label-modal.ejs');
  const bulkView = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  assert.match(controller, /retryableDestinationError = true/);
  assert.match(controller, /retryableError: retryableDestinationError/);
  assert.match(controller, /retryableError: failures\.length > 0 && totalQueued === 0/);
  assert.match(controller, /actionErrors\.length > 0 && !retryableError/);
  assert.match(singleView, /const canSubmit = !Boolean\(submitBlocked\)/);
  assert.match(bulkView, /const canSubmit = !Boolean\(submitBlocked\)/);
  assert.doesNotMatch(singleView, /const canSubmit = safeErrors\.length === 0/);
  assert.doesNotMatch(bulkView, /const canSubmit = safeErrors\.length === 0/);
});

test('Phase C6 audit remains read-only and closes the DB pool', () => {
  const audit = read('scripts/auditLabelLibraryPhaseC6.js');
  assert.match(audit, /read-only/);
  assert.match(audit, /await pool\.end\(\)/);
  assert.doesNotMatch(audit, /INSERT INTO|UPDATE label_|DELETE FROM|lpadmin|submitRasterToCups/);
});
