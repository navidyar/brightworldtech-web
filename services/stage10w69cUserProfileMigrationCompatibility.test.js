'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/migrateUserProfileFields.js'), 'utf8');

test('existing shorter nullable varchar profile columns are planned for safe widening', () => {
  assert.match(source, /currentLength < target\.minimumLength/);
  assert.match(source, /plannedChanges\.push\(`widen_\$\{target\.columnName\}`\)/);
  assert.doesNotMatch(source, /if \(compatible && target\.expectedType === 'varchar'\)/);
});

test('profile migration widens compatible varchar columns without dropping data', () => {
  assert.match(source, /plannedChanges\.includes\(`widen_\$\{target\.columnName\}`\)/);
  assert.match(source, /ALTER TABLE users MODIFY COLUMN/);
  assert.doesNotMatch(source, /DROP COLUMN/);
});
