'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const applyScript = path.join(root, 'scripts/apply-stage-9b-qc-review-workflow.sh');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createStubRunner({ rowCount = 0, initialState = 'legacy' } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage9b-qc-repair-'));
  const runnerPath = path.join(tempDir, 'mysql-stub.sh');
  const statePath = path.join(tempDir, 'state');
  const logPath = path.join(tempDir, 'queries.log');

  fs.writeFileSync(statePath, `${initialState}\n`);
  fs.writeFileSync(logPath, '');
  fs.writeFileSync(
    runnerPath,
    `#!/usr/bin/env bash
set -euo pipefail
sql="$(cat)"
printf '%s\\n---\\n' "$sql" >> "$STUB_LOG_FILE"
state="$(tr -d '[:space:]' < "$STUB_STATE_FILE")"

if grep -q "SUM(DATA_TYPE IN" <<< "$sql"; then
  printf '%s\n' '3:3'
  exit 0
fi

if grep -q "Using live foreign-key column types" <<< "$sql"; then
  printf '%s\n' 'units.unit_id=bigint;unit_work_completions.unit_work_completion_id=bigint;users.user_id=int'
  exit 0
fi

if grep -q "GROUP_CONCAT(" <<< "$sql" && grep -q "COLUMN_TYPE" <<< "$sql"; then
  printf '%s\n' 'units.unit_id=bigint;unit_work_completions.unit_work_completion_id=bigint;users.user_id=int'
  exit 0
fi

if grep -q "CREATE TABLE IF NOT EXISTS unit_qc_checks" <<< "$sql"; then
  printf '%s\\n' canonical > "$STUB_STATE_FILE"
  exit 0
fi

if grep -q "DROP TABLE unit_qc_checks" <<< "$sql"; then
  printf '%s\\n' absent > "$STUB_STATE_FILE"
  exit 0
fi

if grep -q "FROM roles WHERE code = 'qc'" <<< "$sql"; then
  if [[ "$state" == canonical ]]; then
    printf '%s\\n' '1:1:7:5:3:3'
  else
    printf '%s\\n' '1:1:2:1:0'
  fi
  exit 0
fi

if grep -q "SELECT COUNT(\\*) FROM unit_qc_checks" <<< "$sql"; then
  printf '%s\\n' "$STUB_ROW_COUNT"
  exit 0
fi

if grep -q "SELECT CONCAT(" <<< "$sql"; then
  if [[ "$state" == canonical ]]; then
    printf '%s\\n' '7:5:3'
  else
    printf '%s\\n' '2:1:0'
  fi
  exit 0
fi

if grep -q "FROM information_schema.TABLES" <<< "$sql"; then
  if [[ "$state" == absent ]]; then
    printf '%s\\n' '0'
  else
    printf '%s\\n' '1'
  fi
  exit 0
fi

printf 'Unhandled SQL in test stub:\\n%s\\n' "$sql" >&2
exit 2
`
  );
  fs.chmodSync(runnerPath, 0o755);

  return { tempDir, runnerPath, statePath, logPath, rowCount };
}

function runMigration(stub) {
  return spawnSync('bash', [applyScript], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MYSQL_RUNNER: stub.runnerPath,
      STUB_STATE_FILE: stub.statePath,
      STUB_LOG_FILE: stub.logPath,
      STUB_ROW_COUNT: String(stub.rowCount)
    }
  });
}

test('migration replaces an empty incompatible legacy QC table and verifies the canonical schema', () => {
  const stub = createStubRunner({ rowCount: 0 });

  try {
    const result = runMigration(stub);
    const log = fs.readFileSync(stub.logPath, 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Replacing empty legacy unit_qc_checks table/);
    assert.match(result.stdout, /migration verified complete/);
    assert.match(log, /DROP TABLE unit_qc_checks/);
    assert.match(log, /CREATE TABLE IF NOT EXISTS unit_qc_checks/);
    assert.equal(fs.readFileSync(stub.statePath, 'utf8').trim(), 'canonical');
  } finally {
    fs.rmSync(stub.tempDir, { recursive: true, force: true });
  }
});

test('migration refuses to remove an incompatible QC table that contains legacy rows', () => {
  const stub = createStubRunner({ rowCount: 3 });

  try {
    const result = runMigration(stub);
    const log = fs.readFileSync(stub.logPath, 'utf8');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /incompatible unit_qc_checks table with 3 existing row\(s\)/);
    assert.match(result.stderr, /will not remove or rewrite legacy QC data automatically/);
    assert.doesNotMatch(log, /DROP TABLE unit_qc_checks/);
    assert.doesNotMatch(log, /CREATE TABLE IF NOT EXISTS unit_qc_checks/);
    assert.equal(fs.readFileSync(stub.statePath, 'utf8').trim(), 'legacy');
  } finally {
    fs.rmSync(stub.tempDir, { recursive: true, force: true });
  }
});

test('migration verifies columns, indexes, and foreign keys instead of table existence alone', () => {
  const script = read('scripts/apply-stage-9b-qc-review-workflow.sh');

  assert.match(script, /existing_signature/);
  assert.match(script, /information_schema\.STATISTICS/);
  assert.match(script, /information_schema\.REFERENTIAL_CONSTRAINTS/);
  assert.match(script, /expected 1:1:7:5:3:3/);
  assert.match(script, /existing_row_count/);
});
