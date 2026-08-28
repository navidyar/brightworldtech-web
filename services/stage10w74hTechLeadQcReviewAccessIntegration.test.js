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

  assert.match(routes, /'\/qc\/review',[\s\S]*?requireRole\(QC_PORTAL_ROLE_CODES\)[\s\S]*?renderQcPortalReviewPage/);
  assert.match(routes, /'\/qc\/review\/table',[\s\S]*?requireRole\(QC_PORTAL_ROLE_CODES\)[\s\S]*?renderQcPortalReviewTable/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review\/:decisionCode\/modal',[\s\S]*?requireRole\(QC_REVIEW_ROLE_CODES\)/);
  assert.match(routes, /'\/tech\/units\/:unitId\/qc-review',[\s\S]*?requireRole\(QC_REVIEW_ROLE_CODES\)/);
});

test('QC Reporting remains separately guarded as Management+ only', () => {
  const routes = read('routes/management.js');
  const policy = require('../config/accessPolicy');

  const reportingRoute = routes.match(/router\.get\(\s*'\/management\/qc-reporting'[\s\S]*?\n\);/)?.[0] || '';
  assert.match(reportingRoute, /requireRole\(QC_REPORTING_ROLE_CODES\)/);
  assert.deepEqual([...policy.QC_REPORTING_ROLE_CODES], ['admin', 'management']);
});

test('Tech Lead sees QC Review navigation but QC Reporting remains tied to the Management menu area', () => {
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(sidebar, /if \(canAccessMenuArea\('qc'\)\)[\s\S]*?href="\/qc\/review"[\s\S]*?>QC Review</);
  assert.match(sidebar, /if \(canAccessMenuArea\('management'\)\)[\s\S]*?href="\/management\/qc-reporting"[\s\S]*?>QC Reporting</);
});

test('QC Portal mode keeps production controls suppressed while allowing QC decisions', () => {
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(page, /const canCreateTechUnits = !isQcPortalMode/);
  assert.match(table, /const canRecordQcReview = isQcPortalMode \|\| currentUserRoles\.includes\('qc'\)/);
  assert.match(table, /const canEditTechUnits = !isQcPortalMode/);
  assert.match(table, /const canCompleteTechUnits = !isQcPortalMode/);
  assert.match(table, /const canViewTechWeightDetails = !isQcPortalMode/);
});
