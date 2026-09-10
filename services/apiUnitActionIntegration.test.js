'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('API exposes an authenticated explicit Unit action endpoint separate from Commit', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.post\('\/units\/action', requireApiAuth, requireUnitApiAccess, apiUnitController\.applyUnitAction\)/);
  assert.match(routes, /router\.post\('\/units\/commit'/);
});

test('explicit Unit action reruns Resolve + Preflight before any lifecycle mutation', () => {
  const service = read('services/apiUnitAction.js');
  assert.match(service, /apiUnitIntake\.resolveUnit\(body, \{[\s\S]*preflightContext/);
  assert.match(service, /unitAction\.approval_required/);
  assert.match(service, /preflight\.blockers/);
  assert.match(service, /applyApiExplicitUnitAction/);
});

test('move or takeover requires explicit technician confirmation', () => {
  const service = read('services/apiUnitAction.js');
  assert.match(service, /confirm_unit_action/);
  assert.match(service, /UNIT_ACTION_CONFIRMATION_REQUIRED/);
  assert.match(service, /explicitly confirm/);
});

test('approval-required actions remain in the existing BWTDallas request workflow', () => {
  const service = read('services/apiUnitAction.js');
  assert.match(service, /UNIT_ACTION_APPROVAL_REQUIRED/);
  assert.match(service, /existing Move \/ Takeover request in the BWTDallas application/);
  assert.doesNotMatch(service, /createOverrideRequest|INSERT INTO unit_override_requests/);
});

test('action service refuses inventory or Intentional Duplicate creation work', () => {
  const service = read('services/apiUnitAction.js');
  assert.match(service, /INTENTIONAL_DUPLICATE_USES_COMMIT/);
  assert.doesNotMatch(service, /apiScalarInventory|createUnitForCommit|unit_tool_runs/);
});

test('model action revalidates locked Unit state and current destination policy', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /async function applyApiExplicitUnitAction/);
  assert.match(model, /FOR UPDATE/);
  assert.match(model, /BWT_API_UNIT_ACTION_STATE_CHANGED/);
  assert.match(model, /destinationIsAssignable/);
  assert.match(model, /allow_duplicate_unit_assumption/);
});

test('same-Lot takeover changes assignment without manufacturing a Lot move or production cycle', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /const lotChanged = wasParked \|\| previousLotId !== destinationLotId/);
  assert.match(model, /if \(lotChanged\) \{[\s\S]*recordUnitLotHistory/);
  assert.match(model, /if \(assignmentChanged\) \{[\s\S]*recordUnitAssignmentHistory/);
});

test('Intentional Duplicate is evaluated as a new Unit and remains atomic with Commit', () => {
  const preflight = read('services/apiUnitPreflight.js');
  const commit = read('services/apiUnitCommit.js');
  assert.match(preflight, /intentionalDuplicateRequested/);
  assert.match(preflight, /INTENTIONAL_DUPLICATE_APPROVAL_REQUIRED/);
  assert.match(preflight, /ASSET_TAG_NOT_DUPLICABLE/);
  assert.match(commit, /if \(intentionalDuplicate\)/);
  assert.match(commit, /createAndIngestUnit/);
  assert.match(commit, /INTENTIONAL_DUPLICATE_UNIT_ID_NOT_ALLOWED/);
});

test('Intentional Duplicate replay tolerates expected duplicate identity ambiguity for the stored submission Unit', () => {
  const commit = read('services/apiUnitCommit.js');
  assert.match(commit, /candidateUnitIds/);
  assert.match(commit, /intentionalDuplicate && candidateUnitIds\.has\(Number\(submission\.unit_id\)\)/);
});
