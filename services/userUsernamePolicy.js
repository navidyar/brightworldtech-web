'use strict';

const USERNAME_STEM_LENGTH = 4;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[A-Z]{4}(?:[2-9]|[1-9][0-9]+)?$/;

function normalizeNameLetters(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function buildUsernameStem(firstName, lastName) {
  const firstLetters = normalizeNameLetters(firstName);
  const lastLetters = normalizeNameLetters(lastName);

  if (firstLetters.length < 2 || lastLetters.length < 2) {
    throw new Error('First and last names must each contain at least two letters to generate a username.');
  }

  return `${firstLetters.slice(0, 2)}${lastLetters.slice(0, 2)}`;
}

function normalizeUsername(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidUsername(value) {
  const username = normalizeUsername(value);
  return username.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(username);
}

function nextAvailableUsername(stem, existingUsernames = []) {
  const normalizedStem = normalizeUsername(stem);

  if (!/^[A-Z]{4}$/.test(normalizedStem)) {
    throw new Error('Username stem must contain exactly four letters.');
  }

  const used = new Set(
    (Array.isArray(existingUsernames) ? existingUsernames : [])
      .map(normalizeUsername)
      .filter(Boolean)
  );

  if (!used.has(normalizedStem)) {
    return normalizedStem;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${normalizedStem}${suffix}`;

    if (candidate.length > USERNAME_MAX_LENGTH) {
      throw new Error(`Unable to allocate a username within ${USERNAME_MAX_LENGTH} characters.`);
    }

    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function generateUsername({ firstName, lastName, existingUsernames = [] }) {
  return nextAvailableUsername(buildUsernameStem(firstName, lastName), existingUsernames);
}

module.exports = {
  USERNAME_STEM_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  normalizeNameLetters,
  buildUsernameStem,
  normalizeUsername,
  isValidUsername,
  nextAvailableUsername,
  generateUsername
};
