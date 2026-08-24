'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9F derives queue state from current completion and append-only QC reviews', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY completion\.unit_id[\s\S]*completion\.completed_at DESC/);
  assert.match(model, /completion\.reversed_at IS NULL/);
  assert.match(model, /MAX\(qc\.unit_qc_check_id\) AS latest_qc_check_id/);
  assert.match(model, /CASE WHEN latest_qc\.reverted_at IS NULL THEN latest_qc\.decision_code ELSE NULL END AS latest_decision_code/);
  assert.match(model, /MAX\(CASE WHEN qc\.decision_code = 'rejected' AND qc\.reverted_at IS NULL THEN 1 ELSE 0 END\) AS has_rejection/);
  assert.match(model, /qc_review_state\.latest_decision_code = 'accepted'[\s\S]*has_rejection, 0\) = 0/);
  assert.match(model, /qc_review_state\.latest_decision_code = 'accepted'[\s\S]*has_rejection, 0\) = 1/);
  assert.match(model, /qc_review_state\.latest_decision_code = 'rejected'/);
});

test('Stage 9F applies QC queue filtering before pagination and preserves it in URLs', () => {
  const model = read('models/techUnitModel.js');
  const controller = read('controllers/techController.js');
  const pagination = read('views/partials/table-pagination.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  const filterIndex = model.indexOf('const qcReviewConditionSql = getQcReviewFilterConditionSql(qcReviewFilter, qcCorrectionSchemaIsReady)');
  const paginationIndex = model.indexOf('const pagination = buildUnitPagination(filters', filterIndex);
  assert.ok(filterIndex >= 0 && paginationIndex > filterIndex);
  assert.match(controller, /qcReviewFilter: String\(req\.query\.qcReviewFilter \|\| ''\)\.trim\(\)/);
  assert.match(controller, /'qcReviewFilter'/);
  assert.match(pagination, /'qcReviewFilter'/);
  assert.match(table, /'qcReviewFilter'/);
});

test('Stage 9F renders a compact queue strip without introducing card records', () => {
  const page = read('views/pages/tech-units.ejs');
  const fragment = read('views/fragments/tech-units-qc-review-queue.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(page, /include\('\.\.\/fragments\/tech-units-qc-review-queue'/);
  assert.match(fragment, /QC Review Queue/);
  assert.match(fragment, /Awaiting QC/);
  assert.match(fragment, /Accepted/);
  assert.match(fragment, /Corrected/);
  assert.match(fragment, /Ready for Recheck/);
  assert.match(fragment, /Pending Correction/);
  assert.doesNotMatch(fragment, /card/);
  assert.match(css, /\.tech-qc-review-queue \{/);
  assert.match(css, /overflow-x: auto/);
});

test('Stage 9F targeted refresh updates queue counts without replacing open Unit views', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const script = read('public/js/tech-units.js');

  assert.match(table, /tech-units-qc-review-queue[\s\S]*oob: true/);
  assert.match(script, /function refreshQcReviewQueue\(incomingDocument\)/);
  assert.match(script, /data-tech-qc-review-queue-version/);
  assert.match(script, /refreshQcReviewQueue\(incomingDocument\)/);
  assert.match(script, /reconcileTechUnitRecords\(currentTable, incomingTable\)/);
  assert.doesNotMatch(script, /window\.location\.reload\(\)/);
});

test('Stage 9F cache versions and validation command are wired', () => {
  const packageJson = JSON.parse(read('package.json'));
  const page = read('views/pages/tech-units.ejs');
  const detail = read('views/pages/tech-unit-detail.ejs');

  assert.equal(packageJson.scripts['validate:qc-queue'], 'node --test services/qcReviewQueue.test.js services/stage9fQcReviewQueueIntegration.test.js services/stage9fQcAwaitingCompletionConsistency.test.js');
  for (const template of [page, detail]) {
    assert.match(template, /tech-units-clean\.css\?v=20260819-stage10w68o-toggle-label-cleanup/);
    assert.match(template, /tech-units\.js\?v=20260819-stage10w68l-filter-toggles/);
  }
});
