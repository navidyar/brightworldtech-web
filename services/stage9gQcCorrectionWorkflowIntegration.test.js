'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9G migration creates append-only correction storage with live parent ID types', () => {
  const sql = read('sql/2026-07-stage-9g-qc-correction-workflow.sql');
  const apply = read('scripts/apply-stage-9g-qc-correction-workflow.sh');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS unit_qc_corrections/);
  assert.match(sql, /rejected_qc_check_id/);
  assert.match(sql, /UNIQUE KEY uq_unit_qc_corrections_rejection/);
  assert.match(sql, /FOREIGN KEY \(rejected_qc_check_id\) REFERENCES unit_qc_checks/);
  assert.match(sql, /SELECT COLUMN_TYPE, DATA_TYPE INTO qc_check_id_type/);
  assert.doesNotMatch(sql, /rejected_qc_check_id BIGINT UNSIGNED/);
  assert.match(apply, /Replacing empty legacy unit_qc_corrections table/);
  assert.match(apply, /will not remove or rewrite existing correction data automatically/);
  assert.match(apply, /expected 1:7:5:4:4/);
});

test('correction submissions are append-only, tied to a rejection, and audited in Unit History', () => {
  const model = read('models/unitQcCorrectionModel.js');

  assert.match(model, /INSERT INTO unit_qc_corrections/);
  assert.match(model, /rejected_qc_check_id = \?/);
  assert.match(model, /latest_decision_code/);
  assert.match(model, /unit_qc_correction_submitted/);
  assert.match(model, /Ready for QC recheck/);
  assert.doesNotMatch(model, /UPDATE unit_qc_corrections/);
});

test('only assigned technicians or Tech Lead and above can mark a rejected Unit corrected', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(routes, /qcCorrectionRoles = \['admin', 'management', 'tech_lead', 'tech'\]/);
  assert.match(routes, /\/tech\/units\/:unitId\/qc-correction\/modal[\s\S]*requireRole\(qcCorrectionRoles\)/);
  assert.match(routes, /\/tech\/units\/:unitId\/qc-correction'[\s\S]*submitQcCorrection/);
  assert.match(controller, /Number\(unit\.assignedToUserId\) === Number\(req\.currentUser/);
  assert.match(controller, /\['admin', 'management', 'tech_lead'\]/);
  assert.doesNotMatch(routes, /qcCorrectionRoles = \[[^\]]*'qc'/);
});

test('QC re-review is blocked until the current rejection has a correction submission', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/unitQcCheckModel.js');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(controller, /latestQcReview\.decisionCode === 'rejected' && !context\.latestQcCorrection/);
  assert.match(model, /BWT_QC_RECHECK_NOT_READY/);
  assert.match(table, /Awaiting correction/);
  assert.match(table, /canRecordCurrentQcReview/);
  assert.match(table, /Mark Corrected/);
});

test('QC queue splits pending correction from ready for recheck and preserves resolved corrections', () => {
  const queue = read('services/qcReviewQueue.js');
  const model = read('models/techUnitModel.js');
  const fragment = read('views/fragments/tech-units-qc-review-queue.ejs');

  assert.match(queue, /code: 'ready_recheck'/);
  assert.match(queue, /readyForRecheckUnits/);
  assert.match(queue, /qc_has_correction_submission/);
  assert.match(model, /const allowedTables = \[[\s\S]*'unit_qc_corrections'[\s\S]*\];/);
  assert.match(model, /unit_qc_corrections/);
  assert.match(model, /ready_for_recheck_units/);
  assert.match(model, /qc_correction_state\.latest_correction_id IS NULL/);
  assert.match(fragment, /Ready for Recheck/);
  assert.match(fragment, /Pending Correction/);
});

test('technician summary distinguishes pending fixes from Units waiting on QC', () => {
  const service = read('services/qcGradingService.js');
  const view = read('views/fragments/tech-units-qc-summary.ejs');

  assert.match(service, /readyForRecheckUnits/);
  assert.match(service, /hasCorrectionSubmission/);
  assert.match(view, /Ready for Recheck/);
  assert.match(view, /Still awaiting technician correction/);
});

test('QC status icon draws its circle and mark on one fixed SVG canvas', () => {
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const css = read('public/css/app.css');

  assert.match(icon, /width="22"/);
  assert.match(icon, /height="22"/);
  assert.match(icon, /<circle class="tech-qc-status-indicator__disc" cx="11" cy="11"/);
  assert.match(icon, /M7\.5 7\.5 14\.5 14\.5M14\.5 7\.5 7\.5 14\.5/);
  assert.match(details, /include\('tech-unit-qc-status-icon'/);
  assert.doesNotMatch(details, /tech-qc-status-indicator[^\n]*>[✓×]</);
  assert.match(css, /\.tech-qc-status-indicator \{[\s\S]*width: 22px;[\s\S]*height: 22px;[\s\S]*border: 0;/);
});

test('correction submission uses delegated modal transport and realtime targeted refresh', () => {
  const modal = read('views/fragments/tech-unit-qc-correction-modal.ejs');
  const script = read('public/js/tech-units.js');
  const controller = read('controllers/techController.js');

  assert.match(modal, /data-qc-correction-form/);
  assert.match(script, /\[data-qc-review-form\], \[data-qc-correction-form\]/);
  assert.match(controller, /publishUnitBrowserChange\(\{ unitId, changeType: 'qc-correction-submitted' \}\)/);
  assert.match(controller, /'qc-correction-submitted': true/);
});
