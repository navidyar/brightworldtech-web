'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadQcJoinBuilder() {
  const model = read('models/techUnitModel.js');
  const start = model.indexOf('function getQcReviewStateJoinSql(');
  const end = model.indexOf('\nfunction getQcReviewStateSelectSql', start);

  assert.ok(start >= 0 && end > start, 'QC join builder should be extractable');

  const context = {};
  vm.runInNewContext(`${model.slice(start, end)}; this.builder = getQcReviewStateJoinSql;`, context);
  return context.builder;
}

test('QC queue current completion uses the same lot and work-cycle safeguards as Unit rows', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /completion\.lot_id = completion_unit\.lot_id/);
  assert.match(model, /PARTITION BY history\.unit_id, history\.to_lot_id/);
  assert.match(model, /current_cycle\.to_lot_id = completion_unit\.lot_id/);
  assert.match(model, /completion\.work_cycle_key = CASE/);
  assert.match(model, /const currentCycleHistoryIdSql = lotHistoryTableIsReady[\s\S]*current_cycle\.unit_lot_history_id/);
  assert.match(model, /CONCAT\(\s*'move:'[\s\S]*\$\{currentCycleHistoryIdSql\}/);
  assert.match(model, /CONCAT\('initial:', completion\.unit_id, ':', completion_unit\.lot_id\)/);
  assert.match(model, /const currentCycleStartedAtSql = lotHistoryTableIsReady[\s\S]*COALESCE\(current_cycle\.moved_at, completion_unit\.created_at\)/);
  assert.match(model, /completion\.work_cycle_key IS NULL[\s\S]*completion\.completed_at >= \$\{currentCycleStartedAtSql\}/);
});

test('generated QC join excludes completions from previous lots and work cycles', () => {
  const buildJoin = loadQcJoinBuilder();
  const sql = buildJoin(true, {
    lotHistoryTableIsReady: true,
    completionHasWorkCycleKey: true
  });

  assert.match(sql, /completion\.lot_id = completion_unit\.lot_id/);
  assert.match(sql, /current_cycle\.to_lot_id = completion_unit\.lot_id/);
  assert.match(sql, /completion\.work_cycle_key = CASE/);
  assert.match(sql, /completion\.completed_at >= COALESCE\(current_cycle\.moved_at, completion_unit\.created_at\)/);
  assert.doesNotMatch(sql, /\$\{/);

  const legacySql = buildJoin(true, {
    lotHistoryTableIsReady: false,
    completionHasWorkCycleKey: false
  });
  assert.match(legacySql, /completion\.lot_id = completion_unit\.lot_id/);
  assert.match(legacySql, /completion\.completed_at >= completion_unit\.created_at/);
  assert.doesNotMatch(legacySql, /unit_lot_history/);
});

test('QC queue schema readiness requires completion lot identity', () => {
  const model = read('models/techUnitModel.js');

  assert.match(
    model,
    /const qcReviewSchemaIsReady = \[[\s\S]*'unit_work_completion_id'[\s\S]*'unit_id'[\s\S]*'lot_id'[\s\S]*'credit_source'[\s\S]*'completed_at'[\s\S]*'reversed_at'/
  );
});

test('QC counts and filter share one canonical current-completion join', () => {
  const model = read('models/techUnitModel.js');

  const joinDefinitionCount = (model.match(/function getQcReviewStateJoinSql\(/g) || []).length;
  const joinCallCount = (model.match(/getQcReviewStateJoinSql\(qcReviewSchemaIsReady,/g) || []).length;

  assert.equal(joinDefinitionCount, 1);
  assert.equal(joinCallCount, 1);
  assert.ok(model.indexOf('const baseUnitFromSql') < model.indexOf('const qcReviewConditionSql'));
  assert.match(model, /qc_current_completion\.unit_work_completion_id IS NOT NULL[\s\S]*qc_review_state\.latest_decision_code IS NULL/);
});

test('authoritative Unit-row completion lookup retains the same cycle rules', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /if \(!currentLotId \|\| currentLotId !== completionLotId\)/);
  assert.match(model, /const expectedWorkCycleKey = currentHistoryId/);
  assert.match(model, /if \(row\.work_cycle_key && row\.work_cycle_key !== expectedWorkCycleKey\)/);
  assert.match(model, /completedAt < cycleStart/);
});
