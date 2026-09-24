'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('template metadata separates business category from Lot or Standalone print availability', () => {
  const config = source('config/labelLibrary.js');
  const form = source('views/fragments/label-template-form-modal.ejs');
  const controller = source('controllers/labelLibraryController.js');
  assert.match(config, /LABEL_TEMPLATE_PRINT_SCOPES/);
  assert.match(config, /code: 'lot'/);
  assert.match(config, /code: 'standalone'/);
  assert.match(form, /Print Availability/);
  assert.match(form, /name="printScope"/);
  assert.match(controller, /printScope/);
});

test('Lot label picker retrieves only Lot Selection templates and rejects stale Standalone submissions', () => {
  const controller = source('controllers/lotController.js');
  const model = source('models/labelLibraryModel.js');
  assert.match(controller, /listLabelTemplates\(\{ includeArchived: true, printScope: 'lot' \}\)/);
  assert.match(model, /template\.print_scope = \?/);
});

test('builder exposes Static and Dynamic Text with shared typography controls', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const js = source('public/js/label-builder.js');
  assert.match(view, /Static Text/);
  assert.match(view, /Dynamic Text/);
  assert.match(view, /Font Family/);
  assert.match(view, /Font Size \(dots\)/);
  assert.match(view, /Justification/);
  assert.match(view, /As Stored/);
  assert.match(view, /BWTDallas Data Source/);
  assert.match(js, /data-builder-font-family|fontFamilySelect/);
  assert.match(js, /dynamicFieldSelect/);
});

test('all builder regions carry quarter-turn rotation and the renderer applies SVG transforms', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const js = source('public/js/label-builder.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(view, /90° · Clockwise/);
  assert.match(view, /270° · Counter-clockwise/);
  assert.match(js, /rotateRegionTo/);
  assert.match(js, /nextWidth = region\.height/);
  assert.match(renderer, /wrapElementRotation/);
  assert.match(renderer, /rotate\(\$\{rotation\}/);
});

test('server renderer supports the curated server-installed font families', () => {
  const dockerfile = source('Dockerfile');
  const builder = source('config/labelBuilder.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(dockerfile, /fonts-liberation/);
  assert.match(dockerfile, /fonts-noto-core/);
  assert.match(builder, /Liberation Sans/);
  assert.match(builder, /Noto Sans/);
  assert.match(renderer, /FONT_FAMILY_CODES/);
  assert.match(renderer, /font-family="\$\{escapeXml\((?:effectiveStyle|style)\.fontFamily\)\}"/);
});

test('print availability migration defaults existing templates to Lot Selection', () => {
  const migration = source('scripts/migrateLabelTemplatePrintScope.js');
  const foundation = source('scripts/migrateLabelLibraryFoundation.js');
  assert.match(migration, /DEFAULT 'lot'/);
  assert.match(migration, /Existing templates to initialize as Lot Selection/);
  assert.match(foundation, /print_scope/);
  assert.match(foundation, /idx_label_templates_print_scope_status/);
});


test('configured text regions are preview-clean while idle', () => {
  const css = `${source('public/css/app.css')}\n${source('public/css/features.css')}`;
  assert.match(css, /label-builder-region:not\(\[data-builder-type="unconfigured"\]\):not\(\.selected\):not\(:hover\)/);
  assert.match(css, /\.label-builder-region \{[\s\S]{0,400}border: 0;/);
  assert.match(css, /background: transparent/);
  assert.doesNotMatch(css, /data-builder-rotation="90"[\s\S]{0,120}background:/);
});
