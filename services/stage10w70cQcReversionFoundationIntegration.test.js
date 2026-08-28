'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 10W70C grants direct QC reversion only to Tech Lead+ through an exact QC check route', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');

  assert.match(routes, /qc-review\/:qcCheckId\/revert\/modal[\s\S]*requireRole\(overrideReviewRoles\)/);
  assert.match(routes, /qc-review\/:qcCheckId\/revert'[\s\S]*requireRole\(overrideReviewRoles\)/);
  assert.match(controller, /\['admin', 'management', 'tech_lead'\]/);
  assert.doesNotMatch(routes, /qc-review\/:qcCheckId\/revert[\s\S]{0,180}requireRole\(\['qc'\]\)/);
});

test('Stage 10W70C requires an exact latest current-cycle QC target and a reversion reason', () => {
  const model = read('models/unitQcCheckModel.js');

  assert.match(model, /normalizeReversionReason/);
  assert.match(model, /ORDER BY unit_qc_check_id DESC[\s\S]*FOR UPDATE/);
  assert.match(model, /BWT_QC_REVERSION_NOT_LATEST/);
  assert.match(model, /assertCurrentQcCompletionCycle/);
  assert.match(model, /UPDATE unit_qc_checks[\s\S]*reverted_at = CURRENT_TIMESTAMP\(6\)[\s\S]*WHERE unit_qc_check_id = \?[\s\S]*reverted_at IS NULL/);
});

test('Stage 10W70C returns a reverted latest QC decision to Awaiting QC without resurrecting older decisions', () => {
  const qcModel = read('models/unitQcCheckModel.js');
  const techModel = read('models/techUnitModel.js');
  const presentation = read('services/qcStatusPresentation.js');

  assert.match(qcModel, /MAX\(unit_qc_check_id\) AS latest_qc_check_id[\s\S]*WHERE qc\.reverted_at IS NULL/);
  assert.match(techModel, /CASE WHEN latest_qc\.reverted_at IS NULL THEN latest_qc\.decision_code ELSE NULL END AS latest_decision_code/);
  assert.match(presentation, /latestRecordedReview\.isReverted[\s\S]*statusLabel: 'Awaiting QC'/);
});

test('Stage 10W70C removes reverted QC decisions from correction eligibility, grading, and reporting', () => {
  assert.match(read('models/unitQcCorrectionModel.js'), /latest_qc\.reverted_at IS NULL/);
  assert.match(read('models/qcGradingModel.js'), /qc\.reverted_at IS NULL/);
  assert.match(read('models/qcReportingModel.js'), /qc\.reverted_at IS NULL/);
});

test('Stage 10W70C operational audit recognizes valid post-reversion reviews and requires reversion audit history', () => {
  const auditModel = read('models/qcOperationalAuditModel.js');
  const auditService = read('services/qcOperationalAuditService.js');

  assert.match(auditModel, /qc\.reverted_at/);
  assert.match(auditModel, /event_type = 'unit_qc_reverted'/);
  assert.match(auditService, /action\.decisionCode === 'accepted' && !action\.isReverted/);
  assert.match(auditService, /previous\.decisionCode === 'rejected' && !previous\.isReverted/);
  assert.match(auditService, /missingReversionAuditEvents/);
});

test('Stage 10W70C direct-reversion UI continues to identify the exact QC decision after later request workflow layering', () => {
  const details = read('views/fragments/tech-unit-qc-review-details-modal.ejs');
  const modal = read('views/fragments/tech-unit-qc-reversion-modal.ejs');
  const routes = read('routes/management.js');

  assert.match(details, /Revert Current QC Decision/);
  assert.match(modal, /Exact QC Decision/);
  assert.match(modal, /QC #<%= review\.qcCheckId %>/);
  assert.match(modal, /Older QC decisions will not become current again/);
  assert.equal(fs.existsSync(path.join(root, 'models/unitQcReversionRequestModel.js')), false);
});

test('Stage 10W70C migration is additive and rollback refuses to discard used QC reversion audit data', () => {
  const migration = read('sql/2026-08-stage-10w70c-qc-reversion-foundation.sql');
  const rollback = read('sql/2026-08-stage-10w70c-qc-reversion-foundation-rollback.sql');
  const preflight = read('scripts/preflight-stage-10w70c-qc-reversion-foundation.sh');

  assert.match(migration, /ADD COLUMN reverted_at DATETIME\(6\) NULL/);
  assert.match(migration, /ADD COLUMN reverted_by_user_id/);
  assert.match(migration, /ADD COLUMN reversion_reason VARCHAR\(2000\) NULL/);
  assert.match(migration, /fk_unit_qc_checks_reverted_by/);
  assert.doesNotMatch(migration, /CREATE TABLE unit_qc_reversion_requests|unit_requests/);
  assert.match(rollback, /rollback refused: QC reversion audit data exists/i);
  assert.match(preflight, /No database changes were made/);
});

test('Stage 10W70C browser handling closes the modal and refreshes the Unit after a successful reversion', () => {
  const js = read('public/js/tech-units.js');
  const browserPage = read('views/pages/tech-units.ejs');
  const detailPage = read('views/pages/tech-unit-detail.ejs');
  assert.match(js, /data-qc-reversion-form/);
  assert.match(js, /qc-review-reverted/);
  assert.match(js, /Reverting QC decision/);
  assert.match(browserPage, /\/js\/tech-units\.js\?v=/);
  assert.match(detailPage, /\/js\/tech-units\.js\?v=/);
});
