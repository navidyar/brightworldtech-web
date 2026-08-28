'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Unit Browser loads one compact QC performance summary above Search and Filters', () => {
  const page = read('views/pages/tech-units.ejs');
  const fragment = read('views/fragments/tech-units-qc-summary.ejs');

  assert.match(page, /id="tech-units-qc-summary-heading">QC Performance/);
  assert.match(page, /data-tech-qc-summary-refresh-url="<%= qcSummaryUrl %>"/);
  assert.match(page, /hx-get="<%= qcSummaryUrl %>"/);
  assert.ok(page.indexOf('tech-units-qc-summary-heading') < page.indexOf('tech-units-filters-heading'));
  assert.match(fragment, /class="tech-qc-summary-panel/);
  assert.match(fragment, />QC Grade</);
  assert.match(fragment, />Current Acceptance</);
  assert.match(fragment, />Correction Resolution</);
  assert.match(fragment, />Pending Corrections</);
  assert.match(fragment, /· All time/);
  assert.doesNotMatch(fragment, /tech-qc-summary-card/);
});

test('regular technicians are restricted to their own QC summary while authorized roles may select another technician', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /\['admin', 'management', 'tech_lead', 'qc'\]\.includes\(roleCode\)/);
  assert.match(controller, /if \(!canViewCrossTechnicianQcSummary\(req\)\) \{\s*return currentUserId;/);
  assert.match(controller, /normalizePositiveInteger\(req && req\.query \? req\.query\.techUserId : null\)/);
  assert.match(controller, /getTechnicianQcGradeSummary\(technicianUserId\)/);
  assert.match(controller, /getOverallQcGradeSummary\(\)/);

  const summaryUrlBuilder = controller.match(/function buildTechUnitsQcSummaryUrl[\s\S]*?\n}/)?.[0] || '';
  assert.match(summaryUrlBuilder, /techUserId/);
  assert.doesNotMatch(summaryUrlBuilder, /lotId|categoryId|gradeFilter|createdStartDate|createdEndDate|search/);
});

test('QC summary route is authenticated and available to every Unit Browser role', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(routes, /'\/tech\/units\/qc-summary'[\s\S]*requireAuth,[\s\S]*requireRole\(unitBrowserRoles\),[\s\S]*renderTechUnitsQcSummary/);
  assert.ok(routes.indexOf("'/tech/units/qc-summary'") < routes.indexOf("'/tech/units/:unitId/record'"));
  assert.match(controller, /async function renderTechUnitsQcSummary/);
  assert.match(controller, /QC grading summary could not be loaded/);
  assert.match(controller, /Unit browsing remains available/);
});

test('aggregate and technician summaries reuse the Stage 9D calculation contract', () => {
  const model = read('models/qcGradingModel.js');

  assert.match(model, /async function getQcGradingTechnician/);
  assert.match(model, /async function getOverallQcGradeSummary/);
  assert.match(model, /calculateQcGradeSummary\(rows\)/);
  assert.match(model, /calculateQcGradeSummariesByTechnician\(rows\)/);
  assert.match(model, /gradedTechnicians/);
  assert.match(model, /assertValidQcGradeSummary\(summary\)/);
});

test('QC summary refresh is targeted and participates in Unit update events without replacing the Unit table', () => {
  const script = read('public/js/tech-units.js');

  assert.match(script, /async function refreshQcSummary/);
  assert.match(script, /data-tech-qc-summary-version/);
  assert.match(script, /currentSummary\.replaceWith\(replacement\)/);
  assert.match(script, /refreshTechUnitBrowser\(\),[\s\S]*refreshTechUnitDetailPage\(\),[\s\S]*refreshQcSummary\(\)/);
  assert.match(script, /'qc-review-recorded'/);
  assert.doesNotMatch(script, /window\.location\.reload\(\)/);
});

test('QC summary uses a compact shared panel and responsive inline statistics', () => {
  const css = read('public/css/tech-units-clean.css');
  const page = read('views/pages/tech-units.ejs');
  const detail = read('views/pages/tech-unit-detail.ejs');

  assert.match(css, /\.tech-qc-summary-loading,[\s\S]*\.tech-qc-summary-panel \{[\s\S]*linear-gradient/);
  assert.match(css, /\.tech-qc-summary-panel \{[\s\S]*display: grid;/);
  assert.match(css, /\.tech-qc-summary-stats \{[\s\S]*grid-template-columns: repeat\(4/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.tech-qc-summary-stats \{[\s\S]*grid-template-columns: 1fr/);
  [page, detail].forEach((template) => {
    assert.match(template, /tech-units-clean\.css\?v=20260826-stage10w73e-browser-usability/);
    assert.match(template, /tech-units\.js\?v=20260826-stage10w73c-browser-refinement/);
  });
});
