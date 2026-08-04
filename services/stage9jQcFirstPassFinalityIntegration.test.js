'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9J first-pass grading treats any rejected completion cycle as first-pass rejected', () => {
  const service = read('services/qcGradingService.js');

  assert.match(service, /qualityGradeBasis: 'accepted_without_rejection'/);
  assert.match(service, /firstPassRejectedBasis: 'completion_cycle_contains_rejection'/);
  assert.match(service, /firstPassAcceptedUnits \+= wasRejected \? 0 : 1/);
  assert.match(service, /firstPassRejectedUnits \+= wasRejected \? 1 : 0/);
  assert.match(service, /rejectedUnits !== summary\.firstPassRejectedUnits/);
  assert.match(service, /correctedUnits > summary\.firstPassRejectedUnits/);
});

test('Stage 9J locks an accepted completion cycle in the model and both controller entry points', () => {
  const model = read('models/unitQcCheckModel.js');
  const controller = read('controllers/techController.js');

  assert.match(model, /previous\.decisionCode === 'accepted'/);
  assert.match(model, /BWT_QC_REVIEW_FINAL/);
  assert.match(model, /Reverse completion and record a new completion cycle/);

  const acceptedGuardCount = (controller.match(/latestQcReview && context\.latestQcReview\.decisionCode === 'accepted'/g) || []).length;
  assert.equal(acceptedGuardCount, 2);
  assert.match(controller, /BWT_QC_REVIEW_FINAL/);
});

test('Stage 9J removes ordinary QC controls after acceptance and permits only corrected rejection rechecks', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const modal = read('views/fragments/tech-unit-qc-review-modal.ejs');

  assert.match(table, /!latestQcReview \|\| \(latestQcReview\.decisionCode === 'rejected' && latestQcCorrection\)/);
  assert.doesNotMatch(table, /latestQcReview\.decisionCode !== 'rejected' \|\| latestQcCorrection/);
  assert.match(modal, /const canSubmitReview = Boolean/);
  assert.match(modal, /!latestQcReview \|\| \(latestQcReview\.decisionCode === 'rejected' && latestQcCorrection\)/);
  assert.match(modal, /if \(canSubmitReview\)/);
});

test('Stage 9J reporting language explains first-pass acceptance without adding page-specific CSS', () => {
  const page = read('views/pages/management-qc-reporting.ejs');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(page, /First-Pass Accepted counts Units that passed without any rejection/);
  assert.match(page, /a correction never restores first-pass credit/);
  assert.match(packageJson.scripts['validate:qc-hardening'], /qcGradingService\.test\.js/);
  assert.match(packageJson.scripts['validate:qc-hardening'], /stage9jQcAcceptedCycleFinality\.test\.js/);
});
