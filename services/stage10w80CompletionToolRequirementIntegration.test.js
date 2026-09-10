'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('completion checks inherited Lot Tool policy and current server-owned production cycle receipts', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /resolveLotToolPolicy\(allLots, safeLotId\)/);
  assert.match(model, /getCurrentProductionCycleKey\(safeUnitId, connection\)/);
  assert.match(model, /FROM unit_tool_runs/);
  assert.match(model, /production_cycle_key = \?/);
  assert.match(model, /status = 'completed'/);
  assert.match(model, /tool_source IN/);
});

test('previous-cycle Tool receipts cannot satisfy a new production-cycle completion requirement', () => {
  const model = read('models/techUnitModel.js');
  const currentCycleQuery = /WHERE unit_id = \?[\s\S]*AND production_cycle_key = \?[\s\S]*AND status = 'completed'/;
  assert.match(model, currentCycleQuery);
  assert.doesNotMatch(model, /ORDER BY received_at[\s\S]*LIMIT 1[\s\S]*requireScanToolsBeforeCompletion/);
});

test('Tool test outcomes do not determine whether the required Tool run occurred', () => {
  const model = read('models/techUnitModel.js');
  const completionRequirementSection = model.slice(
    model.indexOf('async function getCompletionToolRequirementStatus'),
    model.indexOf('async function getUnitWorkCompletionPreview')
  );
  assert.match(completionRequirementSection, /unit_tool_runs/);
  assert.doesNotMatch(completionRequirementSection, /diagnostic|test_result|Pass|Fail|could_not_determine/i);
});

test('completion modal blocks regular Techs and exposes an audited reason field only to Tech Lead+', () => {
  const controller = read('controllers/techController.js');
  const fragment = read('views/fragments/tech-unit-complete-work-modal.ejs');
  assert.match(controller, /canOverrideMissingToolRequirements\(roleCodes\)/);
  assert.match(fragment, /completionRequirementsBlocking/);
  assert.match(fragment, /Completion is blocked until the missing required Tool run is completed/);
  assert.match(fragment, /name="completionRequirementOverrideReason"/);
  assert.match(fragment, /maxlength="1000"/);
  assert.match(fragment, /required/);
  assert.match(fragment, /recorded permanently in Unit History/);
});

test('completion POST rechecks Tool requirements instead of trusting the modal preview', () => {
  const model = read('models/techUnitModel.js');
  const recordStart = model.lastIndexOf('async function recordUnitWorkCompletion');
  const recordSection = model.slice(recordStart, model.indexOf('function emptyCompletionReversalPreview', recordStart));
  assert.match(recordSection, /await connection\.beginTransaction\(\)/);
  assert.match(recordSection, /getCompletionToolRequirementStatus\(safeUnitId, normalizeOptionalInteger\(unit\.lot_id\), connection\)/);
  assert.match(recordSection, /evaluateCompletionToolRequirementEnforcement/);
  assert.match(recordSection, /TOOL_COMPLETION_OVERRIDE_REASON_REQUIRED/);
});

test('Tech Lead+ override is permanently audited in the same completion transaction', () => {
  const model = read('models/techUnitModel.js');
  const recordStart = model.lastIndexOf('async function recordUnitWorkCompletion');
  const recordSection = model.slice(recordStart, model.indexOf('function emptyCompletionReversalPreview', recordStart));
  assert.match(recordSection, /completion_tool_requirement_overridden/);
  assert.match(recordSection, /Tool Completion Requirement Override/);
  assert.match(recordSection, /missingToolSources/);
  assert.match(recordSection, /override_reason/);
  assert.match(recordSection, /createUnitAuditEvent\([\s\S]*\}, connection\)/);
  assert.match(recordSection, /await connection\.commit\(\)/);
});

test('completion requirement override never fabricates a Tool receipt', () => {
  const model = read('models/techUnitModel.js');
  const recordStart = model.lastIndexOf('async function recordUnitWorkCompletion');
  const recordSection = model.slice(recordStart, model.indexOf('function emptyCompletionReversalPreview', recordStart));
  assert.doesNotMatch(recordSection, /INSERT INTO unit_tool_runs/);
  assert.doesNotMatch(recordSection, /INSERT INTO unit_tool_observations/);
});

test('ordinary completion attribution and production-credit behavior remain in the existing workflow', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');
  assert.match(controller, /resolveCompletionUserId/);
  assert.match(model, /getCompletionProductionCycleState/);
  assert.match(model, /grants_production_credit/);
  assert.match(controller, /creditSource: 'manual_completion'/);
});
