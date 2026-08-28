'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC Portal access policy includes Admin, Management, Tech Lead, and QC while reporting remains Management+', () => {
  const policy = require('../config/accessPolicy');

  assert.deepEqual([...policy.QC_PORTAL_ROLE_CODES], ['admin', 'management', 'tech_lead', 'qc']);
  assert.deepEqual([...policy.QC_REVIEW_ROLE_CODES], ['admin', 'management', 'tech_lead', 'qc']);
  assert.deepEqual([...policy.QC_REPORTING_ROLE_CODES], ['admin', 'management']);
  assert.equal(policy.canAccessMenuArea(['admin'], 'qc'), true);
  assert.equal(policy.canAccessMenuArea(['management'], 'qc'), true);
  assert.equal(policy.canAccessMenuArea(['qc'], 'qc'), true);
  assert.equal(policy.canAccessMenuArea(['tech_lead'], 'qc'), true);
  assert.equal(policy.canAccessMenuArea(['tech'], 'qc'), false);
});

test('QC Review routes reuse the Unit Browser and authorize formal QC decisions for Admin, Management, Tech Lead, and QC', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /'\/qc\/review',[\s\S]*?requireRole\(QC_PORTAL_ROLE_CODES\)[\s\S]*?renderQcPortalReviewPage/);
  assert.match(routes, /'\/qc\/review\/table',[\s\S]*?requireRole\(QC_PORTAL_ROLE_CODES\)[\s\S]*?renderQcPortalReviewTable/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review\/:decisionCode\/modal',[\s\S]*?requireRole\(QC_REVIEW_ROLE_CODES\)/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review',[\s\S]*?requireRole\(QC_REVIEW_ROLE_CODES\)/);
  assert.match(routes, /'\/management\/qc-reporting',[\s\S]*?requireRole\(QC_REPORTING_ROLE_CODES\)/);
});

test('QC Portal navigation owns QC Review and QC Reporting without granting reporting to QC users', () => {
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(sidebar, />QC Portal</);
  assert.match(sidebar, /href="\/qc\/review"[\s\S]*?>QC Review</);
  assert.match(sidebar, /canAccessMenuArea\('management'\)[\s\S]*?href="\/management\/qc-reporting"[\s\S]*?>QC Reporting</);
  assert.match(sidebar, /canAccessMenuArea\('tech'\) && !isQcOnlyNavigationUser/);

  const managementSection = sidebar.match(/if \(canAccessMenuArea\('management'\)\)[\s\S]*?if \(canAccessMenuArea\('qc'\)\)/)?.[0] || '';
  assert.doesNotMatch(managementSection, />QC Reporting</);
});

test('QC Portal forces the same active-only Unit Browser scope used by QC and keeps its own URLs during refresh/filter navigation', () => {
  const controller = read('controllers/techController.js');
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  const queue = read('views/fragments/tech-units-qc-review-queue.ejs');

  assert.match(controller, /function getQcPortalFiltersFromRequest[\s\S]*?unitState: 'active'[\s\S]*?restrictToCurrentAssignment: false[\s\S]*?canViewParkedUnits: false[\s\S]*?canSearchParkedUnits: false[\s\S]*?allowAnyLotFilter: false/);
  assert.match(controller, /renderQcPortalReviewPage[\s\S]*?unitBrowserBasePath: '\/qc\/review'[\s\S]*?qcPortalMode: true/);
  assert.match(controller, /renderQcPortalReviewTable[\s\S]*?unitBrowserBasePath: '\/qc\/review'[\s\S]*?qcPortalMode: true/);
  assert.match(page, /action="<%= browserBasePath %>"/);
  assert.match(page, /href="<%= browserBasePath %>">Clear/);
  assert.match(table, /basePath: browserBasePath/);
  assert.match(queue, /return queryString \? `\$\{browserBasePath\}\?\$\{queryString\}` : browserBasePath/);
});

test('QC Portal gives Admin, Management, and Tech Lead QC actions while suppressing their unrelated production controls in that mode', () => {
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(page, /const canCreateTechUnits = !isQcPortalMode/);
  assert.match(page, /const canViewParkedUnits = !isQcPortalMode/);
  assert.match(table, /const canRecordQcReview = isQcPortalMode \|\| currentUserRoles\.includes\('qc'\)/);
  assert.match(table, /const canEditTechUnits = !isQcPortalMode/);
  assert.match(table, /const canCompleteTechUnits = !isQcPortalMode/);
  assert.match(table, /const canManageUnitLifecycle = !isQcPortalMode/);
  assert.match(table, /const canSubmitAnyQcCorrection = !isQcPortalMode/);
  assert.match(table, /const canViewTechWeightDetails = !isQcPortalMode/);
  assert.match(table, /const canViewCurrentLotWeight = !isQcPortalMode/);
});

test('QC Portal History keeps the real reviewer audit actor while using the QC-style redacted weight view', () => {
  const controller = read('controllers/techController.js');
  const table = read('views/fragments/tech-units-table.ejs');
  const qcModel = read('models/unitQcCheckModel.js');

  assert.match(table, /\/history<%= isQcPortalMode \? '\?qcPortal=1' : '' %>/);
  assert.match(controller, /qcPortalHistoryView[\s\S]*?userCanViewProductionWeight\(req\) && !qcPortalHistoryView[\s\S]*?redactProductionWeightFromTimeline/);
  assert.match(qcModel, /reviewedByUserId: req\.currentUser\.user_id|reviewedByUserId/);
  assert.match(qcModel, /actorUserId: safeReviewerId/);
  assert.match(qcModel, /eventSource: 'quality_control'/);
});
