'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const modal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
const appCss = read('public/css/app.css');
const techUnitsCss = read('public/css/tech-units-clean.css');
const techUnitsScript = read('public/js/tech-units.js');
const controller = read('controllers/techController.js');
const qcCheckModel = read('models/unitQcCheckModel.js');
const correctionModel = read('models/unitQcCorrectionModel.js');

test('Stage 9M details modal uses a compact status-first information hierarchy', () => {
  assert.match(modal, /tech-qc-modal-heading/);
  assert.match(modal, /tech-qc-status-banner/);
  assert.match(modal, /tech-qc-review-meta/);
  assert.match(modal, /tech-qc-note-panel/);
  assert.match(modal, /Correction Handoff/);
  assert.match(modal, /QC Progress/);
  assert.match(modal, /No notes were provided\./);
  assert.doesNotMatch(modal, /tech-qc-review-detail-status/);
});

test('Stage 9M modal keeps accessible text and a restrained read-only footer', () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-labelledby="tech-qc-review-details-title"/);
  assert.match(modal, /aria-describedby="tech-qc-review-details-description"/);
  assert.match(modal, /aria-label="Current Quality Control status"/);
  assert.match(modal, /class="tech-qc-modal-footer"/);
  assert.match(modal, /View Unit History/);
  assert.match(modal, /data-modal-close>Close/);
});

test('Stage 9M reads complete review and correction history for accurate status context', () => {
  assert.match(qcCheckModel, /async function listQcChecksForCompletion/);
  assert.match(qcCheckModel, /ORDER BY qc\.reviewed_at ASC, qc\.unit_qc_check_id ASC/);
  assert.match(correctionModel, /async function listCorrectionsForCompletion/);
  assert.match(correctionModel, /ORDER BY correction\.submitted_at ASC, correction\.unit_qc_correction_id ASC/);
  assert.match(controller, /unitQcCheckModel\.listQcChecksForCompletion/);
  assert.match(controller, /unitQcCorrectionModel\.listCorrectionsForCompletion/);
  assert.match(controller, /buildQcStatusPresentation/);
});

test('Stage 9M consolidates QC status colors and icon geometry into shared CSS', () => {
  assert.match(appCss, /--qc-accepted-ink:/);
  assert.match(appCss, /--qc-rejected-ink:/);
  assert.match(appCss, /--qc-ready-ink:/);
  assert.match(appCss, /\.tech-qc-status-indicator__mark/);
  assert.match(appCss, /\.tech-qc-status-modal__body/);
  assert.match(appCss, /border-radius: 11px/);
  assert.match(techUnitsCss, /Shared QC status geometry and colors are owned by app\.css/);
  assert.doesNotMatch(techUnitsCss, /\.tech-units-clean-page \.tech-qc-status-indicator__mark/);
});

test('Stage 9M workflow and notes remain compact and responsive', () => {
  assert.match(appCss, /\.tech-qc-workflow__steps/);
  assert.match(appCss, /\.tech-qc-review-meta \{/);
  assert.match(appCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(appCss, /@media \(max-width: 640px\)[\s\S]*\.tech-qc-workflow__steps[\s\S]*flex-direction: column/);
  assert.match(appCss, /\.tech-qc-note-panel__text[\s\S]*white-space: pre-wrap/);
});

test('Stage 9M View Unit History opens the existing record panel instead of duplicating history', () => {
  assert.match(techUnitsScript, /function openUnitHistoryFromQcModal\(trigger\)/);
  assert.match(techUnitsScript, /\[data-unit-panel-button\]\[data-panel="history"\]/);
  assert.match(techUnitsScript, /historyButton\.click\(\)/);
  assert.match(techUnitsScript, /data-qc-open-unit-history/);
  assert.match(techUnitsScript, /window\.location\.assign\(`\/tech\/units\/\$\{unitId\}`\)/);
});

test('Stage 9M cache-busts common and Unit Browser assets', () => {
  const head = read('views/partials/head.ejs');
  const techUnitsPage = read('views/pages/tech-units.ejs');
  const detailPage = read('views/pages/tech-unit-detail.ejs');

  assert.match(head, /app\.css\?v=20260731-stage10c-hardware-matrix/);
  [techUnitsPage, detailPage].forEach((markup) => {
    assert.match(markup, /tech-units-clean\.css\?v=20260730-stage10a-unit-export/);
    assert.match(markup, /tech-units\.js\?v=20260731-stage10b-column-selection/);
    assert.match(markup, /modal\.js\?v=20260729-stage9k-modal-accessibility/);
  });
});

test('Stage 9M adds a dedicated validator and no database migration', () => {
  const packageJson = JSON.parse(read('package.json'));
  const sqlFiles = fs.readdirSync(path.join(root, 'sql'));

  assert.equal(
    packageJson.scripts['validate:qc-visual'],
    'node --test services/qcStatusPresentation.test.js services/stage9mQcVisualRefinementIntegration.test.js services/stage9mQcStatusColumnIntegration.test.js services/stage9mQcHeaderSortIntegration.test.js'
  );
  assert.equal(sqlFiles.some((name) => /stage[-_]?9m/i.test(name)), false);
});
