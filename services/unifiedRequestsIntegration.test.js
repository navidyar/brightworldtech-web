'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('the unified Requests page merges Unit Request and existing Unit override summaries', () => {
  const controller = read('controllers/unitRequestController.js');
  assert.match(controller, /unitRequestModel\.listUnitRequestSummaries/);
  assert.match(controller, /overrideRequestModel\.listOverrideRequestSummaries/);
  assert.match(controller, /combineRequestResults/);
});

test('regular users are scoped to their own requests across both stores', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/overrideRequestModel.js');
  assert.match(controller, /requestedByUserId: requesterUserId/);
  assert.match(model, /r\.requested_by_user_id = \?/);
});

test('the old Overrides routes and navigation are removed without redirects', () => {
  const routes = read('routes/management.js');
  const sidebar = read('views/partials/sidebar.ejs');
  assert.doesNotMatch(routes, /\/management\/overrides/);
  assert.doesNotMatch(sidebar, /management-overrides|\/management\/overrides/);
  assert.match(sidebar, />Requests</);
});

test('the shared queue exposes existing Unit overrides and outcome confirmations', () => {
  const page = read('views/pages/unit-requests.ejs');
  assert.match(page, /value="existing_unit_override"/);
  assert.match(page, /value="outcome_confirmation"/);
  assert.match(page, /request\.detailUrl/);
  assert.match(page, /request\.withdrawUrl/);
});

test('Tech Lead and higher roles review overrides from the unified detail page', () => {
  const routes = read('routes/management.js');
  const detail = read('views/pages/override-request-detail.ejs');
  assert.match(routes, /\/unit-requests\/override\/:overrideRequestId\/approve/);
  assert.match(routes, /\/unit-requests\/override\/:overrideRequestId\/reject/);
  assert.match(detail, /Approve Confirmation/);
  assert.match(detail, /Reject Confirmation/);
  assert.match(detail, /Approve Request/);
  assert.match(detail, /Reject Request/);
});

test('requesters can withdraw their own pending override from the unified page', () => {
  const model = read('models/overrideRequestModel.js');
  const controller = read('controllers/unitRequestController.js');
  const detail = read('views/pages/override-request-detail.ejs');
  assert.match(model, /async function withdrawOverrideRequest/);
  assert.match(model, /request_status = 'cancelled'/);
  assert.match(controller, /requestedByUserId: req\.currentUser\.user_id/);
  assert.match(detail, /Withdraw Pending Request/);
});

test('requesters cannot approve or reject their own override requests', () => {
  const model = read('models/overrideRequestModel.js');
  const selfReviewChecks = (model.match(/BWT_OVERRIDE_SELF_REVIEW/g) || []).length;
  assert.ok(selfReviewChecks >= 2);
});


test('own pending Unit Requests stay non-reviewable except the authorized Processor Catalog self-review case', () => {
  const controller = read('controllers/unitRequestController.js');
  assert.match(controller, /const isOwnRequest = Number\(request\.requestedByUserId\) === Number\(req\.currentUser\.user_id\)/);
  assert.match(controller, /const canSelfReviewProcessorRequest = catalogManager[\s\S]*request\.requestType === unitRequestModel\.PROCESSOR_CATALOG_REQUEST_TYPE/);
  assert.match(controller, /\(!isOwnRequest \|\| canSelfReviewProcessorRequest\)/);
  assert.match(controller, /canWithdrawRequest: request\.isPending && Number\(request\.requestedByUserId\) === Number\(req\.currentUser\.user_id\)/);
});

test('dashboard and Unit workflow links point to the unified Requests queue', () => {
  const dashboard = read('views/fragments/dashboard-foundation.ejs');
  const roleDashboard = read('views/pages/role-dashboard.ejs');
  const modal = read('views/fragments/tech-override-request-modal.ejs');
  assert.doesNotMatch(`${dashboard}\n${roleDashboard}\n${modal}`, /\/management\/overrides/);
  assert.match(dashboard, /\/unit-requests\?status=pending/);
  assert.match(modal, /View Request/);
});

test('review decision forms stay side by side with slim neutral controls', () => {
  const css = read('public/css/unit-requests.css');
  const detail = read('views/pages/override-request-detail.ejs');
  assert.match(css, /\.unit-request-review-actions \{[\s\S]*grid-template-columns: minmax\(0, 1\.15fr\) minmax\(210px, 0\.85fr\)/);
  assert.match(css, /\.unit-request-review-actions form \+ form \{[\s\S]*border-left: 1px solid var\(--line-soft\)/);
  assert.doesNotMatch(css, /\.unit-request-review-actions form:first-child/);
  assert.doesNotMatch(css, /border-left-color: #7ea98a/);
  assert.match(css, /input\[type="checkbox"\] \{[\s\S]*width: 16px/);
  assert.match(detail, /<label class="unit-request-inline-check">[\s\S]*Give prior technician credit/);
});
