'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Label Library exposes Print only for ready Active Standalone templates', () => {
  const view = read('views/pages/management-label-library.ejs');
  assert.match(view, /template\.print_scope[\s\S]*?=== 'standalone'[\s\S]*?template\.status === 'active'[\s\S]*?template\.layout_ready[\s\S]*?\/print\/modal/);
});

test('Standalone direct print routes are management-only and precede generic template actions', () => {
  const routes = read('routes/management.js');
  const printModal = routes.indexOf("'/management/label-library/templates/:labelTemplateId/print/modal'");
  const printPost = routes.indexOf("'/management/label-library/templates/:labelTemplateId/print'");
  const genericAction = routes.indexOf("'/management/label-library/templates/:labelTemplateId/:action/modal'");
  assert.ok(printModal >= 0 && printPost >= 0 && genericAction >= 0);
  assert.ok(printModal < genericAction && printPost < genericAction);
  assert.match(routes.slice(printModal, genericAction), /requireRole\(managementRoles\)/);
  assert.match(routes.slice(printModal, genericAction), /renderStandaloneDirectPrintModal/);
  assert.match(routes.slice(printModal, genericAction), /printStandaloneTemplate/);
});

test('Standalone layout decides whether real Unit context is required from actual field usage', () => {
  const service = read('services/labelLibraryPrintingService.js');
  assert.match(service, /function layoutRequiresUnitContext\(layout = \{\}\)/);
  assert.match(service, /element\.type === 'dynamic_text'/);
  assert.match(service, /element\.type === 'composed_text'[\s\S]*?part\?\.type === 'field'/);
  assert.match(service, /element\.type === 'barcode' \|\| element\.type === 'qr'[\s\S]*?payloadUsesFieldValue/);
  assert.match(service, /payload\.type === 'field'/);
  assert.match(service, /payload\.type !== 'composed'/);
});

test('Direct Print reuses structured renderer, printer routing, CUPS submission, and print history', () => {
  const controller = read('controllers/labelLibraryController.js');
  assert.match(controller, /buildDescriptorPreview/);
  assert.match(controller, /listPrintDestinationsForUser/);
  assert.match(controller, /destinationSupportsTemplates/);
  assert.match(controller, /preflightPrintDestination/);
  assert.match(controller, /getRankedDestinationPrinters/);
  assert.match(controller, /printDescriptor/);
  assert.match(controller, /beginPrintJob\(\{[\s\S]*?source: 'library_direct'/);
  assert.match(controller, /createPrintJobItem/);
  assert.match(controller, /beginPrintAttempt/);
  assert.match(controller, /completePrintAttempt/);
  assert.match(controller, /completePrintItem/);
  assert.match(controller, /recordQueuedCopies/);
});

test('Direct Print modal supports Unit search, real preview, destination, quantity, and Recent Prints', () => {
  const modal = read('views/fragments/label-library-direct-print-modal.ejs');
  assert.match(modal, /Print Standalone Label/);
  assert.match(modal, /name="q"/);
  assert.match(modal, /Asset Tag, Unit ID, serial, or UUID/);
  assert.match(modal, /name="unitId"/);
  assert.match(modal, /previewDataUri/);
  assert.match(modal, /name="printerId"/);
  assert.match(modal, /name="copies"/);
  assert.match(modal, /\/tech\/print-queue\/modal/);
  assert.match(modal, /Representative Builder data is never used for a production direct print/);
});

test('Standalone direct print never resolves a template through Lot assignment', () => {
  const controller = read('controllers/labelLibraryController.js');
  const start = controller.indexOf('async function printStandaloneTemplate');
  const end = controller.indexOf('async function renderLabelLibraryPage', start);
  const body = controller.slice(start, end);
  assert.match(body, /resolveStandaloneTemplateContext/);
  assert.doesNotMatch(body, /getUnitPrintTemplateSet|getEffectiveLotTemplateSet/);
});
