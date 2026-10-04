'use strict';

const COMMON_TOOL_PINS = new Set([
  '000000', '111111', '123456', '654321',
  '121212', '112233', '123123', '101010'
]);

function hasSequentialRun(pin, minimumLength = 4) {
  const digits = String(pin || '').split('').map(Number);
  for (let start = 0; start <= digits.length - minimumLength; start += 1) {
    for (const direction of [1, -1]) {
      let length = 1;
      for (let index = start + 1; index < digits.length; index += 1) {
        const expected = (digits[index - 1] + direction + 10) % 10;
        if (digits[index] !== expected) break;
        length += 1;
        if (length >= minimumLength) return true;
      }
    }
  }
  return false;
}

function hasRepeatedBlock(pin) {
  const value = String(pin || '');
  return /^(\d{4})\1$/.test(value);
}


function hasGroupedPattern(pin) {
  const value = String(pin || '');
  const pairMatch = value.match(/^(\d)\1(\d)\2(\d)\3$/);
  const tripleMatch = value.match(/^(\d)\1\1(\d)\2\2$/);
  return Boolean(pairMatch || tripleMatch);
}

function validateToolPin(pin, confirmPin) {
  const safePin = String(pin || '').trim();
  const safeConfirm = String(confirmPin || '').trim();
  const errors = [];

  if (!/^\d{6,10}$/.test(safePin)) {
    errors.push('Tool PIN must be 6 to 10 digits.');
    if (safePin !== safeConfirm) errors.push('Tool PIN confirmation does not match.');
    return errors;
  }

  if (safePin !== safeConfirm) errors.push('Tool PIN confirmation does not match.');

  if (/^(\d)\1{5,9}$/.test(safePin)) {
    errors.push('Choose a less predictable Tool PIN. Repeating the same digit is not allowed.');
  } else if (hasSequentialRun(safePin, 4)) {
    errors.push('Choose a less predictable Tool PIN. Sequences of 4 or more digits are not allowed.');
  } else if (hasRepeatedBlock(safePin)) {
    errors.push('Choose a less predictable Tool PIN. Repeating 4-digit blocks are not allowed.');
  } else if (hasGroupedPattern(safePin)) {
    errors.push('Choose a less predictable Tool PIN. Simple paired or grouped digit patterns are not allowed.');
  } else if (COMMON_TOOL_PINS.has(safePin)) {
    errors.push('Choose a less predictable Tool PIN. That PIN is too common.');
  }

  return errors;
}

module.exports = {
  COMMON_TOOL_PINS,
  hasGroupedPattern,
  hasRepeatedBlock,
  hasSequentialRun,
  validateToolPin
};
