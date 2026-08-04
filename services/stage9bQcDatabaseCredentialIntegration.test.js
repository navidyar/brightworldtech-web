'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shared MySQL runner uses the application database account without command-line passwords', () => {
  const script = read('scripts/mysql-app.sh');

  assert.match(script, /MYSQL_USER/);
  assert.match(script, /MYSQL_PASSWORD/);
  assert.match(script, /MYSQL_DATABASE/);
  assert.match(script, /export MYSQL_PWD="\$MYSQL_PASSWORD"/);
  assert.match(script, /mysql --protocol=socket -u "\$MYSQL_USER" "\$MYSQL_DATABASE"/);
  assert.doesNotMatch(script, /MYSQL_ROOT_PASSWORD/);
  assert.doesNotMatch(script, /-p["'$]/);
});

test('all Stage 9B database scripts use the shared application-account runner', () => {
  const paths = [
    'scripts/apply-stage-9b-qc-review-workflow.sh',
    'scripts/check-stage-9b-qc-review-storage.sh',
    'scripts/rollback-stage-9b-qc-review-workflow.sh'
  ];

  for (const relativePath of paths) {
    const script = read(relativePath);
    assert.match(script, /scripts\/mysql-app\.sh/, relativePath);
    assert.doesNotMatch(script, /MYSQL_ROOT_PASSWORD/, relativePath);
    assert.doesNotMatch(script, /-u root/, relativePath);
  }
});

test('Stage 9B migration still applies SQL before enforcing readiness', () => {
  const script = read('scripts/apply-stage-9b-qc-review-workflow.sh');
  const migrationIndex = script.indexOf('2026-07-stage-9b-qc-review-workflow.sql');
  const readinessIndex = script.lastIndexOf('readiness=');
  const successIndex = script.indexOf('migration verified complete');

  assert.ok(migrationIndex >= 0);
  assert.ok(readinessIndex > migrationIndex);
  assert.ok(successIndex > readinessIndex);
});
