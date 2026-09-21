'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Units Browser exposes Lot-scoped bulk Print Labels only through the table refresh state', () => {
  const controller = read('controllers/techController.js');
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(controller, /buildBulkLabelPrintAction/);
  assert.match(controller, /canPrintLabels/);
  assert.match(controller, /canOfferBulkLabelPrint\(filters\)/);
  assert.match(controller, /unit\.latestWorkCompletion/);
  assert.match(page, /id="tech-units-bulk-label-actions"/);
  assert.match(table, /hx-swap-oob="true"/);
  assert.match(table, />Print Labels \(<%= safeBulkLabelAction\.eligibleCount %>\)</);
});

test('bulk routes are static, Tech-authorized, and placed before parameterized Unit routes', () => {
  const routes = read('routes/management.js');
  const modalIndex = routes.indexOf("'/tech/units/print-labels/modal'");
  const parameterIndex = routes.indexOf("'/tech/units/:unitId/print-label/modal'");
  assert.ok(modalIndex >= 0 && parameterIndex > modalIndex);
  assert.match(routes, /'\/tech\/units\/print-labels\/modal'[\s\S]*?requireRole\(techRoles\)[\s\S]*?renderTechUnitsBulkPrintLabelModal/);
  assert.match(routes, /'\/tech\/units\/print-labels'[\s\S]*?requireRole\(techRoles\)[\s\S]*?printTechUnitsBulkLabels/);
});

test('bulk modal supports deselect, reselect, Select All, Clear All, and shared template quantities', () => {
  const modal = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  const client = read('public/js/tech-units.js');
  assert.match(modal, /name="unitId"/);
  assert.match(modal, /data-bulk-label-unit-checkbox/);
  assert.match(modal, /data-bulk-label-select-all/);
  assert.match(modal, /data-bulk-label-clear-all/);
  assert.match(modal, /name="templateKey"/);
  assert.match(modal, /name="quantity\[<%= template\.key %>\]"/);
  assert.match(modal, /Copies per Unit/);
  assert.match(modal, /Deselect any Units you do not need/);
  assert.match(client, /setAllBulkLabelUnits/);
  assert.match(client, /updateBulkLabelSelectedCount/);
});



test('bulk printing reports missing printable templates instead of confusing Unit selection with label selection', () => {
  const controller = read('controllers/techController.js');
  const bulkIndex = controller.indexOf('async function printTechUnitsBulkLabels');
  const bulk = controller.slice(bulkIndex);
  assert.match(controller, /function buildNoPrintableLabelTemplateMessage/);
  assert.match(bulk, /const noPrintableTemplateMessage = buildNoPrintableLabelTemplateMessage\(templateSet, lotId\)/);
  assert.match(bulk, /if \(!noPrintableTemplateMessage\) \{[\s\S]*normalizeUnitLabelPrintSelection/);
});
test('bulk submission rebuilds the current filtered page and prevalidates every selected Unit before starting CUPS work', () => {
  const controller = read('controllers/techController.js');
  const contextIndex = controller.indexOf('async function getTechUnitsBulkPrintLabelContext');
  const bulkIndex = controller.indexOf('async function printTechUnitsBulkLabels');
  const beginIndex = controller.indexOf("source: 'bulk'", bulkIndex);
  const validateIndex = controller.indexOf('await getTechUnitPrintLabelContext(req, unitId)', bulkIndex);
  assert.match(controller.slice(contextIndex, bulkIndex), /await buildTechUnitsResult\(filters\)/);
  assert.match(controller.slice(bulkIndex), /normalizeSelectedUnitIds\(req\.body \|\| \{\}, context\.eligibleUnitIds\)/);
  assert.ok(validateIndex > bulkIndex && beginIndex > validateIndex, 'Unit preflight must happen before bulk print job creation.');
  assert.match(controller.slice(bulkIndex), /Number\(unitContext\.unit\.lotId\) !== Number\(lotId\)/);
});

test('bulk print jobs get their own batch print set while individual prints retain auto grouping', () => {
  const history = read('models/labelPrintHistoryModel.js');
  assert.match(history, /safeSource === 'bulk'/);
  assert.match(history, /VALUES \(\?, 'batch'\)/);
  assert.match(history, /grouping_kind = 'auto'/);
  assert.match(history, /DATE_SUB\(CURRENT_TIMESTAMP\(6\), INTERVAL \? MINUTE\)/);
});

test('bulk printing reuses the same per-Unit template renderer, history items, attempts, and CUPS submission path', () => {
  const controller = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const legacy = read('services/labelPrintingService.js');
  assert.match(controller, /queueLabelSelectionsForUnit/);
  assert.match(controller, /createPrintJobItem/);
  assert.match(controller, /beginPrintAttempt/);
  assert.match(printing, /labelPrintingService\.submitRasterToCups/);
  assert.match(legacy, /spawn\('\/usr\/bin\/lp'/);
  assert.match(legacy, /'-o', 'raw'/);
});
