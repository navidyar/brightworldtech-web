'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('user profile migration adds nullable phone, personal email, start date, and end date fields', () => {
  const source = read('scripts/migrateUserProfileFields.js');

  assert.match(source, /columnName: 'phone'[\s\S]*definition: 'VARCHAR\(50\) NULL'/);
  assert.match(source, /columnName: 'personal_email'[\s\S]*definition: 'VARCHAR\(255\) NULL'/);
  assert.match(source, /columnName: 'start_date'[\s\S]*definition: 'DATE NULL'/);
  assert.match(source, /columnName: 'end_date'[\s\S]*definition: 'DATE NULL'/);
  assert.match(source, /No database changes were made/);
});

test('create and edit user forms expose the four optional profile fields', () => {
  for (const file of [
    'views/fragments/management-user-create-modal.ejs',
    'views/fragments/management-user-edit-modal.ejs',
    'views/pages/management-user-new.ejs'
  ]) {
    const source = read(file);
    assert.match(source, /name="phone"/);
    assert.match(source, /name="personalEmail"/);
    assert.match(source, /name="startDate"/);
    assert.match(source, /name="endDate"/);
    assert.match(source, /type="tel"/);
    assert.match(source, /type="date"/);
  }
});

test('management controller normalizes and validates optional profile data', () => {
  const source = read('controllers/managementController.js');

  assert.match(source, /normalizeOptionalUserEmail/);
  assert.match(source, /normalizeOptionalDate/);
  assert.match(source, /Personal Email must be a valid email address when provided/);
  assert.match(source, /End Date cannot be before Start Date/);
  assert.match(source, /personalEmail,\s*phone,\s*startDate,\s*endDate,\s*roleCodes: validRoleCodes/);
});

test('user creation and updates persist all optional profile fields', () => {
  const authSource = read('models/authModel.js');
  const managementSource = read('models/managementModel.js');

  assert.match(authSource, /personal_email = \?/);
  assert.match(authSource, /phone = \?/);
  assert.match(authSource, /start_date = \?/);
  assert.match(authSource, /end_date = \?/);
  assert.match(authSource, /personal_email,[\s\S]*phone,[\s\S]*start_date,[\s\S]*end_date,[\s\S]*is_active/);

  assert.match(managementSource, /personal_email = \?/);
  assert.match(managementSource, /phone = \?/);
  assert.match(managementSource, /start_date = \?/);
  assert.match(managementSource, /end_date = \?/);
  assert.match(managementSource, /DATE_FORMAT\(u\.start_date, '%Y-%m-%d'\) AS start_date/);
  assert.match(managementSource, /DATE_FORMAT\(u\.end_date, '%Y-%m-%d'\) AS end_date/);
});

test('user list surfaces optional contact and employment dates without changing account status semantics', () => {
  const source = read('views/pages/management-users.ejs');

  assert.match(source, /Personal: <%= user\.personal_email %>/);
  assert.match(source, /Phone: <%= user\.phone %>/);
  assert.match(source, /Start: <%= user\.start_date %>/);
  assert.match(source, /End: <%= user\.end_date %>/);
});

test('package exposes audit, migrate, and focused validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:user-profile-fields'], 'node scripts/migrateUserProfileFields.js');
  assert.equal(packageJson.scripts['migrate:user-profile-fields'], 'node scripts/migrateUserProfileFields.js --apply');
  assert.match(packageJson.scripts['validate:user-profile-fields'], /stage10w69bUserProfileFields\.test\.js/);
});
