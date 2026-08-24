const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('QC header uses the same shared sortable-header control as the other Units headers', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(
    table,
    /class="tech-units-qc-column-label <%= sortLinkClass\('qc_status_desc', 'qc_status_asc'\) %>"/
  );
  assert.match(
    table,
    /href="<%= makeUnitSortUrl\(nextSortValue\('qc_status_desc', 'qc_status_asc'\)\) %>"/
  );
  assert.match(table, /Sort Units by Quality Control status/);
  assert.doesNotMatch(table, /makeQcHeaderFilterUrl|qcHeaderFilterOptions|nextQcHeaderFilter/);
});

test('QC sorting preserves all Unit Browser filters and resets pagination through the shared sort URL helper', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const helperStart = table.indexOf('function makeUnitSortUrl(sortValue)');
  const helperEnd = table.indexOf('function nextSortValue', helperStart);
  const helper = table.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(table, /const sortQueryKeys = \[[\s\S]*?'search'[\s\S]*?'lotId'[\s\S]*?'categoryId'[\s\S]*?'gradeFilter'[\s\S]*?'qcReviewFilter'[\s\S]*?'techUserId'[\s\S]*?'createdStartDate'[\s\S]*?'createdEndDate'[\s\S]*?'createdWindow'[\s\S]*?'unitState'[\s\S]*?'perPage'/);
  assert.match(helper, /params\.set\('sort', sortValue\)/);
  assert.doesNotMatch(helper, /params\.set\('page'/);
});

test('QC sort values and semantic state ranking are implemented in the Unit query', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /'qc_status_desc',[\s\S]*?'qc_status_asc'/);
  assert.match(model, /function getQcStatusSortRankSql\(correctionSchemaIsReady = false\)/);
  assert.match(model, /qc_current_completion\.unit_work_completion_id IS NULL THEN 10/);
  assert.match(model, /qc_review_state\.latest_decision_code IS NULL THEN 40/);
  assert.match(model, /latest_decision_code = 'accepted'[\s\S]*?has_rejection, 0\) = 0 THEN 20/);
  assert.match(model, /latest_decision_code = 'accepted'[\s\S]*?has_rejection, 0\) = 1 THEN 30/);
  assert.match(model, /latest_decision_code = 'rejected'[\s\S]*?latest_correction_id IS NOT NULL[\s\S]*?THEN 50/);
  assert.match(model, /latest_decision_code = 'rejected' THEN 60/);
  assert.match(model, /normalizedSort === 'qc_status_desc'[\s\S]*?normalizedSort === 'qc_status_asc'[\s\S]*?qcReviewSchemaIsReady/);
});

test('all Units headers inherit the common table-header typography instead of page-specific values', () => {
  const pageCss = read('public/css/tech-units-clean.css');
  const commonCss = read('public/css/app.css');
  const workAreaCss = read('public/css/work-area.css');

  const headerRuleStart = pageCss.indexOf('.tech-units-clean-page .tech-units-table thead th {');
  const headerRuleEnd = pageCss.indexOf('}', headerRuleStart);
  const headerRule = pageCss.slice(headerRuleStart, headerRuleEnd + 1);

  assert.ok(headerRuleStart >= 0 && headerRuleEnd > headerRuleStart);
  assert.match(headerRule, /vertical-align: middle/);
  assert.match(headerRule, /white-space: nowrap/);
  assert.doesNotMatch(headerRule, /font-|letter-spacing|line-height|text-transform|color:|background:|padding:|border-/);
  assert.match(commonCss, /\.content-shell th,[\s\S]*?font-size: 0\.72rem;[\s\S]*?font-weight: 650;[\s\S]*?letter-spacing: 0\.025em;[\s\S]*?text-transform: none;/);
  assert.match(workAreaCss, /\.table-sort-link \{[\s\S]*?font: inherit;[\s\S]*?font-size: inherit;[\s\S]*?font-weight: inherit;[\s\S]*?letter-spacing: inherit;[\s\S]*?line-height: inherit;[\s\S]*?text-transform: inherit;/);
  assert.doesNotMatch(pageCss, /tech-units-qc-filter-link/);
});

test('shared and Units table styles are cache-busted together', () => {
  const head = read('views/partials/head.ejs');
  const page = read('views/pages/tech-units.ejs');
  const detail = read('views/pages/tech-unit-detail.ejs');

  assert.match(head, /work-area\.css\?v=20260812-stage10w48-cross-browser-period-picker/);
  for (const template of [page, detail]) {
    assert.match(template, /tech-units-clean\.css\?v=20260819-stage10w68o-toggle-label-cleanup/);
  }
});
