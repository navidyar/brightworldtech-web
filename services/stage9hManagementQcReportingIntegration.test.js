'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9H exposes Management QC Reporting only through Admin and Management access', () => {
  const routes = read('routes/management.js');
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(routes, /qcReportingController/);
  const routeBlock = routes.match(/router\.get\(\s*'\/management\/qc-reporting'[\s\S]*?\n\);/)?.[0] || '';
  assert.match(routeBlock, /requireAuth/);
  assert.match(routeBlock, /requireRole\(QC_REPORTING_ROLE_CODES\)/);
  assert.match(routeBlock, /renderManagementQcReportingPage/);
  assert.match(sidebar, /management-qc-reporting/);
  assert.match(sidebar, />QC Reporting</);
  assert.doesNotMatch(routeBlock, /unitBrowserRoles/);

  const policy = require('../config/accessPolicy');
  assert.deepEqual([...policy.QC_REPORTING_ROLE_CODES], ['admin', 'management']);
  assert.equal(policy.hasAnyAssignedRole(['tech_lead'], policy.QC_REPORTING_ROLE_CODES), false);
  assert.equal(policy.canAccessMenuArea(['tech_lead'], 'management'), false);
});

test('Stage 9H reporting query excludes reversed completions and preserves reviewer and correction context', () => {
  const model = read('models/qcReportingModel.js');

  assert.match(model, /completion\.credit_source = 'manual_completion'/);
  assert.match(model, /completion\.reversed_at IS NULL/);
  assert.match(model, /reviewed_by_user_id AS reviewer_user_id/);
  assert.match(model, /review_notes/);
  assert.match(model, /unit_qc_corrections correction/);
  assert.match(model, /BWT_QC_REPORTING_SCHEMA_REQUIRED/);
});

test('Stage 9H provides one compact summary and shared table-based reporting rather than a card list', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(page, /class="site-summary-panel"/);
  assert.match(page, /class="content-shell site-work-page"/);
  assert.match(page, />Technician Comparison</);
  assert.doesNotMatch(page, />Rejection Patterns</);
  assert.match(page, />Reviewer Activity</);
  assert.match(page, /class="table-card"/);
  assert.match(page, /class="table-numeric"/);
  assert.match(page, /class="table-value-inline"/);
  assert.doesNotMatch(page, /class="table-value-stack"/);
  assert.doesNotMatch(page, /qc-reporting-card|qc-reporting-table|qc-reporting-summary-panel/);
  assert.match(page, /name="startDate"/);
  assert.match(page, /name="technicianId"/);
});

test('Stage 9H retains first-pass quality, current acceptance, correction status, and reviewer action distinctions', () => {
  const service = read('services/qcReportingService.js');
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(service, /calculateQcGradeSummariesByTechnician/);
  assert.match(service, /firstPassReviews/);
  assert.match(service, /rechecks/);
  assert.match(service, /pendingCorrectionUnits/);
  assert.match(service, /readyForRecheckUnits/);
  assert.match(page, />First-Pass Accepted</);
  assert.match(page, />Currently Accepted</);
  assert.match(page, /technician\.firstPassAcceptedUnits/);
  assert.match(page, /technician\.currentlyAcceptedUnits/);
  assert.match(page, /technician\.qualityGrade/);
  assert.match(page, /technician\.currentAcceptanceRate/);
  assert.match(page, /first-pass accepted; QC Grade/);
  assert.match(page, /currently accepted; Current Acceptance/);
  assert.match(page, /table-value-inline-separator/);
  assert.match(page, />Pending Correction</);
  assert.match(page, />Ready for Recheck</);
});

test('Stage 9H gracefully renders migration guidance instead of a generic 500 when QC storage is unavailable', () => {
  const controller = read('controllers/qcReportingController.js');
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(controller, /BWT_QC_REPORTING_SCHEMA_REQUIRED/);
  assert.match(controller, /reportAvailable: false/);
  assert.match(controller, /createEmptyManagementQcReport/);
  assert.match(page, /QC reporting is unavailable/);
});

test('Stage 9H reporting presentation uses shared page, table, and section CSS', () => {
  const css = read('public/css/app.css');

  assert.match(css, /Shared work-page, section-copy, and reporting-table utilities/);
  assert.match(css, /\.site-work-page \{[\s\S]*display: grid/);
  assert.match(css, /\.table-numeric \{[\s\S]*font-variant-numeric: tabular-nums/);
  assert.match(css, /\.table-value-inline \{[\s\S]*display: inline-flex[\s\S]*align-items: baseline[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(css, /\.table-value-stack/);
  assert.match(css, /\.table-wrap-cell > span \{[\s\S]*-webkit-line-clamp: 3/);
  assert.doesNotMatch(css, /\.qc-reporting-page|\.qc-reporting-table|\.qc-reporting-section-heading/);
});

test('Stage 9H validation command remains registered as reporting coverage expands', () => {
  const packageJson = JSON.parse(read('package.json'));
  const command = packageJson.scripts['validate:qc-reporting'];

  assert.match(command, /qcReportingService\.test\.js/);
  assert.match(command, /stage9hManagementQcReportingIntegration\.test\.js/);
  assert.match(command, /stage9hQcTechnicianAttributionConsistency\.test\.js/);
});
