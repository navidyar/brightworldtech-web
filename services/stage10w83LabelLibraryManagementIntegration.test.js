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

test('obsolete Phase B legacy seed is retired without changing the physical print transport', () => {
  const packageJson = read('package.json');
  const printingService = read('services/labelPrintingService.js');

  assert.equal(fs.existsSync(path.join(root, 'scripts/seedLabelLibraryPhaseB.js')), false);
  assert.doesNotMatch(packageJson, /label-library-phase-b|seedLabelLibraryPhaseB/);
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

test('Lot label picker keeps search, category, global Library ordering and New badge', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const model = read('models/labelLibraryModel.js');
  assert.match(modal, /data-lot-label-search/);
  assert.match(modal, /data-lot-label-category/);
  assert.match(modal, /lot-unit-form-rules-modal/, 'Configure Labels should reuse the viewport-bounded Lot modal shell so the body remains scrollable on short screens');
  assert.match(modal, />New</);
  assert.match(model, /template\.library_sort_order ASC/);
  assert.match(modal, /Include in normal print set/);
  assert.doesNotMatch(modal, /Active in Lot/);
  assert.doesNotMatch(modal, />Order</);
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
  assert.match(model, /String\(asset\.role\) !== 'config_json'/);
  assert.doesNotMatch(model, /\['logo', 'image', 'background'\]\.includes\(String\(asset\.role\)\)/);
});


test('Archived Label Library templates expose an explicit unarchive-to-Draft lifecycle action', () => {
  const controller = read('controllers/labelLibraryController.js');
  const model = read('models/labelLibraryModel.js');
  const library = read('views/pages/management-label-library.ejs');
  const modal = read('views/fragments/label-template-action-modal.ejs');
  assert.match(controller, /\['activate', 'archive', 'unarchive', 'delete'\]/);
  assert.match(controller, /action === 'archive' \? 'archived' : 'draft'/);
  assert.match(controller, /unarchived=1|noticeKey/);
  assert.match(model, /template_unarchived/);
  assert.match(library, /template\.status === 'archived'/);
  assert.match(library, />Unarchive</);
  assert.match(library, /template\.status === 'draft'/);
  assert.match(modal, /unarchive: 'Unarchive Template'/);
  assert.match(modal, /restores the template to Draft/);
});

test('Lot assignment relies on global template lifecycle instead of a second Active-in-Lot toggle', () => {
  const modal = read('views/fragments/lot-label-templates-modal.ejs');
  const controller = read('controllers/lotController.js');
  const policy = read('services/labelTemplateInputPolicy.js');
  assert.match(modal, /Draft templates may be attached for staging and become printable automatically after global activation/);
  assert.doesNotMatch(modal, /Active in Lot/);
  assert.doesNotMatch(controller, /Only globally Active label templates can be active in a Lot/);
  assert.match(policy, /isActive: true/);
});
