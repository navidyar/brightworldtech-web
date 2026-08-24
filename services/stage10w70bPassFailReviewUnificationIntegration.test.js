
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W70B retires the legacy direct Pass/Fail review path', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/techController.js');
  const outcomeModel = read('models/unitOutcomeModel.js');

  assert.doesNotMatch(routes, /\/tech\/units\/:unitId\/outcome-approval/);
  assert.doesNotMatch(controller, /renderOutcomeApprovalModal|approveOutcomeRequest|tech-unit-outcome-approval-modal/);
  assert.doesNotMatch(outcomeModel, /approveCurrentOutcome/);
  assert.equal(fs.existsSync(path.join(ROOT, 'views/fragments/tech-unit-outcome-approval-modal.ejs')), false);
});

test('Stage 10W70B reviews outcome confirmations only through the exact immutable linked outcome', () => {
  const model = read('models/overrideRequestModel.js');

  assert.match(model, /r\.unit_outcome_id/);
  assert.match(model, /async function lockOutcomeConfirmationTarget/);
  assert.match(model, /WHERE unit_outcome_id = \?[\s\S]*FOR UPDATE/);
  assert.match(model, /normalizeOptionalInteger\(outcome\.unit_id\) !== requestUnitId/);
  assert.match(model, /Number\(outcome\.is_current \|\| 0\) === 1/);
  assert.match(model, /approval_status_code \|\| ''\)\.toLowerCase\(\) === 'pending'/);
  assert.match(model, /approval_requested_by_user_id\) === requestedByUserId/);
  assert.match(model, /BWT_OUTCOME_CONFIRMATION_TARGET_REQUIRED/);
  assert.match(model, /BWT_OUTCOME_CONFIRMATION_TARGET_STALE/);
  assert.match(model, /const linkedOutcome = previewIsOutcomeConfirmation[\s\S]*lockOutcomeConfirmationTarget\(connection, requestPreview\)[\s\S]*FROM unit_override_requests r[\s\S]*FOR UPDATE/);
  assert.match(model, /approval_status_code = 'approved'[\s\S]*WHERE unit_outcome_id = \?[\s\S]*AND unit_id = \?[\s\S]*AND is_current = 1[\s\S]*AND approval_status_code = 'pending'/);
  assert.match(model, /approval_status_code = 'denied'[\s\S]*WHERE unit_outcome_id = \?[\s\S]*AND unit_id = \?[\s\S]*AND is_current = 1[\s\S]*AND approval_status_code = 'pending'/);
  assert.doesNotMatch(model, /approval_status_code = 'approved'[\s\S]{0,400}WHERE unit_id = \?[\s\S]{0,200}ORDER BY selected_at DESC/);
  assert.doesNotMatch(model, /approval_status_code = 'denied'[\s\S]{0,400}WHERE unit_id = \?[\s\S]{0,200}ORDER BY selected_at DESC/);
});

test('Stage 10W70B unified detail shows the exact requested Pass/Fail and explains non-mutating review semantics', () => {
  const detail = read('views/pages/override-request-detail.ejs');
  const queue = read('services/unifiedRequestQueue.js');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(detail, /Requested Pass\/Fail/);
  assert.match(detail, /Outcome #\$\{request\.unitOutcomeId\}/);
  assert.match(detail, /does not change the Tech’s Pass\/Fail selection/);
  assert.match(detail, /Approve Confirmation/);
  assert.match(detail, /Reject Confirmation/);
  assert.match(queue, /Requested \$\{request\.outcomeConfirmationOutcomeLabel\}/);
  assert.match(table, /requestType=outcome_confirmation/);
});

test('Stage 10W70B preflight is read-only and blocks deployment with invalid pending linkage', () => {
  const preflight = read('scripts/preflight-stage-10w70b-pass-fail-review-unification.sh');

  assert.match(preflight, /invalid_pending_targets/);
  assert.match(preflight, /Stage 10W70B read-only preflight passed/);
  assert.match(preflight, /No database changes were made/);
  assert.doesNotMatch(preflight, /UPDATE |INSERT |DELETE |ALTER |DROP /);
});
