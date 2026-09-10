'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Phase C resolves effective Lot labels and only uses compatibility fallback when no Lot set exists', () => {
  const source = read('services/labelLibraryPrintingService.js');
  assert.match(source, /getEffectiveLotTemplateSet\(lotId\)/);
  assert.match(source, /effectiveSet\.source\.type === 'none'/);
  assert.match(source, /isCompatibilityFallback: true/);
  assert.match(source, /isCompatibilityFallback: false/);
  assert.match(source, /if \(!normalized\.isActive\) return null/);
  assert.match(source, /template\.status !== 'active'/);
});

test('current standard Library template retains the exact proven legacy renderer and CUPS submission path', () => {
  const source = read('services/labelLibraryPrintingService.js');
  const legacyService = read('services/labelPrintingService.js');
  assert.match(source, /legacyRendererId === LEGACY_RENDERER_ID/);
  assert.match(source, /buildUnitLabelRender\(unit, lot, LEGACY_RENDERER_ID\)/);
  assert.match(source, /labelPrintingService\.submitRasterToCups/);
  assert.match(legacyService, /spawn\('\/usr\/bin\/lp'/);
  assert.match(legacyService, /'-o', 'raw'/);
});

test('generic schema-v1 renderer supports text, composed fields, Code 39, QR and reusable images without arbitrary expressions', () => {
  const source = read('services/labelTemplateLayoutRenderer.js');
  for (const elementType of ['static_text', 'dynamic_text', 'composed_text', 'barcode', 'image', 'qr']) {
    assert.match(source, new RegExp(`case '${elementType}'`));
  }
  assert.match(source, /schemaVersion\) !== 1/);
  assert.match(source, /Unsupported label field format/);
  assert.match(source, /Unsupported label element type/);
  assert.match(source, /QRCode\.toString/);
  assert.match(source, /errorCorrectionLevel/);
});

test('single-Unit Print Label modal uses the effective multi-template set with required defaults and per-template quantity', () => {
  const controller = read('controllers/techController.js');
  const modal = read('views/fragments/tech-unit-print-label-modal.ejs');
  assert.match(controller, /getUnitPrintTemplateSet\(context\.unit\.lotId\)/);
  assert.match(controller, /buildDefaultSelections/);
  assert.match(controller, /normalizeUnitLabelPrintSelection/);
  assert.match(modal, /name="templateKey"/);
  assert.match(modal, /name="quantity\[<%= template\.key %>\]"/);
  assert.match(modal, />Required</);
  assert.match(modal, />Optional</);
  assert.doesNotMatch(modal, /name="templateId"/);
});

test('Phase C writes print sets, jobs, items and attempts and updates successful template usage', () => {
  const history = read('models/labelPrintHistoryModel.js');
  const controller = read('controllers/techController.js');
  assert.match(history, /INSERT INTO label_print_sets/);
  assert.match(history, /INSERT INTO label_print_jobs/);
  assert.match(history, /INSERT INTO label_print_job_items/);
  assert.match(history, /INSERT INTO label_print_attempts/);
  assert.match(history, /print_count = print_count \+ \?/);
  assert.match(history, /last_used_at = CURRENT_TIMESTAMP\(6\)/);
  assert.match(controller, /status: partial \? 'partial' : 'failed'/);
  assert.match(controller, /copiesSubmitted/);
});

test('print sets group successive individual print actions using the agreed three-minute default', () => {
  const config = read('config/labelLibrary.js');
  const history = read('models/labelPrintHistoryModel.js');
  assert.match(config, /LABEL_PRINT_SET_GROUPING_GAP_MINUTES = 3/);
  assert.match(history, /grouping_kind = 'auto'/);
  assert.match(history, /DATE_SUB\(CURRENT_TIMESTAMP\(6\), INTERVAL \? MINUTE\)/);
});
