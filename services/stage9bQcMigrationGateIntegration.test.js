'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stage 9B migration applies SQL before checking database readiness', () => {
  const script = read('scripts/apply-stage-9b-qc-review-workflow.sh');
  const migrationIndex = script.indexOf('2026-07-stage-9b-qc-review-workflow.sql');
  const readinessIndex = script.lastIndexOf('readiness=');
  const successIndex = script.indexOf('migration verified complete');

  assert.ok(migrationIndex >= 0);
  assert.ok(readinessIndex > migrationIndex);
  assert.ok(successIndex > readinessIndex);
});

test('Stage 9B migration gate verifies role, table, and seven required columns', () => {
  const script = read('scripts/apply-stage-9b-qc-review-workflow.sh');
  assert.match(script, /name = 'Quality Control'/);
  assert.match(script, /TABLE_NAME = 'unit_qc_checks'/);
  assert.match(script, /unit_qc_check_id/);
  assert.match(script, /unit_work_completion_id/);
  assert.match(script, /reviewed_by_user_id/);
  assert.match(script, /expected 1:1:7:5:3:3/);
  assert.match(script, /information_schema\.STATISTICS/);
  assert.match(script, /information_schema\.REFERENTIAL_CONSTRAINTS/);
  assert.match(script, /LOWER\(child_column\.COLUMN_TYPE\) = LOWER\(parent_column\.COLUMN_TYPE\)/);
});

test('A standalone QC storage inspection command is available', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['check:qc-review-storage'],
    'bash scripts/check-stage-9b-qc-review-storage.sh'
  );

  const checkScript = read('scripts/check-stage-9b-qc-review-storage.sh');
  assert.match(checkScript, /information_schema\.TABLES/);
  assert.match(checkScript, /information_schema\.COLUMNS/);
});
