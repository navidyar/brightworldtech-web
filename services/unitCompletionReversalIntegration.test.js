'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('completion reversal routes require Tech Lead or higher roles', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /const completionReversalRoles = \['admin', 'management', 'tech_lead'\]/);
  assert.match(routes, /completions\/:completionId\/reverse\/modal[\s\S]*?requireRole\(completionReversalRoles\)/);
  assert.match(routes, /completions\/:completionId\/reverse'[\s\S]*?requireRole\(completionReversalRoles\)/);
});

test('completion reversal is durable, reasoned, and written to Unit audit history', () => {
  const model = read('models/techUnitModel.js');
  const modal = read('views/fragments/tech-unit-reverse-completion-modal.ejs');

  assert.match(modal, /textarea name="reason"[\s\S]*?required/);
  assert.match(model, /SET reversed_at = CURRENT_TIMESTAMP\(6\),[\s\S]*?reversed_by_user_id = \?,[\s\S]*?reversal_reason = \?/);
  assert.match(model, /eventType: 'unit_completion_reversed'/);
  assert.match(model, /eventSummary: 'Undid Unit completion'/);
  assert.match(model, /createUnitAuditEvent\([\s\S]*?, connection\);[\s\S]*?await connection\.commit\(\)/);
});

test('reversed completion credits are excluded from active UI and productivity queries', () => {
  const unitModel = read('models/techUnitModel.js');
  const dashboardModel = read('models/dashboardModel.js');
  const overrideModel = read('models/overrideRequestModel.js');

  assert.match(unitModel, /credit_source = 'manual_completion'[\s\S]*?reversed_at IS NULL/);
  assert.match(dashboardModel, /const whereParts = \[`\$\{alias\}\.reversed_at IS NULL`\]/);
  assert.match(overrideModel, /completion_check\.reversed_at IS NULL/);
});

test('the database permits a new active completion after an earlier completion is reversed', () => {
  const migration = read('sql/2026-07-stage-6c-unit-completion-reversal.sql');

  assert.match(migration, /active_work_cycle_key VARCHAR\(191\)[\s\S]*?WHEN reversed_at IS NULL THEN work_cycle_key/);
  assert.match(migration, /UNIQUE KEY uniq_unit_work_completions_active_cycle \(active_work_cycle_key\)/);
  assert.doesNotMatch(migration, /DELETE FROM unit_work_completions/);
});


test('Unit Browser completion state is limited to the current Lot stay', () => {
  const unitModel = read('models/techUnitModel.js');

  assert.match(unitModel, /current_unit\.lot_id AS current_lot_id/);
  assert.match(unitModel, /current_lot_history_id/);
  assert.match(unitModel, /expectedWorkCycleKey/);
  assert.match(unitModel, /row\.work_cycle_key && row\.work_cycle_key !== expectedWorkCycleKey/);
});
