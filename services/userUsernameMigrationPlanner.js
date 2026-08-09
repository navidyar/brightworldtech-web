'use strict';

const {
  buildUsernameStem,
  isValidUsername,
  nextAvailableUsername,
  normalizeUsername
} = require('./userUsernamePolicy');

function normalizeUserId(value) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function planUsernames(users = []) {
  const rows = Array.isArray(users) ? users.slice() : [];
  rows.sort((left, right) => Number(left.user_id) - Number(right.user_id));

  const errors = [];
  const updates = [];
  const assigned = new Set();
  const owners = new Map();

  for (const row of rows) {
    const userId = normalizeUserId(row.user_id);
    const existingUsername = normalizeUsername(row.username);

    if (!userId) {
      errors.push('A user row has an invalid user_id.');
      continue;
    }

    if (!existingUsername) {
      continue;
    }

    if (!isValidUsername(existingUsername)) {
      errors.push(`User ${userId} has an invalid existing username: ${existingUsername}.`);
      continue;
    }

    if (owners.has(existingUsername)) {
      errors.push(`Users ${owners.get(existingUsername)} and ${userId} share username ${existingUsername}.`);
      continue;
    }

    owners.set(existingUsername, userId);
    assigned.add(existingUsername);

    if (String(row.username || '').trim() !== existingUsername) {
      updates.push({ userId, username: existingUsername, reason: 'normalize' });
    }
  }

  for (const row of rows) {
    const userId = normalizeUserId(row.user_id);
    const existingUsername = normalizeUsername(row.username);

    if (!userId || existingUsername) {
      continue;
    }

    try {
      const stem = buildUsernameStem(row.first_name, row.last_name);
      const username = nextAvailableUsername(stem, Array.from(assigned));
      assigned.add(username);
      owners.set(username, userId);
      updates.push({ userId, username, reason: 'backfill' });
    } catch (error) {
      errors.push(`User ${userId} (${row.first_name || ''} ${row.last_name || ''}) cannot receive a generated username: ${error.message}`);
    }
  }

  const finalRows = rows.map((row) => {
    const update = updates.find((candidate) => candidate.userId === Number(row.user_id));
    return {
      ...row,
      username: update ? update.username : normalizeUsername(row.username)
    };
  });

  const finalUsernames = finalRows.map((row) => normalizeUsername(row.username)).filter(Boolean);

  if (finalUsernames.length !== rows.length) {
    errors.push('At least one user would remain without a username.');
  }

  if (new Set(finalUsernames).size !== finalUsernames.length) {
    errors.push('The planned usernames are not unique.');
  }

  return {
    users: rows,
    updates,
    finalRows,
    errors: Array.from(new Set(errors)),
    isValid: errors.length === 0
  };
}

module.exports = {
  normalizeUserId,
  planUsernames
};
