'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Tech Lead receives QC Review portal and decision authority without QC Reporting authority', () => {
  const policy = require('../config/accessPolicy');

  assert.equal(policy.QC_PORTAL_ROLE_CODES.includes('tech_lead'), true);
  assert.equal(policy.QC_REVIEW_ROLE_CODES.includes('tech_lead'), true);
  assert.equal(policy.QC_REPORTING_ROLE_CODES.includes('tech_lead'), false);
  assert.equal(policy.canAccessMenuArea(['tech_lead'], 'qc'), true);
  assert.equal(policy.canAccessMenuArea(['tech_lead'], 'management'), false);
  assert.equal(policy.hasAnyAssignedRole(['tech_lead'], policy.QC_REPORTING_ROLE_CODES), false);
});

test('Tech Lead QC Review access uses the same guarded page and decision routes as Management+', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /'\/qc\/review',[\s\S]*?requirePermission\('qc\.portal\.view'\)[\s\S]*?renderQcPortalReviewPage/);
  assert.match(routes, /'\/qc\/review\/table',[\s\S]*?requirePermission\('qc\.portal\.view'\)[\s\S]*?renderQcPortalReviewTable/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review\/:decisionCode\/modal',[\s\S]*?requirePermission\('qc\.review\.perform'\)/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review',[\s\S]*?requirePermission\('qc\.review\.perform'\)/);
});

test('QC Reporting remains separately guarded as Admin-only', () => {
  const routes = read('routes/management.js');
  const policy = require('../config/accessPolicy');

  const reportingRoute = routes.match(/router\.get\(\s*'\/management\/qc-reporting'[\s\S]*?\n\);/)?.[0] || '';
  assert.match(reportingRoute, /requirePermission\('qc\.reporting\.view'\)/);
  assert.deepEqual([...policy.QC_REPORTING_ROLE_CODES], ['admin']);
});

test('Tech Lead sees QC Review navigation while QC Reporting is tied to the Admin menu area', () => {
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(sidebar, /if \(canViewQcPortal\)[\s\S]*?href="\/qc\/review"[\s\S]*?>QC Review</);
  assert.match(sidebar, /if \(canViewQcReporting\)[\s\S]*?href="\/management\/qc-reporting"[\s\S]*?>QC Reporting</);
});

test('QC Portal mode keeps production controls suppressed while allowing QC decisions', () => {
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(page, /const canCreateTechUnits = !isQcPortalMode/);
  assert.match(table, /const canRecordQcReview = hasPermission\('qc\.review\.perform'\)/);
  assert.match(table, /canShowQcReviewActions = Boolean\(\s*isQcPortalMode\s*&& canRecordQcReview/);
  assert.match(table, /const canEditTechUnits = !isQcPortalMode/);
  assert.match(table, /const canCompleteTechUnits = !isQcPortalMode/);
});
