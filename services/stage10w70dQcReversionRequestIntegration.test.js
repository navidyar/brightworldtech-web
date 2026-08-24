'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const accessPolicy = require('../config/accessPolicy');
const unifiedRequestQueue = require('./unifiedRequestQueue');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 10W70D gives QC request-history access without granting review authority', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/unitRequestController.js');
  const sidebar = read('views/partials/sidebar.ejs');

  assert.equal(accessPolicy.canAccessUnitRequests(['qc']), true);
  assert.match(routes, /const unitRequestRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /'\/unit-requests',[\s\S]*requireRole\(unitRequestRoles\)/);
  assert.match(routes, /'\/unit-requests\/:unitRequestId',[\s\S]*requireRole\(unitRequestRoles\)/);
  assert.match(routes, /'\/unit-requests\/:unitRequestId\/approve',[\s\S]*requireRole\(overrideReviewRoles\)/);
  assert.match(controller, /const REVIEW_ROLE_CODES = new Set\(\['admin', 'management', 'tech_lead'\]\)/);
  assert.match(controller, /const requesterUserId = reviewer \? null : req\.currentUser\.user_id/);
  assert.match(sidebar, /isQcOnlyNavigationUser[\s\S]*href="\/unit-requests"/);
});

test('Stage 10W70D separates QC request authority from Tech Lead+ direct reversion authority', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const history = read('views/fragments/tech-unit-history-panel.ejs');

  assert.match(routes, /qc-review\/:qcCheckId\/reversion-request\/modal'[\s\S]*requireRole\(\['qc'\]\)/);
  assert.match(routes, /qc-review\/:qcCheckId\/reversion-request'[\s\S]*requireRole\(\['qc'\]\)/);
  assert.match(routes, /qc-review\/:qcCheckId\/revert\/modal'[\s\S]*requireRole\(overrideReviewRoles\)/);
  assert.match(controller, /Number\(context\.latestQcReview\.reviewedByUserId\) === currentUserId/);
  assert.match(controller, /canRequestQcReversion = isQcRequester && ownsLatestQcReview && !pendingQcReversionRequest/);
  assert.match(details, /Request Reversion/);
  assert.match(details, /reversion-request\/modal/);
  assert.match(details, /Reversion Request #<%= pendingQcReversionRequest\.unitRequestId %> Pending/);
  assert.match(details, /Revert Current QC Decision/);
  assert.doesNotMatch(history, /reversion-request\/modal|Request Reversion/);
});

test('Stage 10W70D snapshots the exact QC target and keeps the QC decision active while pending', () => {
  const model = read('models/unitRequestModel.js');
  const modal = read('views/fragments/tech-unit-qc-reversion-request-modal.ejs');

  assert.match(model, /lockQcReviewReversionTargetWithConnection/);
  assert.match(model, /Number\(state\.reviewed_by_user_id\) !== safeRequesterUserId/);
  assert.match(model, /INSERT INTO unit_qc_reversion_requests/);
  assert.match(model, /SELECT[\s\S]*qc\.unit_id,[\s\S]*qc\.unit_work_completion_id,[\s\S]*qc\.unit_qc_check_id,[\s\S]*qc\.decision_code,[\s\S]*qc\.reviewed_by_user_id,[\s\S]*qc\.reviewed_at,[\s\S]*qc\.review_notes[\s\S]*FROM unit_qc_checks qc/);
  assert.doesNotMatch(model, /state\.reviewed_at,[\s\S]*state\.review_notes/);
  assert.doesNotMatch(model, /createQcReversionRequest[\s\S]{0,2600}reverted_at = CURRENT_TIMESTAMP/);
  assert.match(modal, /remains current while this request is pending/);
  assert.match(modal, /this reason becomes the permanent QC reversion reason/);
});

test('Stage 10W70D approval revalidates the exact target and preserves separate QC requester and Tech Lead+ reviewer notes', () => {
  const model = read('models/unitRequestModel.js');
  const controller = read('controllers/unitRequestController.js');
  const detail = read('views/pages/unit-request-detail.ejs');

  assert.match(model, /async function approveQcReversionRequest/);
  assert.match(model, /lockQcReviewReversionTargetWithConnection[\s\S]*FOR UPDATE/);
  assert.match(model, /sameQcReversionRequestTarget/);
  assert.match(model, /snapshot_matches_qc/);
  assert.match(model, /BWT_QC_REVERSION_REQUEST_SNAPSHOT_MISMATCH/);
  assert.match(model, /qrr\.qc_reviewed_at = qc\.reviewed_at/);
  assert.match(model, /qrr\.qc_review_notes <=> qc\.review_notes/);
  assert.match(model, /reversionReason: request\.requester_note/);
  assert.match(model, /reviewer_note = \?/);
  assert.match(model, /unitRequestId: safeRequestId/);
  assert.match(controller, /request\.requestType === unitRequestModel\.QC_REVERSION_REQUEST_TYPE/);
  assert.match(controller, /publishUnitBrowserChange\(\{ unitId: result\.unitId, changeType: 'qc-reverted' \}\)/);
  assert.match(detail, /Approve Reversion/);
  assert.match(detail, /Reviewer Note <small>\(optional\)<\/small>/);
  assert.match(detail, /QC requester reason becomes the permanent reversion reason/);
});

test('Stage 10W70D rejects stale targets and prevents direct reversion from bypassing a pending QC request', () => {
  const requestModel = read('models/unitRequestModel.js');
  const controller = read('controllers/techController.js');

  assert.match(requestModel, /BWT_QC_REVERSION_REQUEST_STALE/);
  assert.match(requestModel, /async function revertQcReviewDirectlyWithRequestGuard/);
  assert.match(requestModel, /QC Reversion Request #[^\n]*is pending for this decision/);
  assert.match(requestModel, /BWT_QC_REVERSION_PENDING_REQUEST/);
  assert.match(controller, /Review that request through Requests instead of using direct reversion/);
  assert.match(controller, /revertQcReviewDirectlyWithRequestGuard/);
});


test('Stage 10W70D2 records rejected QC reversion requests in Unit History without changing QC state', () => {
  const model = read('models/unitRequestModel.js');
  const preflight = read('scripts/preflight-stage-10w70d2-qc-reversion-rejection-history.sh');
  const repair = read('scripts/repair-stage-10w70d2-qc-reversion-rejection-history.sh');

  assert.match(model, /unit_qc_reversion_request_rejected/);
  assert.match(model, /Rejected QC decision reversion request/);
  assert.match(model, /Quality Control Decision Retained/);
  assert.match(model, /Reversion Request Reason/);
  assert.match(model, /Rejection Note/);
  assert.match(model, /unitAuditEventModel\.insertEventWithConnection/);
  assert.doesNotMatch(model, /unit_qc_reversion_request_rejected[\s\S]{0,2200}revertQcReviewWithConnection/);
  assert.match(preflight, /No changes were made/);
  assert.match(preflight, /unit_qc_reversion_request_rejected/);
  assert.match(repair, /INSERT INTO unit_audit_events/);
  assert.match(repair, /INSERT INTO unit_audit_event_changes/);
  assert.match(repair, /ur\.status='rejected'/);
  assert.doesNotMatch(repair, /UPDATE unit_qc_checks|SET status='rejected'/);
});

test('Stage 10W70D unified Requests exposes QC reversion as a first-class request type', () => {
  const queuePage = read('views/pages/unit-requests.ejs');
  const detail = read('views/pages/unit-request-detail.ejs');
  const requestModel = read('models/unitRequestModel.js');

  assert.equal(unifiedRequestQueue.normalizeRequestType('qc_reversion'), 'qc_reversion');
  assert.match(queuePage, /value="qc_reversion"/);
  assert.match(queuePage, /QC Decision Reversion/);
  assert.match(detail, /Exact QC Check/);
  assert.match(detail, /Reject Reversion/);
  assert.match(requestModel, /if \(requestType === QC_REVERSION_REQUEST_TYPE\) return 'QC Decision Reversion'/);
});

test('Stage 10W70D migration is additive and rollback refuses to discard QC request audit data', () => {
  const migration = read('sql/2026-08-stage-10w70d-qc-reversion-requests.sql');
  const rollback = read('sql/2026-08-stage-10w70d-qc-reversion-requests-rollback.sql');
  const preflight = read('scripts/preflight-stage-10w70d-qc-reversion-requests.sh');

  assert.match(migration, /CREATE TABLE unit_qc_reversion_requests/);
  assert.match(migration, /COLUMN_TYPE INTO request_type/);
  assert.match(migration, /COLUMN_TYPE INTO unit_type/);
  assert.match(migration, /COLUMN_TYPE INTO completion_type/);
  assert.match(migration, /COLUMN_TYPE INTO qc_type/);
  assert.match(migration, /populated incompatible unit_qc_reversion_requests table; refusing destructive replacement/);
  assert.match(migration, /FOREIGN KEY \(unit_qc_check_id\) REFERENCES unit_qc_checks/);
  assert.match(rollback, /rollback refused: QC reversion request audit data exists/i);
  assert.match(preflight, /No database changes were made/);
});

test('Stage 10W70D does not change Model or Processor catalog authority', () => {
  const controller = read('controllers/unitRequestController.js');
  assert.match(controller, /const CATALOG_MANAGER_ROLE_CODES = new Set\(\['admin', 'management'\]\)/);
  assert.match(controller, /canSelfReviewProcessorRequest/);
});
