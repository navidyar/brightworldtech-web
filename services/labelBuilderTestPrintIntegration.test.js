'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Builder Test Print routes are management-only and remain more specific than normal Builder and template action routes', () => {
  const routes = read('routes/management.js');
  const modal = routes.indexOf("'/management/label-library/templates/:labelTemplateId/builder/test-print/modal'");
  const post = routes.indexOf("'/management/label-library/templates/:labelTemplateId/builder/test-print'");
  const builder = routes.indexOf("'/management/label-library/templates/:labelTemplateId/builder'");
  const genericAction = routes.indexOf("'/management/label-library/templates/:labelTemplateId/:action/modal'");
  assert.ok(modal >= 0 && post >= 0 && builder >= 0 && genericAction >= 0);
  assert.ok(modal < builder && post < builder && builder < genericAction);
  assert.match(routes.slice(modal, builder), /requireRole\(managementRoles\)/);
  assert.match(routes.slice(modal, builder), /renderBuilderTestPrintModal/);
  assert.match(routes.slice(modal, builder), /printBuilderTestTemplate/);
});

test('Builder Test Print permits saved print-ready Draft and Active Builder templates regardless of print scope', () => {
  const service = read('services/labelLibraryPrintingService.js');
  assert.match(service, /async function getBuilderTestPrintDescriptor/);
  assert.match(service, /\['draft', 'active'\]\.includes\(status\)/);
  assert.doesNotMatch(service, /Builder Test Print is only available for Lot Selection templates/);
  assert.match(service, /Save the layout before using Builder Test Print/);
  assert.match(service, /mode: 'builder_test'/);
});

test('Builder enables Test Print for any saved ready Builder layout and still carries Live Unit Preview context when present', () => {
  const controller = read('controllers/labelLibraryController.js');
  const view = read('views/pages/management-label-builder.ejs');
  const js = read('public/js/label-builder.js');
  assert.match(controller, /builderTestPrintReady = Boolean\(configAsset\)[\s\S]*storedReadiness\.ready[\s\S]*\['draft', 'active'\]\.includes/);
  assert.doesNotMatch(view, /template\.print_scope[\s\S]*?=== 'lot'[\s\S]*?data-builder-test-print/);
  assert.match(view, /data-builder-saved-ready/);
  assert.match(view, /data-builder-test-print-unit/);
  assert.match(view, /hx-include="\[data-builder-test-print-unit\]"/);
  assert.match(js, /testPrintButton\.disabled = state\.dirty \|\| !state\.savedReady/);
  assert.match(js, /state\.previewUnit\?\.unitId/);
  assert.match(js, /testPrintUnitInput\.value = unitId > 0 \? String\(unitId\) : ''/);
  assert.match(js, /Representative Data or the selected Unit/);
});

test('Builder Test Print defaults to Representative Data and only resolves a real Unit when one is explicitly supplied', () => {
  const controller = read('controllers/labelLibraryController.js');
  const start = controller.indexOf('async function resolveBuilderTestPrintContext');
  const end = controller.indexOf('async function renderLabelLibraryPage', start);
  const body = controller.slice(start, end);
  assert.match(body, /useRepresentativeData: !rawUnitId/);
  assert.match(body, /buildRepresentativeFieldValues\(\)/);
  assert.match(body, /fieldValues: effectiveFieldValues/);
  assert.match(body, /getTechUnitLifecycleSummaryById/);
  assert.match(body, /Use Representative Data or choose another Unit/);
  assert.match(body, /preflightPrintDestination/);
  assert.doesNotMatch(body, /getUnitPrintTemplateSet|getEffectiveLotTemplateSet/);
});

test('shared descriptor rendering accepts explicit field values for representative preview and physical test printing', () => {
  const service = read('services/labelLibraryPrintingService.js');
  assert.match(service, /async function renderDescriptor\(\{ descriptor, unit = null, lot = null, fieldValues = null \}\)/);
  assert.match(service, /const effectiveFieldValues = overrideFieldValues \|\| buildFieldValues/);
  assert.match(service, /fieldValues: effectiveFieldValues/);
  assert.match(service, /async function buildDescriptorPreview\(\{ descriptor, unit, lot, fieldValues = null \}\)/);
  assert.match(service, /async function printDescriptor\(\{ descriptor, unit = null, lot = null, fieldValues = null/);
  assert.match(service, /renderDescriptor\(\{ descriptor, unit, lot, fieldValues \}\)/);
});

test('Builder Test Print is audited separately, queues one label, supports representative history, and does not increment production usage', () => {
  const controller = read('controllers/labelLibraryController.js');
  const model = read('models/labelPrintHistoryModel.js');
  assert.match(controller, /beginPrintJob\(\{[\s\S]*?source: 'builder_test'/);
  assert.match(controller, /representativeFieldValues = context\.useRepresentativeData \? buildRepresentativeFieldValues\(\) : null/);
  assert.match(controller, /queueTemplatePrint\(\{[\s\S]*?fieldValues: representativeFieldValues[\s\S]*?copies: 1,[\s\S]*?updateTemplateUsage: false/);
  assert.match(controller, /historyUnitLabel: context\.useRepresentativeData \? 'Representative Data' : ''/);
  assert.match(model, /updateTemplateUsage = true/);
  assert.match(model, /templateId && queued > 0 && updateTemplateUsage !== false/);
});

test('Builder Test Print modal is immediately printable with Representative Data and keeps real Unit selection optional', () => {
  const modal = read('views/fragments/label-builder-test-print-modal.ejs');
  assert.match(modal, /Builder Test Print/);
  assert.match(modal, /Representative Data is automatic/);
  assert.match(modal, /<strong>Representative Data<\/strong>/);
  assert.match(modal, /Use a real Unit instead/);
  assert.match(modal, /Use Representative Data/);
  assert.match(modal, /name="q"/);
  assert.match(modal, /name="unitId"/);
  assert.match(modal, /previewDataUri/);
  assert.match(modal, /name="printerId"/);
  assert.match(modal, /1 test label/);
  assert.match(modal, /Queue Test Print/);
  assert.match(modal, /does not count as production template usage/);
  assert.match(modal, /\/tech\/print-queue\/modal/);
});
