'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Label Builder exposes preview-only Unit search controls', () => {
  const view = read('views/pages/management-label-builder.ejs');
  assert.match(view, /Live Unit Preview/);
  assert.match(view, /data-builder-unit-search/);
  assert.match(view, /data-builder-unit-search-button/);
  assert.match(view, /data-builder-unit-clear/);
  assert.match(view, /Representative values are shown until you select a Unit/);
  assert.ok(view.indexOf('data-builder-live-preview') < view.indexOf('data-builder-media-width'));
  assert.match(view, /<option value="camel">Camel Case<\/option>/);
});

test('management-only Live Unit Preview endpoints are read-only GET routes', () => {
  const routes = read('routes/management.js');
  assert.match(routes, /router\.get\(\s*'\/management\/label-library\/builder\/units'/);
  assert.match(routes, /router\.get\(\s*'\/management\/label-library\/builder\/units\/:unitId'/);
  assert.match(routes, /labelLibraryController\.searchBuilderPreviewUnits/);
  assert.match(routes, /labelLibraryController\.getBuilderUnitPreview/);
  assert.doesNotMatch(routes, /router\.post\(\s*'\/management\/label-library\/builder\/units/);
});

test('Live Unit Preview reuses production Label Library field-value mapping without print submission', () => {
  const controller = read('controllers/labelLibraryController.js');
  const start = controller.indexOf('async function getBuilderUnitPreview');
  const end = controller.indexOf('\n\nasync function renderTemplateBuilder', start);
  const body = controller.slice(start, end);

  assert.match(body, /getTechUnitLifecycleSummaryById\(unitId\)/);
  assert.match(body, /lotModel\.getLotById\(unit\.lotId\)/);
  assert.match(body, /labelLibraryPrintingService\.buildFieldValues\(unit, lot\)/);
  assert.doesNotMatch(body, /printDescriptor|submitRasterToCups|printUnitLabels/);
});

test('Unit preview search is narrowly identity-based and bounded', () => {
  const model = read('models/techUnitModel.js');
  const start = model.indexOf('async function searchUnitsByIdentity');
  const end = model.indexOf('\n\nasync function getTechUnitLifecycleSummaryById', start);
  const body = model.slice(start, end);

  assert.match(body, /CAST\(u\.unit_id AS CHAR\) LIKE/);
  assert.match(body, /CAST\(u\.asset_number AS CHAR\) LIKE/);
  assert.match(body, /FROM unit_identifiers ui_preview/);
  assert.match(body, /LIMIT \?/);
  assert.match(body, /Math\.min\(20/);
});

test('selected Unit values replace representative values only in transient preview state', () => {
  const js = read('public/js/label-builder.js');
  const fieldPreviewStart = js.indexOf('function getFieldPreviewValue');
  const fieldPreviewEnd = js.indexOf('\n\n  function setPreviewResultsMessage', fieldPreviewStart);
  const fieldPreview = js.slice(fieldPreviewStart, fieldPreviewEnd);
  const historyStart = js.indexOf('function buildHistorySnapshot');
  const historyEnd = js.indexOf('\n\n  function updateDirtyIndicator', historyStart);
  const history = js.slice(historyStart, historyEnd);

  assert.match(fieldPreview, /state\.previewFieldValues/);
  assert.match(fieldPreview, /field\?\.sampleValue/);
  assert.match(js, /state\.previewFieldValues = payload\.fieldValues/);
  assert.match(js, /state\.previewFieldValues = null/);
  assert.match(js, /renderRegions\(\)/);
  assert.doesNotMatch(history, /previewFieldValues|previewUnit/);
  assert.match(js, /textCase === 'camel'/);
  assert.match(js, /'camel', 'Camel Case'/);
});

test('Label Builder exposes separate long and short processor and OS fields', () => {
  const fields = read('config/labelFieldRegistry.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const model = read('models/techUnitModel.js');

  assert.match(fields, /unit\.processor'.*Processor \(Long Form\)/);
  assert.match(fields, /unit\.processor_short'.*Processor \(Short Form\)/);
  assert.match(fields, /unit\.operating_system'.*Operating System \(Long Form\)/);
  assert.match(fields, /unit\.operating_system_short'.*Operating System \(Short Form\)/);
  assert.match(printing, /'unit\.processor_short': processorShort/);
  assert.match(printing, /'unit\.operating_system_short': formatOperatingSystemShortLabel\(operatingSystem\)/);
  assert.match(fields, /unit\.operating_system_short'.*sampleValue: 'Win 11 Pro'/);
  const osShortStart = printing.indexOf('function formatOperatingSystemShortLabel');
  const osShortEnd = printing.indexOf('\n\nfunction buildFieldValues', osShortStart);
  const osShortFormatter = printing.slice(osShortStart, osShortEnd);
  assert.match(osShortFormatter, /replace\(\/\^Windows\\b\/i, 'Win'\)/);
  assert.doesNotMatch(osShortFormatter, /toUpperCase/);
  const processorShortStart = printing.indexOf('function formatProcessorShortLabel');
  const processorShortEnd = printing.indexOf('\n\nfunction formatOperatingSystemShortLabel', processorShortStart);
  const processorShortFormatter = printing.slice(processorShortStart, processorShortEnd);
  assert.match(processorShortFormatter, /rawShortForm\.replace\(\/-S\(\\d\+\)\\b\/gi, ' Series \$1'\)/);
  assert.ok(processorShortFormatter.includes('/^core ultra$/i'));
  assert.match(processorShortFormatter, /Intel Core/);
  assert.match(model, /pf_preview\.export_short_form/);
  assert.match(model, /processorShortForm: row\.processor_short_form/);
});

