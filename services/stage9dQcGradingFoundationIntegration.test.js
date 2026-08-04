'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC grading uses completion cycles rather than counting each append-only review as a separate Unit', () => {
  const service = read('services/qcGradingService.js');

  assert.match(service, /groupReviewActionsByCompletion/);
  assert.match(service, /unitWorkCompletionId/);
  assert.match(service, /firstPassAcceptedUnits/);
  assert.match(service, /pendingCorrectionUnits/);
  assert.match(service, /readyForRecheckUnits/);
  assert.match(service, /correctedUnits/);
  assert.match(service, /qualityGrade = roundPercentage\(summary\.firstPassAcceptedUnits, summary\.reviewedUnits\)/);
  assert.match(service, /correctionResolutionRate = roundPercentage\(summary\.correctedUnits, summary\.rejectedUnits\)/);
});

test('QC grading query excludes reversed and non-manual completion records and scopes dates by completion time', () => {
  const model = read('models/qcGradingModel.js');

  assert.match(model, /completion\.credit_source = 'manual_completion'/);
  assert.match(model, /completion\.reversed_at IS NULL/);
  assert.match(model, /completion\.completed_at >= \?/);
  assert.match(model, /completion\.completed_at < \?/);
  assert.match(model, /buildQcTechnicianAttributionSql/);
  assert.match(model, /ORDER BY[\s\S]*technician_user_id,[\s\S]*completion\.unit_work_completion_id,[\s\S]*qc\.unit_qc_check_id/);
});

test('QC grading foundation validates schema readiness and percentage invariants', () => {
  const model = read('models/qcGradingModel.js');
  const service = read('services/qcGradingService.js');
  const validator = read('scripts/validateStage9dQcGradingFoundation.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(model, /isQcCheckSchemaReady/);
  assert.match(model, /BWT_QC_SCHEMA_REQUIRED/);
  assert.match(service, /assertValidQcGradeSummary/);
  assert.match(validator, /overall first-pass grade/);
  assert.equal(packageJson.scripts['validate:qc-grading'], 'bash scripts/runStage9dQcGradingFoundationValidation.sh');
});

test('QC grading policy is explicit and does not award an unreviewed technician a grade', () => {
  const service = read('services/qcGradingService.js');

  assert.match(service, /qualityGradeBasis: 'accepted_without_rejection'/);
  assert.match(service, /firstPassRejectedBasis: 'completion_cycle_contains_rejection'/);
  assert.match(service, /correctionResolutionBasis: 'rejected_cycle_later_accepted'/);
  assert.match(service, /dateScopeBasis: 'completion_date'/);
  assert.match(service, /qualityGrade: null/);
  assert.match(service, /gradingStatus: 'ungraded'/);
});
