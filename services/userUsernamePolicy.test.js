'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeNameLetters,
  buildUsernameStem,
  normalizeUsername,
  isValidUsername,
  nextAvailableUsername,
  generateUsername
} = require('./userUsernamePolicy');

test('username stem uses the first two letters from first and last name', () => {
  assert.equal(buildUsernameStem('Natalie', 'Garcia'), 'NAGA');
  assert.equal(generateUsername({ firstName: 'John', lastName: 'Smith' }), 'JOSM');
});

test('name normalization removes punctuation and diacritics before selecting letters', () => {
  assert.equal(normalizeNameLetters("Élise-Jane"), 'ELISEJANE');
  assert.equal(buildUsernameStem("Élise-Jane", "O'Connor"), 'ELOC');
});

test('duplicate stems receive the lowest available numeric suffix beginning at 2', () => {
  assert.equal(nextAvailableUsername('NAGA', ['NAGA']), 'NAGA2');
  assert.equal(nextAvailableUsername('NAGA', ['NAGA', 'NAGA2']), 'NAGA3');
  assert.equal(nextAvailableUsername('NAGA', ['NAGA', 'NAGA3']), 'NAGA2');
  assert.equal(
    nextAvailableUsername('NAGA', ['NAGA', 'NAGA2', 'NAGA3', 'NAGA4', 'NAGA5', 'NAGA6', 'NAGA7', 'NAGA8', 'NAGA9']),
    'NAGA10'
  );
});

test('usernames are normalized and validated case-insensitively', () => {
  assert.equal(normalizeUsername(' naga2 '), 'NAGA2');
  assert.equal(isValidUsername('naga2'), true);
  assert.equal(isValidUsername('NAGA1'), false);
  assert.equal(isValidUsername('NAGA10'), true);
  assert.equal(isValidUsername('NAG-A'), false);
});

test('generation refuses names without two usable letters in each segment', () => {
  assert.throws(() => buildUsernameStem('Q', 'Smith'), /at least two letters/);
  assert.throws(() => buildUsernameStem('John', "O'"), /at least two letters/);
});
