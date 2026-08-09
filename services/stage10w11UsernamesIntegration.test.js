'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('login accepts either email or the generated BWT username', () => {
  const authController = read('controllers/authController.js');
  const authModel = read('models/authModel.js');
  const loginView = read('views/pages/login.ejs');

  assert.match(authController, /normalizeLoginIdentifier\(req\.body\.identifier \|\| req\.body\.email\)/);
  assert.match(authController, /getUserByLoginIdentifier\(identifier\)/);
  assert.match(authController, /recordFailedLogin\(identifier\)/);
  assert.match(authModel, /WHERE LOWER\(u\.email\) = \?\s+OR u\.username = \?/);
  assert.match(authModel, /WHERE LOWER\(email\) = \?\s+OR username = \?/);
  assert.match(loginView, /Email or Username/);
  assert.match(loginView, /name="identifier"/);
  assert.doesNotMatch(loginView, /type="email"\s+name="identifier"/);
});

test('new users receive a stable collision-safe username inside the account transaction', () => {
  const authModel = read('models/authModel.js');
  const policy = read('services/userUsernamePolicy.js');

  assert.match(policy, /firstLetters\.slice\(0, 2\)/);
  assert.match(policy, /lastLetters\.slice\(0, 2\)/);
  assert.match(policy, /for \(let suffix = 2; ; suffix \+= 1\)/);
  assert.match(authModel, /SELECT username\s+FROM users\s+WHERE username = \?\s+OR username LIKE CONCAT\(\?, '%'\)\s+FOR UPDATE/);
  assert.match(authModel, /const username = existingRows\[0\]\.username\s+\? normalizeUsername/);
  assert.match(authModel, /INSERT INTO users \([\s\S]*?username,[\s\S]*?email/);
  assert.match(authModel, /await connection\.beginTransaction\(\)/);
  assert.match(authModel, /await connection\.commit\(\)/);
  assert.match(authModel, /await connection\.rollback\(\)/);
});

test('profile and role edits preserve the already-issued username', () => {
  const managementModel = read('models/managementModel.js');
  const profileFunction = managementModel.match(/async function updateUserProfile[\s\S]*?\n}\n/)?.[0] || '';
  const roleFunction = managementModel.match(/async function updateUserWithRoles[\s\S]*?\n}\n/)?.[0] || '';

  assert.ok(profileFunction);
  assert.ok(roleFunction);
  assert.doesNotMatch(profileFunction, /username\s*=/);
  assert.doesNotMatch(roleFunction, /username\s*=/);
});

test('management pages expose the username without allowing manual edits', () => {
  const usersPage = read('views/pages/management-users.ejs');
  const editModal = read('views/fragments/management-user-edit-modal.ejs');
  const setupLink = read('views/pages/management-setup-link.ejs');
  const newUserPage = read('views/pages/management-user-new.ejs');

  assert.match(usersPage, /Username: <b><%= user\.username/);
  assert.match(editModal, /<span>BWT Username<\/span>/);
  assert.match(editModal, /value="<%= user\.username \|\| '' %>" readonly/);
  assert.doesNotMatch(editModal, /name="username"/);
  assert.match(setupLink, /Name \/ BWT Username/);
  assert.match(newUserPage, /Natalie Garcia becomes NAGA; a duplicate becomes NAGA2/);
  assert.match(newUserPage, /username remains stable after account creation/i);
});

test('current-user and management readers include username for future API identity matching', () => {
  const authModel = read('models/authModel.js');
  const managementModel = read('models/managementModel.js');

  const currentUserReader = authModel.match(/async function getUserByIdWithRoles[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(currentUserReader, /u\.username/);
  assert.match(currentUserReader, /GROUP BY[\s\S]*?u\.username/);
  assert.match(managementModel, /async function listUsers[\s\S]*?u\.username/);
  assert.match(managementModel, /async function getUserById[\s\S]*?u\.username/);
});

test('migration is dry-run by default, resumable, and verifies data before enforcing constraints', () => {
  const migration = read('scripts/migrateUsernames.js');

  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /No database changes were made\. Re-run with --apply/);
  assert.match(migration, /ADD COLUMN username VARCHAR\(32\)/);
  assert.match(migration, /MODIFY COLUMN username VARCHAR\(\$\{usernameColumnLength\}\)[\s\S]*?NOT NULL/);
  assert.match(migration, /ADD UNIQUE INDEX \$\{USERNAME_INDEX_NAME\} \(username\)/);
  assert.match(migration, /ADD CONSTRAINT \$\{USERNAME_CHECK_NAME\}/);
  assert.match(migration, /Expected VARCHAR\(32\) or larger; refusing destructive replacement/);
  assert.match(migration, /await verifyUsernameData\(connection\)/);
});

test('live validator exercises email lookup, username lookup, suffix allocation, and rollback', () => {
  const validator = read('scripts/validateStage10w11UsernameLoginLivePath.js');

  assert.match(validator, /getUserByLoginIdentifier\(fixture\.stem\.toLowerCase\(\), connection\)/);
  assert.match(validator, /getUserByLoginIdentifier\(email\.toUpperCase\(\), connection\)/);
  assert.match(validator, /allocateUsernameWithConnection/);
  assert.match(validator, /collisionUsername === `\$\{fixture\.stem\}2`/);
  assert.match(validator, /await connection\.rollback\(\)/);
  assert.match(validator, /All temporary users were rolled back/);
});

test('package exposes separate audit, migration, static validation, and live-path commands', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:usernames'], 'node scripts/migrateUsernames.js');
  assert.equal(packageJson.scripts['migrate:usernames'], 'node scripts/migrateUsernames.js --apply');
  assert.match(packageJson.scripts['validate:usernames'], /stage10w11UsernamesIntegration\.test\.js/);
  assert.match(packageJson.scripts['validate:username-login-live-path'], /validateStage10w11UsernameLoginLivePath\.js/);
});
