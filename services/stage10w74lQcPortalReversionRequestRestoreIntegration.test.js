'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC Review status links preserve QC Portal context into the decision-details modal', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  const matches = table.match(/qc-review\/details\/modal<%= isQcPortalMode \? '\?qcPortal=1' : '' %>/g) || [];
  assert.equal(matches.length, 2);
});

test('QC users acting inside QC Review can request reversion of any current decision', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /function isQcPortalRequestContext\(req\)[\s\S]*?query\.qcPortal[\s\S]*?=== '1'/);
  assert.match(controller, /function canRequestQcReviewReversion\(req\)[\s\S]*?if \(!roleCodes\.includes\('qc'\)\) return false;[\s\S]*?if \(isQcPortalRequestContext\(req\)\) return true;/);
  assert.doesNotMatch(controller, /ownsLatestQcReview|reviewedByUserId\) === currentUserId/);
  assert.match(controller, /canRequestQcReversion = Boolean\(context\.latestQcReview\)[\s\S]*?isQcRequester[\s\S]*?!pendingQcReversionRequest/);
  assert.match(controller, /getPendingQcReversionRequestForQcCheck\(\{ qcCheckId \}\)/);
});

test('QC Portal requester mode does not also expose Tech Lead+ direct reversion for the same interaction', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /const canDirectlyRevertQc = Boolean\(context\.latestQcReview\)[\s\S]*?&& !isQcRequester[\s\S]*?\['admin', 'management', 'tech_lead'\]/);
});

test('QC Portal context is preserved through the Request Reversion modal POST', () => {
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const requestModal = read('views/fragments/tech-unit-qc-reversion-request-modal.ejs');
  const controller = read('controllers/techController.js');

  assert.match(details, /reversion-request\/modal<%= qcPortalMode \? '\?qcPortal=1' : '' %>/);
  assert.match(requestModal, /reversion-request<%= qcPortalMode \? '\?qcPortal=1' : '' %>/);
  assert.match(controller, /qcPortalMode: isQcPortalRequestContext\(req\)/);
});

test('QC reversion request endpoints remain QC-only and the action stays in QC status details', () => {
  const routes = read('routes/management.js');
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const history = read('views/fragments/tech-unit-history-panel.ejs');

  assert.match(routes, /qc-review\/:qcCheckId\/reversion-request\/modal'[\s\S]*?requireRole\(\['qc'\]\)/);
  assert.match(routes, /qc-review\/:qcCheckId\/reversion-request'[\s\S]*?requireRole\(\['qc'\]\)/);
  assert.match(details, /Request Reversion/);
  assert.doesNotMatch(history, /Request Reversion|reversion-request\/modal/);
});
