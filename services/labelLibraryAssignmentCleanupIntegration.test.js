'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('Configure Labels is simplified to attachment, normal print set and copies', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const policy = read('services/labelTemplateInputPolicy.js');
  assert.match(modal, /name="templateId"/);
  assert.match(modal, /Include in normal print set/);
  assert.match(modal, /Copies per Unit/);
  assert.doesNotMatch(modal, /Active in Lot/);
  assert.doesNotMatch(modal, /name="sortOrder/);
  assert.match(policy, /isActive: true/);
});

test('Label Library owns one draggable global template order', () => {
  const page = read('views/pages/management-label-library.ejs');
  const client = read('public/js/label-library-order.js');
  const model = read('models/labelLibraryModel.js');
  const printing = read('services/labelLibraryPrintingService.js');
  const migration = read('scripts/migrateLabelTemplateLibraryOrder.js');
  assert.match(page, /data-label-template-order-handle/);
  assert.match(client, /orderedTemplateIds/);
  assert.match(client, /setDragImage\(\s*draggingRow/);
  assert.match(client, /dropEffect = 'move'/);
  assert.match(model, /library_sort_order ASC/);
  assert.match(model, /reorderLabelTemplates/);
  assert.match(printing, /template\.library_sort_order/);
  assert.match(migration, /ADD COLUMN library_sort_order/);
});

test('bulk preview hydrates the same Unit model used by physical printing', () => {
  const controller = read('controllers/techController.js');
  const modal = read('views/fragments/tech-units-bulk-print-label-modal.ejs');
  const bulkStart = controller.indexOf('async function buildTechUnitsBulkPrintLabelModalView');
  const bulkEnd = controller.indexOf('async function renderTechUnitsBulkPrintLabelModal', bulkStart);
  const bulk = controller.slice(bulkStart, bulkEnd);
  assert.match(bulk, /getTechUnitLifecycleSummaryById\(sampleCandidate\.unitId\)/);
  assert.doesNotMatch(bulk, /unit: sampleCandidate \? sampleCandidate\.rawUnit/);
  assert.match(modal, /previewUnitLabel/);
  assert.match(modal, /same hydrated data path as physical printing/);
});

test('Shared Asset deletion uses typed DELETE only for Active template usage', () => {
  const controller = read('controllers/labelLibraryController.js');
  const model = read('models/labelLibraryModel.js');
  const modal = read('views/fragments/label-library-asset-delete-modal.ejs');
  const assets = read('views/fragments/label-library-assets-section.ejs');
  assert.match(assets, /assets\/<%= asset\.asset_id %>\/delete\/modal/);
  assert.match(controller, /confirmation !== 'DELETE'/);
  assert.match(model, /template_status/);
  assert.match(model, /DELETE FROM label_template_asset_links WHERE asset_id/);
  assert.match(modal, /Type DELETE to confirm/);
  assert.match(modal, /stop being print-ready until their layouts are repaired/);
});
