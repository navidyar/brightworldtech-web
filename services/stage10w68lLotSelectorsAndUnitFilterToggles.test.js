'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('all visible Lot selectors use shared root styling and deeper child indentation', () => {
  const hierarchyPartial = read('views/partials/hierarchical-lot-options.ejs');
  const parentPartial = read('views/partials/parent-lot-options.ejs');
  const appCss = read('public/css/app.css');
  const formScript = read('public/js/tech-unit-form.js');
  const lotNew = read('views/pages/management-lot-new.ejs');
  const lotEdit = read('views/fragments/lot-form-modal.ejs');
  const lotDuplicate = read('views/fragments/lot-duplicate-modal.ejs');

  assert.match(hierarchyPartial, /\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0'\.repeat\(optionDepth\)/);
  assert.match(parentPartial, /data-lot-depth="<%= depth %>"/);
  assert.match(parentPartial, /\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0\\u00A0'\.repeat\(depth\)/);
  assert.match(appCss, /option\[data-lot-depth="0"\][\s\S]*background:\s*#edf5ff/);
  assert.match(appCss, /option\[data-lot-depth\]:not\(\[data-lot-depth="0"\]\)[\s\S]*padding-inline-start:\s*18px/);
  assert.match(appCss, /tech-assignable-lot-option--root[\s\S]*background:\s*#edf5ff/);
  assert.match(appCss, /var\(--lot-depth, 0\) \* 26px/);
  assert.match(formScript, /depth === 0[\s\S]*tech-assignable-lot-option--root/);

  [lotNew, lotEdit, lotDuplicate].forEach((view) => {
    assert.match(view, /data-hierarchical-lot-select/);
    assert.match(view, /parent-lot-options/);
  });
});

test('Lot parent options receive hierarchy depth from one shared model lookup', () => {
  const lotModel = read('models/lotModel.js');

  assert.match(lotModel, /buildLotHierarchyLookup/);
  assert.match(lotModel, /listParentLotOptions[\s\S]*listLotHierarchyRows\(\)/);
  assert.match(lotModel, /hierarchy_depth:\s*hierarchy \? hierarchy\.depth : 0/);
  assert.match(lotModel, /parentLots:\s*parentLotOptions/);
});

test('Unit Browser replaces the two-option Lot Scope select with inline toggles and adds completion toggles', () => {
  const page = read('views/pages/tech-units.ejs');
  const css = read('public/css/tech-units-clean.css');
  const script = read('public/js/tech-units.js');

  assert.doesNotMatch(page, /<select name="lotScope"/);
  assert.match(page, /type="checkbox"[\s\S]*name="lotScope"[\s\S]*value="descendants"/);
  assert.match(page, /tech-unit-state-toggle-label">Include Descendants/);
  assert.match(page, /tech-filter-toggle-row/);
  assert.match(page, /aria-label="Completion"/);
  assert.match(page, /name="completionFilter"[\s\S]*value="not_completed"/);
  assert.match(page, /name="completionFilter"[\s\S]*value="completed"/);
  assert.match(page, /data-tech-exclusive-filter-toggle/);
  assert.match(page, /tech-unit-state-toggle-track[\s\S]*Include Descendants/);
  assert.match(page, /tech-unit-state-toggle-track[\s\S]*Not Completed/);
  assert.doesNotMatch(css, /tech-filter-toggle-button/);
  assert.match(css, /tech-filter-toggle-set \.tech-unit-state-toggle/);
  assert.match(script, /data-tech-exclusive-filter-toggle[\s\S]*otherControl\.checked = false/);
});

test('completion filter uses the canonical current-cycle completion join and survives navigation/export', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  const table = read('views/fragments/tech-units-table.ejs');
  const pagination = read('views/partials/table-pagination.ejs');
  const exportService = read('services/unitExportService.js');

  assert.match(controller, /'completionFilter'/);
  assert.match(controller, /\['completed', 'not_completed'\]/);
  assert.match(model, /const completionFilter = qcReviewSchemaIsReady/);
  assert.match(model, /completionFilter === 'completed'[\s\S]*qc_current_completion\.unit_work_completion_id IS NOT NULL/);
  assert.match(model, /completionFilter === 'not_completed'[\s\S]*qc_current_completion\.unit_work_completion_id IS NULL/);
  assert.ok(model.indexOf("if (completionFilter === 'completed')") > model.indexOf('const baseUnitFromSql'));
  assert.match(table, /'completionFilter'/);
  assert.match(table, /'lotScope'/);
  assert.match(pagination, /'completionFilter'/);
  assert.match(exportService, /\['Completion',[\s\S]*Not Completed/);
});
