'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Duplicate Lot reuses rounded choice cards and hides the Parent Lot control for Top-Level placement', () => {
  const modal = read('views/fragments/lot-duplicate-modal.ejs');
  const lotScript = read('public/js/lot-form.js');
  const lotCss = read('public/css/lots.css');

  assert.match(modal, /data-lot-duplicate-form/);
  assert.match(modal, /lot-choice-fieldset/);
  assert.match(modal, /class="checkbox-card" for="duplicatePlacementTopLevel"/);
  assert.match(modal, /data-lot-duplicate-parent-field/);
  assert.match(modal, /data-lot-duplicate-parent-select/);
  assert.match(modal, /safeFormData\.placementMode === 'child' \? '' : 'hidden'/);
  assert.match(modal, /safeFormData\.placementMode === 'child' \? '' : 'disabled'/);
  assert.doesNotMatch(modal, /Copy Summary/);

  assert.match(lotScript, /function setupLotDuplicateForm/);
  assert.match(lotScript, /parentField\.hidden = !isChildPlacement/);
  assert.match(lotScript, /parentSelect\.disabled = !isChildPlacement/);
  assert.match(lotScript, /parentInheritance\.disabled = !isChildPlacement/);
  assert.match(lotScript, /preserveInheritance\.checked = true/);

  assert.match(lotCss, /\.lot-choice-fieldset[\s\S]*?border: 0/);
  assert.match(lotCss, /input\[type="checkbox"\], input\[type="radio"\][\s\S]*?width: 16px/);
});

test('Top-Level duplication is normalized to preserve-source inheritance on the server', () => {
  const controller = read('controllers/lotController.js');

  assert.match(controller, /requestedInheritanceMode/);
  assert.match(controller, /inheritanceMode: placementMode === 'child' && requestedInheritanceMode === 'new_parent'[\s\S]*?'new_parent'[\s\S]*?'preserve_source'/);
});

test('Lot Details uses one Export Units action and the shared export modal owns multi-select scope selection', () => {
  const detailPage = read('views/pages/management-lot-detail.ejs');
  const modal = read('views/fragments/tech-unit-export-preview-modal.ejs');
  const exportScript = read('public/js/unit-export.js');
  const lotCss = read('public/css/lots.css');

  assert.match(detailPage, />Export Units<\/button>/);
  assert.doesNotMatch(detailPage, />Export Direct Units<\/button>/);
  assert.doesNotMatch(detailPage, />Export Lot \+ Descendants<\/button>/);

  assert.match(modal, /Export Scope/);
  assert.match(modal, /safeExportScopeOptions/);
  assert.match(modal, /type="checkbox"/);
  assert.match(modal, /name="lotIds"/);
  assert.match(modal, /data-lot-export-scope-option/);
  assert.match(modal, /data-lot-export-scope-options/);
  assert.match(modal, /checkbox-card unit-export-scope-option/);
  assert.match(exportScript, /getSelectedLotExportScopeIds/);
  assert.match(exportScript, /window\.htmx\.ajax/);
  assert.match(lotCss, /\.unit-export-scope-options[\s\S]*?border: 0/);
});

test('Lot export scope composes the parent and any number of direct child branches', () => {
  const controller = read('controllers/lotController.js');
  const scopeService = read('services/lotExportScope.js');

  assert.match(controller, /label: 'This Lot'/);
  assert.match(controller, /directChildLots\.forEach\(\(childLot\) =>/);
  assert.match(controller, /label: childLot\.lot_name/);
  assert.match(controller, /selectedLotIds/);
  assert.match(controller, /params\.append\('lotIds'/);
  assert.match(scopeService, /function buildSelectedLotExportScope/);
  assert.match(scopeService, /collectBranchLotIds\(scopeLotId/);
  assert.match(scopeService, /BWT_LOT_EXPORT_SELECTION_INVALID/);
});

test('Duplicate Lot preview no longer performs summary-only configuration queries', () => {
  const lotModel = read('models/lotModel.js');
  const previewStart = lotModel.indexOf('async function getLotDuplicationPreview');
  const duplicateStart = lotModel.indexOf('async function duplicateLot', previewStart);
  const previewBody = lotModel.slice(previewStart, duplicateStart);

  assert.match(previewBody, /return sourceLot \? \{ sourceLot \} : null/);
  assert.doesNotMatch(previewBody, /listLotRequirements/);
  assert.doesNotMatch(previewBody, /listEffectiveLotRequirements/);
  assert.doesNotMatch(previewBody, /listRulesForLot/);
  assert.doesNotMatch(previewBody, /getEffectiveUnitFormProfileForLot/);
});
