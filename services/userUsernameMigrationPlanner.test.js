'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planUsernames } = require('./userUsernameMigrationPlanner');

test('existing users receive deterministic usernames in user_id order', () => {
  const plan = planUsernames([
    { user_id: 2, first_name: 'Natalie', last_name: 'Garcia', username: null },
    { user_id: 1, first_name: 'Nathan', last_name: 'Garrison', username: null },
    { user_id: 3, first_name: 'Nate', last_name: 'Gates', username: null }
  ]);

  assert.equal(plan.isValid, true);
  assert.deepEqual(plan.updates, [
    { userId: 1, username: 'NAGA', reason: 'backfill' },
    { userId: 2, username: 'NAGA2', reason: 'backfill' },
    { userId: 3, username: 'NAGA3', reason: 'backfill' }
  ]);
});

test('valid existing usernames are preserved and reserve collision suffixes', () => {
  const plan = planUsernames([
    { user_id: 1, first_name: 'Natalie', last_name: 'Garcia', username: 'NAGA' },
    { user_id: 2, first_name: 'Nathan', last_name: 'Garrison', username: null }
  ]);

  assert.equal(plan.isValid, true);
  assert.deepEqual(plan.updates, [
    { userId: 2, username: 'NAGA2', reason: 'backfill' }
  ]);
});

test('lowercase existing usernames are normalized without changing their identity', () => {
  const plan = planUsernames([
    { user_id: 1, first_name: 'Natalie', last_name: 'Garcia', username: 'naga2' }
  ]);

  assert.equal(plan.isValid, true);
  assert.deepEqual(plan.updates, [
    { userId: 1, username: 'NAGA2', reason: 'normalize' }
  ]);
});

test('duplicate or invalid existing usernames block the migration', () => {
  const duplicatePlan = planUsernames([
    { user_id: 1, first_name: 'Natalie', last_name: 'Garcia', username: 'NAGA' },
    { user_id: 2, first_name: 'Nathan', last_name: 'Garrison', username: 'naga' }
  ]);
  assert.equal(duplicatePlan.isValid, false);
  assert.match(duplicatePlan.errors.join(' '), /share username NAGA/);

  const invalidPlan = planUsernames([
    { user_id: 1, first_name: 'Natalie', last_name: 'Garcia', username: 'NAGA1' }
  ]);
  assert.equal(invalidPlan.isValid, false);
  assert.match(invalidPlan.errors.join(' '), /invalid existing username/);
});

test('users with insufficient name letters block automatic backfill', () => {
  const plan = planUsernames([
    { user_id: 1, first_name: 'Q', last_name: 'Smith', username: null }
  ]);

  assert.equal(plan.isValid, false);
  assert.match(plan.errors.join(' '), /cannot receive a generated username/);
});
