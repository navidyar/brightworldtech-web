'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const qcReviewModal = read('views/fragments/tech-unit-qc-review-modal.ejs');
const qcDetailsModal = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
const qcCorrectionModal = read('views/fragments/tech-unit-qc-correction-modal.ejs');
const modalScript = read('public/js/modal.js');
const techUnitsScript = read('public/js/tech-units.js');
const appCss = read('public/css/app.css');
const techUnitsCss = read('public/css/tech-units-clean.css');

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

test('Stage 9K shared modal manager traps focus and restores the opening control', () => {
  assert.match(modalScript, /const focusableSelector =/);
  assert.match(modalScript, /function trapModalFocus\(event\)/);
  assert.match(modalScript, /event\.key !== 'Tab'/);
  assert.match(modalScript, /lastElement\.focus\(\{ preventScroll: true \}\)/);
  assert.match(modalScript, /firstElement\.focus\(\{ preventScroll: true \}\)/);
  assert.match(modalScript, /function rememberModalOpener\(element\)/);
  assert.match(modalScript, /function restoreModalFocus\(\)/);
  assert.match(modalScript, /findReplacementOpener/);
  assert.match(modalScript, /\[data-modal-initial-focus\], \[autofocus\]/);
});

test('Stage 9K QC decision modal has a described dialog, explicit notes help, and announced errors', () => {
  assert.match(qcReviewModal, /aria-describedby="tech-qc-review-description"/);
  assert.match(qcReviewModal, /tabindex="-1"/);
  assert.match(qcReviewModal, /role="alert" aria-live="assertive"/);
  assert.match(qcReviewModal, /for="<%= notesInputId %>"/);
  assert.match(qcReviewModal, /aria-describedby="<%= notesHintId %>"/);
  assert.match(qcReviewModal, /aria-required="<%= isReject \? 'true' : 'false' %>"/);
  assert.match(qcReviewModal, /data-modal-initial-focus/);
  assert.match(qcReviewModal, /data-qc-submit-status aria-live="polite"/);
});

test('Stage 9K correction and details modals preserve the same keyboard and description contract', () => {
  [qcCorrectionModal, qcDetailsModal].forEach((markup) => {
    assert.match(markup, /aria-describedby=/);
    assert.match(markup, /tabindex="-1"/);
    assert.match(markup, /data-modal-initial-focus/);
    assert.match(markup, /modal-close-button/);
    assert.match(markup, /<svg viewBox="0 0 20 20"/);
  });

  assert.match(qcCorrectionModal, /for="<%= correctionInputId %>"/);
  assert.match(qcCorrectionModal, /data-qc-submit-status aria-live="polite"/);
  assert.match(qcDetailsModal, /Close Quality Control status details/);
});

test('Stage 9K QC submissions expose busy progress and accessible failure dialogs', () => {
  assert.match(techUnitsScript, /const submitStatus = form\.querySelector\('\[data-qc-submit-status\]'\)/);
  assert.match(techUnitsScript, /form\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(techUnitsScript, /submitButton\.textContent = progressLabel/);
  assert.match(techUnitsScript, /form\.removeAttribute\('aria-busy'\)/);
  assert.equal(countMatches(techUnitsScript, /role="alertdialog"/g), 2);
  assert.equal(countMatches(techUnitsScript, /data-modal-initial-focus/g) >= 2, true);
  assert.doesNotMatch(techUnitsScript, /class="modal-close"/);
});

test('Stage 9K QC status geometry uses an unscaled centered 22 pixel coordinate system', () => {
  const icon = read('views/fragments/tech-unit-qc-status-icon.ejs');

  assert.match(icon, /viewBox="0 0 22 22"/);
  assert.match(icon, /cx="11" cy="11"/);
  assert.match(icon, /M7\.5 7\.5 14\.5 14\.5M14\.5 7\.5 7\.5 14\.5/);
  assert.match(icon, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(icon, /aria-hidden="true"/);
  assert.match(appCss, /vector-effect: non-scaling-stroke/);
  assert.doesNotMatch(techUnitsCss, /\.tech-units-clean-page \.tech-qc-status-indicator__mark/);
  assert.match(techUnitsCss, /Shared QC status geometry and colors/);
});

test('Stage 9K QC summary and queue expose labels without relying on color alone', () => {
  const summary = read('views/fragments/tech-units-qc-summary.ejs');
  const queue = read('views/fragments/tech-units-qc-review-queue.ejs');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(summary, /role="status"/);
  assert.match(summary, /aria-atomic="true"/);
  assert.match(summary, /aria-label="Current Acceptance:/);
  assert.match(summary, /aria-label="Pending Corrections:/);
  assert.match(queue, /aria-live="polite"/);
  assert.match(queue, /aria-label="<%= option\.label %>: <%= formatNumber\(option\.count\) %> Unit/);
  assert.match(table, /aria-label="View <%= unit\.qcReviewStateLabel/);
});

test('Stage 9K responsive CSS uses four, two, and one column QC summary layouts', () => {
  assert.match(techUnitsCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(techUnitsCss, /@media \(max-width: 900px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(techUnitsCss, /@media \(max-width: 620px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(techUnitsCss, /flex-wrap: wrap/);
  assert.match(appCss, /max-height: calc\(100dvh - 48px\)/);
  assert.match(appCss, /\.tech-qc-modal-actions > :is\(button, a\)/);
  assert.match(appCss, /\.tech-qc-status-link:focus-visible/);
});

test('Stage 9K cache-busts the common modal manager and QC Unit Browser assets', () => {
  const techUnitsPage = read('views/pages/tech-units.ejs');
  const techUnitDetailPage = read('views/pages/tech-unit-detail.ejs');
  const head = read('views/partials/head.ejs');
  const pageFiles = fs.readdirSync(path.join(root, 'views/pages'))
    .filter((name) => name.endsWith('.ejs'))
    .map((name) => read(path.join('views/pages', name)))
    .filter((markup) => markup.includes('/js/modal.js'));

  assert.ok(pageFiles.length >= 9);
  pageFiles.forEach((markup) => {
    assert.match(markup, /\/js\/modal\.js\?v=20\d{6}-[a-z0-9-]+/i);
  });

  [techUnitsPage, techUnitDetailPage].forEach((markup) => {
    assert.match(markup, /\/js\/modal\.js\?v=20260819-stage10w68p-interaction-refinements/);
    assert.match(markup, /tech-units-clean\.css\?v=20260819-stage10w68o-toggle-label-cleanup/);
    assert.match(markup, /tech-units\.js\?v=20260819-stage10w68l-filter-toggles/);
  });

  assert.match(head, /app\.css\?v=20260819-stage10w68w-half-size-lot-chevrons/);
});

test('Stage 9K provides a dedicated validation command without adding a migration', () => {
  const packageJson = JSON.parse(read('package.json'));
  const sqlFiles = fs.readdirSync(path.join(root, 'sql'));

  assert.equal(
    packageJson.scripts['validate:qc-accessibility'],
    'node --test services/stage9kQcResponsiveAccessibilityIntegration.test.js'
  );
  assert.equal(sqlFiles.some((name) => /stage[-_]?9k/i.test(name)), false);
});
