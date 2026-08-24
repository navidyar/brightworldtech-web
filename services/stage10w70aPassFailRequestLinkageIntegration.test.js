'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Stage 10W70A exposes Pass/Fail confirmation only to regular Tech users and enforces it on submit', () => {
  const controller = read('controllers/techController.js');
  const form = read('views/fragments/tech-unit-form.ejs');
  const expanded = read('models/unitExpandedFormModel.js');
  const outcome = read('models/unitOutcomeModel.js');

  assert.match(controller, /roleCodes\.includes\('tech'\)[\s\S]*\['admin', 'management', 'tech_lead', 'qc'\]\.includes\(roleCode\)/);
  assert.match(controller, /const canRequestOutcomeConfirmation = isRegularTechUnitBrowserUser\(req\)/);
  assert.match(controller, /outcomeApprovalRequested:\s*canRequestOutcomeConfirmation && req\.body\.outcomeApprovalRequested/);
  assert.match(controller, /canRequestOutcomeConfirmation:\s*isRegularTechUnitBrowserUser\(req\)/);
  assert.match(form, /if \(canRequestOutcomeConfirmation\)/);
  assert.match(form, /Request Tech Lead\+ confirmation for this Pass\/Fail decision/);
  assert.match(expanded, /canRequestOutcomeConfirmation = false/);
  assert.match(outcome, /canRequestOutcomeConfirmation = false/);
  assert.match(outcome, /const approvalRequested = canRequestOutcomeConfirmation[\s\S]*normalizeApprovalRequested/);
});

test('Stage 10W70A stores the exact unit_outcomes row on each new Pass/Fail confirmation request', () => {
  const expanded = read('models/unitExpandedFormModel.js');
  const outcome = read('models/unitOutcomeModel.js');
  const override = read('models/overrideRequestModel.js');
  const migration = read('sql/2026-08-stage-10w70a-pass-fail-request-linkage.sql');

  assert.match(outcome, /unitOutcomeId:\s*Number\(insertResult\.insertId\) \|\| null/);
  assert.match(expanded, /unitOutcomeId:\s*outcomeSaveResult\?\.unitOutcomeId \|\| null/);
  assert.match(override, /unitOutcomeId = null/);
  assert.match(override, /INSERT INTO unit_override_requests \([\s\S]*unit_outcome_id/);
  assert.match(override, /unit_outcome_id:\s*safeUnitOutcomeId/);
  assert.match(migration, /REFERENCES unit_outcomes \(unit_outcome_id\)/);
  assert.match(migration, /LOWER\(child\.COLUMN_TYPE\) = LOWER\(parent\.COLUMN_TYPE\)/);
});

test('Stage 10W70A preserves an old pending request instead of retargeting it to a newer outcome', () => {
  const override = read('models/overrideRequestModel.js');

  assert.match(override, /pendingOutcomeId === safeUnitOutcomeId/);
  assert.match(override, /Pass\/Fail confirmation request was superseded by a newer Pass\/Fail confirmation decision/);
  assert.match(override, /request_status = 'cancelled'/);
  assert.doesNotMatch(override, /SET[\s\S]{0,180}request_details = \?[\s\S]{0,180}WHERE unit_override_request_id = \?[\s\S]{0,120}return Number\(pendingRequest\.unit_override_request_id\)/);
});

test('Stage 10W70A withdrawal targets linked outcome rows while retaining legacy compatibility', () => {
  const override = read('models/overrideRequestModel.js');

  assert.match(override, /SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id/);
  assert.match(override, /WHERE unit_outcome_id = \?[\s\S]*AND unit_id = \?/);
  assert.match(override, /Compatibility for a pending request created before Stage 10W70A/);
});

test('Stage 10W70A migration is additive and rollback refuses to discard linkage audit data', () => {
  const migration = read('sql/2026-08-stage-10w70a-pass-fail-request-linkage.sql');
  const rollback = read('sql/2026-08-stage-10w70a-pass-fail-request-linkage-rollback.sql');
  const apply = read('scripts/apply-stage-10w70a-pass-fail-request-linkage.sh');
  const preflight = read('scripts/preflight-stage-10w70a-pass-fail-request-linkage.sh');

  assert.match(migration, /ADD COLUMN unit_outcome_id/);
  assert.doesNotMatch(migration, /DROP TABLE unit_override_requests/);
  assert.match(migration, /candidate_request\.request_type = 'outcome_confirmation'[\s\S]*LOWER\(candidate_request\.request_status\) = 'pending'[\s\S]*HAVING COUNT\(\*\) = 1/);
  assert.match(rollback, /rollback refused: immutable Pass\/Fail request linkage data exists/i);
  assert.match(apply, /Pending legacy Pass\/Fail requests without exact linkage/);
  assert.match(apply, /preflight-stage-10w70a-pass-fail-request-linkage\.sh/);
  assert.match(preflight, /No database changes were made/);
  assert.match(preflight, /ambiguous_current_matches/);
});
