'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Label Library exposes the visual Layout Builder for Draft and Active templates', () => {
  const view = source('views/pages/management-label-library.ejs');
  assert.match(view, /Layout Builder/);
  assert.match(view, /template\.status !== 'archived'/);
  assert.match(view, /template\.layout_ready/);
  assert.match(view, /Finish the saved layout and resolve any media, asset, field, barcode, or QR validation issues before activation/);
});

test('Management routes protect builder read and save operations with Management roles', () => {
  const routes = source('routes/management.js');
  assert.match(routes, /templates\/:labelTemplateId\/builder/);
  assert.match(routes, /labelLibraryController\.renderTemplateBuilder/);
  assert.match(routes, /labelLibraryController\.saveTemplateBuilder/);
});

test('Builder is a logical DOM canvas with region drag resize grid and keyboard controls', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const js = source('public/js/label-builder.js');
  assert.match(view, /data-builder-canvas/);
  assert.match(view, /Show Grid/);
  assert.match(view, /Snap to Grid/);
  assert.match(view, /\+ Add Region/);
  assert.match(js, /pointermove/);
  assert.match(js, /data-builder-resize/);
  assert.match(js, /Shift \+ Arrow|event\.shiftKey/);
  assert.match(js, /ArrowLeft/);
});

test('Grid is editor-only and defaults off', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const js = source('public/js/label-builder.js');
  assert.doesNotMatch(view, /data-builder-grid-visible[^>]*checked/);
  assert.match(js, /canvas\.classList\.toggle\('show-grid', gridVisible\.checked\)/);
});

test('Builder saves only JSON layout instructions and does not persist preview images', () => {
  const controller = source('controllers/labelLibraryController.js');
  const start = controller.indexOf('async function saveTemplateBuilder');
  const end = controller.indexOf('async function renderAssetUploadModal', start);
  const saveController = controller.slice(start, end);
  assert.match(saveController, /Buffer\.from\(`\$\{JSON\.stringify\(layout, null, 2\)\}\\n`/);
  assert.match(saveController, /mimeType: 'application\/json'/);
  assert.doesNotMatch(saveController, /previewPng|previewDataUri|background_candidate|original_sample/);
});

test('Builder uses supported QL-810W roll widths with a variable continuous length', () => {
  const media = source('config/labelMedia.js');
  const form = source('views/fragments/label-template-form-modal.ejs');
  const builder = source('views/pages/management-label-builder.ejs');
  assert.match(media, /12mm_continuous/);
  assert.match(media, /29mm_continuous/);
  assert.match(media, /38mm_continuous/);
  assert.match(media, /50mm_continuous/);
  assert.match(media, /54mm_continuous/);
  assert.match(media, /62mm_continuous/);
  assert.match(form, /Continuous Roll Width/);
  assert.match(form, /mediaWidthCode/);
  assert.match(builder, /Label Length \(mm\)/);
  assert.match(builder, /data-builder-length-delta="10"/);
});

test('Builder save replaces config_json through content-addressed storage', () => {
  const controller = source('controllers/labelLibraryController.js');
  const model = source('models/labelLibraryModel.js');
  assert.match(controller, /writeContentAddressedAsset/);
  assert.match(controller, /replaceTemplateConfigAsset/);
  assert.match(model, /template_layout_saved/);
  assert.match(model, /DELETE FROM label_template_asset_links WHERE label_template_id = \? AND role = 'config_json'/);
});


test('Builder returns keyboard focus to a clicked region after form editing', () => {
  const js = source('public/js/label-builder.js');
  assert.match(js, /node\.focus\(\{ preventScroll: true \}\)/);
  assert.match(js, /canvas\.focus\(\{ preventScroll: true \}\)/);
});

test('Builder keeps controls compact and uses local border-only form focus styling', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const css = source('public/css/label-builder.css');
  assert.doesNotMatch(view, /label-builder-foundation-note/);
  assert.match(css, /grid-template-columns: max-content max-content minmax\(280px, 1fr\) max-content/);
  assert.match(css, /label-builder-check input:focus-visible/);
  assert.match(css, /box-shadow: none/);
  assert.match(css, /max-height: calc\(100dvh - 235px\)/);
});

test('Builder provides drag-only center alignment guides without persisting guide state', () => {
  const js = source('public/js/label-builder.js');
  const css = source('public/css/label-builder.css');
  assert.match(js, /CENTER_GUIDE_SNAP_PX = 5/);
  assert.match(js, /show-vertical-center-guide/);
  assert.match(js, /show-horizontal-center-guide/);
  assert.match(js, /applyCenterGuideAssist\(region, x, y\)/);
  assert.match(js, /setCenterGuides\(centerAssist\)/);
  assert.match(css, /label-builder-canvas\.show-vertical-center-guide::before/);
  assert.match(css, /label-builder-canvas\.show-horizontal-center-guide::after/);
  assert.match(css, /background: #d12d2d/);
});
