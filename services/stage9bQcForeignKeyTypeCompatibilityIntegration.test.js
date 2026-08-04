'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('QC migration derives every foreign-key column type from the referenced live schema', () => {
  const migration = read('sql/2026-07-stage-9b-qc-review-workflow.sql');

  assert.match(migration, /FROM information_schema\.COLUMNS[\s\S]*?TABLE_NAME = 'units'[\s\S]*?COLUMN_NAME = 'unit_id'/);
  assert.match(migration, /FROM information_schema\.COLUMNS[\s\S]*?TABLE_NAME = 'unit_work_completions'[\s\S]*?COLUMN_NAME = 'unit_work_completion_id'/);
  assert.match(migration, /FROM information_schema\.COLUMNS[\s\S]*?TABLE_NAME = 'users'[\s\S]*?COLUMN_NAME = 'user_id'/);
  assert.match(migration, /'unit_id ', unit_id_type, ' NOT NULL,'/);
  assert.match(migration, /'unit_work_completion_id ', completion_id_type, ' NOT NULL,'/);
  assert.match(migration, /'reviewed_by_user_id ', reviewer_id_type, ' NOT NULL,'/);
  assert.doesNotMatch(migration, /unit_work_completion_id BIGINT UNSIGNED NOT NULL/);
});

test('QC migration preflights referenced IDs before replacing an empty legacy table', () => {
  const script = read('scripts/apply-stage-9b-qc-review-workflow.sh');
  const preflightIndex = script.indexOf('parent_readiness=');
  const dropIndex = script.indexOf('DROP TABLE unit_qc_checks');

  assert.ok(preflightIndex >= 0);
  assert.ok(dropIndex > preflightIndex);
  assert.match(script, /expected 3:3/);
  assert.match(script, /Using live foreign-key column types/);
});

test('QC readiness validation requires all three child and parent types to match', () => {
  const applyScript = read('scripts/apply-stage-9b-qc-review-workflow.sh');
  const validator = read('scripts/validateStage9bQcReviewWorkflow.js');
  const checkScript = read('scripts/check-stage-9b-qc-review-storage.sh');

  assert.match(applyScript, /expected 1:1:7:5:3:3/);
  assert.match(applyScript, /LOWER\(child_column\.COLUMN_TYPE\) = LOWER\(parent_column\.COLUMN_TYPE\)/);
  assert.match(validator, /EXPECTED_TYPE_PAIRS/);
  assert.match(validator, /childType !== parentType/);
  assert.match(checkScript, /type_matches/);
});
