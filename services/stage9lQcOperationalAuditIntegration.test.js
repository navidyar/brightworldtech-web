'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC writes revalidate the current completion cycle after acquiring the Unit lock', () => {
  const reviewModel = read('models/unitQcCheckModel.js');
  const correctionModel = read('models/unitQcCorrectionModel.js');

  assert.match(reviewModel, /assertCurrentQcCompletionCycle\(unit/);
  assert.match(reviewModel, /BWT_QC_COMPLETION_STALE/);
  assert.match(correctionModel, /assertCurrentQcCompletionCycle\(state/);
  assert.match(correctionModel, /BWT_QC_CORRECTION_COMPLETION_STALE/);
  assert.match(reviewModel, /current_lot_history_id/);
  assert.match(correctionModel, /current_lot_history_id/);
});

test('correction writes revalidate technician responsibility after the transaction lock', () => {
  const controller = read('controllers/techController.js');
  const correctionModel = read('models/unitQcCorrectionModel.js');

  assert.match(controller, /submittedByRoleCodes: getCurrentRoleCodes\(req\)/);
  assert.match(correctionModel, /canSubmitQcCorrectionForCurrentAssignment/);
  assert.match(correctionModel, /BWT_QC_CORRECTION_PERMISSION_CHANGED/);
  assert.match(controller, /'BWT_QC_CORRECTION_PERMISSION_CHANGED'/);
});

test('Stage 9L exposes one operational audit command covering storage, history, sequences, and reporting', () => {
  const packageJson = JSON.parse(read('package.json'));
  const validator = read('scripts/validateStage9lQcOperationalAudit.js');
  const auditModel = read('models/qcOperationalAuditModel.js');

  assert.equal(packageJson.scripts['validate:qc-operational-audit'], 'bash scripts/runStage9lQcOperationalAuditValidation.sh');
  assert.match(validator, /Stage 9L Quality Control operational audit passed/);
  assert.match(auditModel, /getQcHistoryCoverage/);
  assert.match(auditModel, /getQcReportingReconciliation/);
  assert.match(auditModel, /listQcSequenceRows/);
});

test('Stage 9L validator treats historical accepted-then-reviewed cycles as visible warnings', () => {
  const validator = read('scripts/validateStage9lQcOperationalAudit.js');
  const service = read('services/qcOperationalAuditService.js');

  assert.match(service, /Historical completion cycles contain a QC review after acceptance/);
  assert.match(validator, /Historical accepted-then-reviewed completion IDs/);
});
