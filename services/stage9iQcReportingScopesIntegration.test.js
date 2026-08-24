'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9I applies reporting scope before building Management QC totals', () => {
  const controller = read('controllers/qcReportingController.js');

  assert.match(controller, /listManagementQcReportingTechnicianOptions/);
  assert.match(controller, /buildQcReportingScope\(req\.query, technicianOptions\)/);
  assert.match(controller, /listManagementQcReportingRows\(scope\.queryFilters\)/);
  assert.match(controller, /QcReportingScopeError/);
  assert.match(controller, /status: 400/);
});

test('Stage 9I filters by completion date with an exclusive next-day boundary', () => {
  const model = read('models/qcReportingModel.js');
  const scope = read('services/qcReportingScope.js');

  assert.match(model, /completion\.completed_at >= \?/);
  assert.match(model, /completion\.completed_at < \?/);
  assert.doesNotMatch(model, /qc\.reviewed_at\s*[<>]=?\s*\?/);
  assert.match(scope, /getDayRangeUtc/);
  assert.match(scope, /endRange\.endAt/);
  assert.match(scope, /APP_DISPLAY_TIME_ZONE/);
});

test('Stage 9I technician-team filtering uses the shared QC attribution expression', () => {
  const model = read('models/qcReportingModel.js');

  assert.match(model, /buildManagementQcReportingFilters\([\s\S]*technicianAttribution\.expression/);
  assert.match(model, /technicianExpression} IN/);
  assert.match(model, /buildManagementQcReportingTechnicianOptionsQuery/);
  assert.match(model, /SELECT DISTINCT[\s\S]*technician_user_id/);
  assert.match(model, /getQcTechnicianAttributionCapabilities/);
});

test('Stage 9I adds compact date and ad hoc team controls without creating a card-list report', () => {
  const page = read('views/pages/management-qc-reporting.ejs');

  assert.match(page, /data-reporting-controls/);
  assert.match(page, /name="period"/);
  assert.match(page, /name="startDate"/);
  assert.match(page, /name="endDate"/);
  assert.match(page, /name="technicianId"/);
  assert.match(page, />Reporting Team</);
  assert.match(page, />Apply Scope</);
  assert.match(page, /Completion-date scope/);
  assert.doesNotMatch(page, /qc-reporting-card/);
});

test('Stage 9I reuses reporting-period behavior and cache-busts changed assets', () => {
  const controls = read('public/js/management-reporting-controls.js');
  const head = read('views/partials/head.ejs');
  const validator = read('services/sharedCssFoundationValidator.js');

  assert.match(controls, /all_time:/);
  assert.match(head, /management-reporting-controls\.js\?v=20260729-stage9i-qc-reporting-clarity/);
  assert.match(head, /app\.css\?v=20260819-stage10w68w-half-size-lot-chevrons/);
  assert.match(validator, /SHARED_APP_PATH = '\/css\/app\.css'/);
});

test('Stage 9I shared CSS keeps filters compact and responsive', () => {
  const css = read('public/css/app.css');

  assert.match(css, /Stage 9I: Quality Control reporting date and technician-team scopes/);
  assert.match(css, /\.qc-reporting-scope-form \{[\s\S]*grid-template-columns/);
  assert.match(css, /\.qc-reporting-team-options \{[\s\S]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.qc-reporting-scope-form/);
});

test('Stage 9I validation commands include scope calculations and integration coverage', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['validate:qc-reporting-scopes'],
    'node --test services/qcReportingScope.test.js services/stage9iQcReportingScopesIntegration.test.js services/stage9iQcReportingFormAlignmentIntegration.test.js'
  );
  assert.match(packageJson.scripts['validate:qc-reporting'], /qcReportingScope\.test\.js/);
  assert.match(packageJson.scripts['validate:qc-reporting'], /stage9iQcReportingScopesIntegration\.test\.js/);
  assert.match(packageJson.scripts['validate:qc-reporting'], /stage9iQcReportingFormAlignmentIntegration\.test\.js/);
});
