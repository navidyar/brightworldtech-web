'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('API exposes Commit as the canonical Tool write endpoint and retires direct create/inventory routes', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.post\('\/units\/commit', requireApiAuth, requireUnitApiAccess, apiUnitController\.commitUnit\)/);
  assert.doesNotMatch(routes, /router\.post\('\/units', requireApiAuth, requireUnitApiAccess, apiUnitController\.createUnit\)/);
  assert.doesNotMatch(routes, /router\.put\('\/units\/:unitId\/inventory\/:reportId'/);
  assert.match(routes, /router\.put\('\/units\/:unitId\/wipe-certificates\/:certificateId'/);
});

test('Commit re-runs Resolve + Preflight and refuses blocked or explicit-action submissions before writing', () => {
  const service = read('services/apiUnitCommit.js');
  assert.match(service, /apiUnitIntake\.resolveUnit\(body, \{[\s\S]*preflightContext/);
  assert.match(service, /assertPreflightCanProceed\(resolution\)/);
  assert.match(service, /PREFLIGHT_BLOCKED/);
  assert.match(service, /EXPLICIT_UNIT_ACTION_REQUIRED/);
  assert.match(service, /unit_action\?\.action_required/);
});

test('existing Unit Commit requires the supplied Unit ID to match fresh server identity resolution', () => {
  const service = read('services/apiUnitCommit.js');
  assert.match(service, /resolution\.status === 'MATCHED'/);
  assert.match(service, /UNIT_ID_REQUIRED/);
  assert.match(service, /requestedUnitId !== matchedUnitId/);
  assert.match(service, /UNIT_IDENTITY_CHANGED/);
});

test('new Unit creation and Tool inventory share one caller-owned transaction', () => {
  const service = read('services/apiUnitCommit.js');
  assert.match(service, /const connection = await pool\.getConnection\(\)/);
  assert.match(service, /await connection\.beginTransaction\(\)/);
  assert.match(service, /apiUnitIntake\.createUnitForCommit\([\s\S]*connection/);
  assert.match(service, /apiScalarInventory\.ingestScalarInventory\([\s\S]*connection,[\s\S]*ensureSpecificationsRow: true/);
  assert.match(service, /await connection\.commit\(\)/);
  assert.match(service, /await connection\.rollback\(\)/);
});

test('browser creation keeps self-managed transactions while Commit has the caller-owned creation hook', () => {
  const model = read('models/techUnitModel.js');
  const intake = read('services/apiUnitIntake.js');
  assert.match(model, /const externalConnection = options\.connection \|\| null/);
  assert.match(model, /const managesTransaction = !externalConnection/);
  assert.match(model, /if \(managesTransaction\) \{\s*await connection\.beginTransaction\(\)/);
  assert.match(model, /if \(managesTransaction\) \{\s*await connection\.commit\(\)/);
  assert.match(intake, /async function createUnitForCommit/);
  assert.doesNotMatch(intake, /async function createUnit\(\{ body = \{\}, userId, toolSource \}\)/);
});

test('inventory engine can join Commit transaction without changing standalone inventory behavior', () => {
  const inventory = read('services/apiScalarInventory.js');
  assert.match(inventory, /connection: externalConnection = null/);
  assert.match(inventory, /const managesTransaction = !externalConnection/);
  assert.match(inventory, /if \(managesTransaction\) \{\s*await connection\.beginTransaction\(\)/);
  assert.match(inventory, /ensureUnitSpecificationsRow/);
  assert.match(inventory, /assertExpectedUnitState/);
  assert.match(inventory, /UNIT_STATE_CHANGED/);
});

test('submission_id reuses existing Tool receipt report_id idempotency and does not introduce another receipt table', () => {
  const service = read('services/apiUnitCommit.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.match(service, /submission_id/);
  assert.match(service, /reportId: submissionId/);
  assert.match(service, /getSubmissionById/);
  assert.match(service, /status: 'REPLAYED'/);
  assert.match(inventory, /tool_source = \? AND report_id = \?/);
  assert.doesNotMatch(service, /CREATE TABLE|INSERT INTO .*submission|preflight_id/i);
});

test('concurrent new-Unit idempotency replay revalidates current identity before returning the existing receipt', () => {
  const service = read('services/apiUnitCommit.js');
  const helperStart = service.indexOf('async function createAndIngestUnit');
  const helperEnd = service.indexOf('async function commitUnit');
  const helper = service.slice(helperStart, helperEnd);

  assert.match(helper, /error\?\.code === 'ER_DUP_ENTRY'/);
  assert.match(helper, /apiUnitIntake\.resolveUnit\(body, \{[\s\S]*preflightContext: \{ userId, roleCodes, toolSource \}/);
  assert.match(helper, /assertPreflightCanProceed\(replayResolution\)/);
  assert.match(helper, /buildReplayResponse\(\{[\s\S]*submission: concurrentSubmission,[\s\S]*resolution: replayResolution,[\s\S]*requestedUnitId,[\s\S]*userId,[\s\S]*intentionalDuplicate/);
  assert.doesNotMatch(helper, /concurrentSubmission\.submitted_by_user_id[\s\S]*status: 'REPLAYED'/);
});

test('Commit summarizes partial acceptance without treating protected or ignored fields as a whole-submission failure', () => {
  const service = read('services/apiUnitCommit.js');
  assert.match(service, /accepted_fields/);
  assert.match(service, /protected_fields/);
  assert.match(service, /ignored_fields/);
  assert.match(service, /stored_test_results/);
  assert.match(service, /application_status === 'blocked_manual'/);
  assert.match(service, /application_status === 'ignored_unknown'/);
});

test('Commit does not add Tool-controlled production lifecycle or automatic move/takeover mutations', () => {
  const service = read('services/apiUnitCommit.js');
  assert.doesNotMatch(service, /productionCycleModel|productionWeightModel|recordUnitWorkCompletion|reverseUnitWorkCompletion|assignTechUnit|assumeExistingTechUnitFromDuplicateMatch|recordUnitLotHistory/);
  assert.doesNotMatch(service, /production_cycle_key\s*:/);
});

test('wipe evidence remains a separate endpoint rather than being folded into Commit', () => {
  const service = read('services/apiUnitCommit.js');
  const routes = read('routes/api.js');
  assert.doesNotMatch(service, /apiWipeCertificate|recordWipeCertificate|wipe-certificates/);
  assert.match(routes, /wipe-certificates/);
});


test('confirmed Intentional Duplicate uses the same atomic new-Unit Commit transaction', () => {
  const service = read('services/apiUnitCommit.js');
  assert.match(service, /confirm_duplicate_match_creation/);
  assert.match(service, /if \(intentionalDuplicate\)/);
  assert.match(service, /if \(intentionalDuplicate\)[\s\S]*createAndIngestUnit\(\{[\s\S]*intentionalDuplicate[\s\S]*\}\)/);
  assert.match(service, /INTENTIONAL_DUPLICATE_UNIT_ID_NOT_ALLOWED/);
});
