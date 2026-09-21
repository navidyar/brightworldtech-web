'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) { return fs.readFileSync(path, 'utf8'); }

test('Active templates remain editable in Layout Builder with effective Lot impact warning', () => {
  const controller = source('controllers/labelLibraryController.js');
  const library = source('views/pages/management-label-library.ejs');
  const builder = source('views/pages/management-label-builder.ejs');
  assert.match(library, /template\.status !== 'archived'/);
  assert.match(controller, /listEffectiveTemplateLotUsage/);
  assert.match(controller, /affectedActiveLotCount/);
  assert.match(builder, /This template is Active/);
  assert.match(builder, /used by <strong><%= formatNumber\(affectedActiveLotCount\)/);
  assert.match(builder, /Save Live Layout/);
});

test('Active layout saves reject incomplete live layouts while archived layouts remain blocked', () => {
  const controller = source('controllers/labelLibraryController.js');
  assert.match(controller, /An Active template must remain print-ready/);
  assert.match(controller, /preflightActiveBuilderLayout/);
  assert.match(controller, /buildRepresentativeFieldValues/);
  assert.match(controller, /Live label print preflight failed/);
  assert.match(controller, /Unarchive this template to Draft before editing its layout/);
});

test('Label Library summary uses the established modern summary-panel pattern and Edit modal stays aligned', () => {
  const library = source('views/pages/management-label-library.ejs');
  const form = source('views/fragments/label-template-form-modal.ejs');
  const css = source('public/css/app.css');
  assert.match(library, /label-library-summary-panel/);
  assert.match(library, /label-library-summary-primary/);
  assert.match(library, /label-library-summary-stats/);
  assert.doesNotMatch(library, /label-library-summary-line/);
  assert.match(library, /site-summary-panel site-summary-panel--expanded/);
  assert.match(library, /site-summary-stats site-summary-stats--five/);
  assert.match(css, /\.site-summary-panel--expanded/);
  assert.match(css, /\.site-summary-stats--five[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(form, /label-template-form-grid/);
  assert.match(css, /label-template-form-grid > label/);
  assert.match(css, /label-template-form-grid \.full-width/);
});

test('Archive copy explains retirement without deletion and Draft restoration on unarchive', () => {
  const modal = source('views/fragments/label-template-action-modal.ejs');
  assert.match(modal, /Archive retires this template without deleting it/);
  assert.match(modal, /keeps its Lot attachments and historical records\/assets/);
  assert.match(modal, /restores it to Draft/);
});

