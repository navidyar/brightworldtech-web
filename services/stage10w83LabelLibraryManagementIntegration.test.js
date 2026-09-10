'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Management gets Label Library navigation and Management-only routes', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const routes = read('routes/management.js');
  assert.match(sidebar, /Label Library/);
  assert.match(sidebar, /management-label-library/);
  assert.match(routes, /\/management\/label-library/);
  assert.match(routes, /requireRole\(managementRoles\)/);
  assert.match(routes, /labelLibraryController\.renderLabelLibraryPage/);
});

test('Label Library supports draft metadata CRUD, clone, lifecycle and hard delete', () => {
  const controller = read('controllers/labelLibraryController.js');
  const model = read('models/labelLibraryModel.js');
  assert.match(model, /createLabelTemplate/);
  assert.match(model, /cloneLabelTemplate/);
  assert.match(model, /setLabelTemplateStatus/);
  assert.match(model, /deleteLabelTemplate/);
  assert.match(model, /LABEL_TEMPLATE_CONFIG_REQUIRED/);
  assert.match(controller, /orphanedTransientAssets/);
  assert.match(model, /template_deleted/);
});

test('Phase B seed registers the current standard-unit-62 design without changing Tech printing', () => {
  const seed = read('scripts/seedLabelLibraryPhaseB.js');
  const printingConfig = read('config/labelPrinting.js');
  const printingService = read('services/labelPrintingService.js');
  assert.match(seed, /legacyRendererId: 'standard-unit-62'/);
  assert.match(seed, /const previewBuffer = Buffer\.from/);
  assert.match(seed, /const previewSha256 = crypto\.createHash/);
  assert.match(seed, /const \[\[previewAsset\]\] = await pool\.query/);
  assert.match(seed, /status, printer_profile_code/);
  assert.match(seed, /'active'/);
  assert.match(printingConfig, /standard-unit-62/);
  assert.match(printingService, /\/usr\/bin\/lp/);
  assert.doesNotMatch(printingService, /labelLibraryModel|lot_label_templates|label_templates/);
});

test('Lot Details exposes Configure Labels with whole-set inheritance and explicit reset', () => {
  const detail = read('views/pages/management-lot-detail.ejs');
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const controller = read('controllers/lotController.js');
  assert.match(detail, /Configure Labels/);
  assert.match(modal, /Current source:/);
  assert.match(modal, /Reset This Lot to Inherit/);
  assert.match(modal, /intentionally empty set/);
  assert.match(controller, /replaceLotTemplateSet/);
  assert.match(controller, /resetLotTemplateSet/);
});

test('Lot label picker keeps search, category, popularity ordering, New badge and lazy preview hooks', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const model = read('models/labelLibraryModel.js');
  assert.match(modal, /data-lot-label-search/);
  assert.match(modal, /data-lot-label-category/);
  assert.match(modal, /loading="lazy"/);
  assert.match(modal, />New</);
  assert.match(model, /attached_lot_count, 0\) DESC/);
  assert.match(model, /template\.print_count DESC/);
});

test('Lot duplication preserves or re-inherits Label Library behavior with the existing inheritance choice', () => {
  const lotModel = read('models/lotModel.js');
  const labelModel = read('models/labelLibraryModel.js');
  assert.match(lotModel, /copyLotTemplateSetForDuplicate/);
  assert.match(labelModel, /materializedEffectiveSet: preserveSource/);
  assert.match(labelModel, /buildLotLabelTemplateBehaviorSignature/);
});

test('shared reusable assets are not deleted merely because a template is removed', () => {
  const model = read('models/labelLibraryModel.js');
  assert.match(model, /\['config_json', 'preview', 'original_sample'\]\.includes/);
  assert.doesNotMatch(model, /\['logo', 'image', 'background'\]\.includes\(String\(asset\.role\)\)/);
});
