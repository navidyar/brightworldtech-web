'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('existing Resolve endpoint is augmented with authenticated read-only Preflight context', () => {
  const controller = read('controllers/apiUnitController.js');
  const intake = read('services/apiUnitIntake.js');
  assert.match(controller, /preflightContext:[\s\S]*userId: req\.apiUser\.user_id[\s\S]*roleCodes: req\.apiUser\.roles[\s\S]*toolSource: req\.apiToolSource/);
  assert.match(intake, /response\.preflight = await apiUnitPreflight\.buildPreflight/);
});

test('Preflight reuses server-owned identity, Lot Tool policy, and Lot requirement services', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.match(source, /resolveLotToolPolicy/);
  assert.match(source, /techLotRequirementModel\.buildWorkflowForForm/);
  assert.match(source, /techUnitModel\.getAssignableLots/);
  assert.match(source, /techUnitModel\.assertLotMovePermission/);
  assert.match(source, /unitExpandedFormModel\.getExpandedFormDataByUnitId/);
  assert.match(source, /current_lot:/);
});

test('Preflight is read-only and does not call Unit mutation or production-cycle APIs', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.doesNotMatch(source, /createTechUnit|updateTechUnit|assignTechUnit|assumeExistingTechUnitFromDuplicateMatch|recordUnitWorkCompletion|reverseUnitWorkCompletion|productionCycleModel|productionWeightModel/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+units|DELETE\s+FROM/i);
});

test('rejections include universal restoration guidance without guessing ambiguous identity configuration', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.match(source, /configuration_known: false/);
  assert.match(source, /Restore any physical Memory or Storage changes/);
  assert.match(source, /memory: summarizeMemory/);
  assert.match(source, /storage: summarizeStorage/);
});

test('no preflight id, work session, orphan Unit, or API-controlled production cycle is introduced', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.doesNotMatch(source, /preflight_id|work_session|pending_observation|orphan|production_cycle_key/i);
});


test('explicit Intentional Duplicate confirmation evaluates a blank new-Unit preflight rather than mutating a matched Unit', () => {
  const intake = read('services/apiUnitIntake.js');
  const preflight = read('services/apiUnitPreflight.js');
  assert.match(intake, /intentionalDuplicate: normalizeBoolean\(body\.confirm_duplicate_match_creation/);
  assert.match(preflight, /const matchedUnitId = !intentionalDuplicateRequested/);
  assert.match(preflight, /action: 'intentional_duplicate'/);
  assert.match(preflight, /INTENTIONAL_DUPLICATE_MATCH_REQUIRED/);
});
