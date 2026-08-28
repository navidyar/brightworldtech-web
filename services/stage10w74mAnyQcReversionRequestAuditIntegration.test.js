'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('any QC-role user can request reversion of the current QC decision regardless of original reviewer', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(controller, /function canRequestQcReviewReversion\(req\)[\s\S]*?roleCodes\.includes\('qc'\)/);
  assert.doesNotMatch(controller, /Only the QC user who recorded this current decision/);
  assert.doesNotMatch(controller, /ownsLatestQcReview/);
  assert.doesNotMatch(model, /BWT_QC_REVERSION_REQUEST_OWNER_REQUIRED/);
  assert.doesNotMatch(model, /Number\(state\.reviewed_by_user_id\) !== safeRequesterUserId/);
});

test('a pending QC reversion request blocks duplicate requests globally for that exact decision', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/unitRequestModel.js');

  const modalStart = controller.indexOf('async function renderQcReviewReversionRequestModal');
  const modalEnd = controller.indexOf('async function requestQcReviewReversion', modalStart);
  const modalBlock = controller.slice(modalStart, modalEnd);
  assert.match(modalBlock, /getPendingQcReversionRequestForQcCheck\(\{ qcCheckId \}\)/);
  assert.doesNotMatch(modalBlock, /requestedByUserId/);
  assert.match(model, /ur\.status = 'pending'[\s\S]*?qrr\.unit_qc_check_id = \?/);
});

test('submitting a QC reversion request writes a permanent Unit History audit event with requester identity and reason', () => {
  const model = read('models/unitRequestModel.js');

  assert.match(model, /unitAuditEventModel\.insertEventWithConnection\(connection, \{/);
  assert.match(model, /eventType: 'unit_qc_reversion_request_submitted'/);
  assert.match(model, /eventSource: 'quality_control_reversion_request'/);
  assert.match(model, /eventSummary: 'Requested QC decision reversion'/);
  assert.match(model, /actorUserId: safeRequesterUserId/);
  assert.match(model, /originalQcReviewerUserId: Number\(state\.reviewed_by_user_id\)/);
  assert.match(model, /fieldLabel: 'Reversion Request Reason'[\s\S]*?newValueText: safeRequesterNote/);
});

test('the request remains approval-based and does not immediately mutate the current QC decision', () => {
  const model = read('models/unitRequestModel.js');

  const createStart = model.indexOf('async function createQcReversionRequest');
  const createEnd = model.indexOf('function sameQcReversionRequestTarget', createStart);
  const createBlock = model.slice(createStart, createEnd);
  assert.match(createBlock, /INSERT INTO unit_qc_reversion_requests/);
  assert.match(createBlock, /unit_qc_reversion_request_submitted/);
  assert.doesNotMatch(createBlock, /revertQcReviewWithConnection|reverted_at\s*=/);
});
