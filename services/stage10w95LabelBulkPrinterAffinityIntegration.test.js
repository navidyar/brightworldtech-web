'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('bulk group printing resolves one physical printer before the print job starts', () => {
  const controller = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(controller, /prepareBulkPrintDestination\(printer, selections\.map/);
  assert.match(controller, /bulkDestinationSupportsTemplates\(destination, selectedTemplateOptions\)/);
  assert.match(controller, /printer: batchPrinter/);
  assert.match(controller, /submissionLockHeld: true/);
  assert.match(printing, /templates\.every\(\(descriptor\) => isPrinterTemplateCompatible\(descriptor, printer\)\)/);
  assert.match(printing, /rankAvailablePrinters\(compatible\)/);
  assert.match(printing, /ensureCupsQueue\(ranked\[0\]\)/);
});

test('bulk submission holds one printer lock around all selected Units', () => {
  const controller = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const runtime = read('services/labelPrinterRuntimeService.js');
  const lock = read('services/labelPrinterSubmissionLock.js');
  assert.match(controller, /withPrinterSubmissionLock\(batchPrinter, async \(\) => \{/);
  assert.match(lock, /const printerSubmissionLocks = new Map\(\)/);
  assert.match(lock, /async function withPrinterSubmissionLock/);
  assert.match(runtime, /require\('\.\/labelPrinterSubmissionLock'\)/);
  assert.match(printing, /return submissionLockHeld/);
  assert.match(printing, /labelPrinterRuntimeService\.withPrinterSubmissionLock\(resolvedPrinter, submitCopies\)/);
});

test('bulk UI explains one-pickup-location group behavior and result names the routed printer', () => {
  const controller = read('controllers/techController.js');
  const modal = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  assert.match(modal, /keeps the entire batch together at that pickup location/);
  assert.doesNotMatch(modal, /automatically balances labels across available compatible members/);
  assert.match(controller, /via \$\{printer\.label\} to \$\{batchPrinter\.label\}/);
});

test('single-Unit group failover behavior remains available outside the pinned bulk path', () => {
  const controller = read('controllers/techController.js');
  assert.match(controller, /destination\?\.kind === 'group' && !partial/);
  assert.match(controller, /if \(mayFailOver\) continue/);
});


test('bulk submission probes the selected physical printer once up front instead of before every label', () => {
  const controller = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const bulkIndex = controller.indexOf('async function printTechUnitsBulkLabels');
  const singleIndex = controller.indexOf('async function renderCompleteTechUnitWorkModal', bulkIndex);
  const bulkController = controller.slice(bulkIndex, singleIndex > bulkIndex ? singleIndex : undefined);

  assert.match(printing, /return labelPrinterRuntimeService\.ensureCupsQueue\(ranked\[0\]\)/);
  assert.match(printing, /skipOnlineProbe = false/);
  assert.match(printing, /if \(!skipOnlineProbe\) await labelPrinterRuntimeService\.assertPrinterOnline\(resolvedPrinter\)/);
  assert.match(controller, /printerPreflightComplete = false/);
  assert.match(controller, /skipOnlineProbe: printerPreflightComplete/);
  assert.match(bulkController, /printerPreflightComplete: true/);
});
