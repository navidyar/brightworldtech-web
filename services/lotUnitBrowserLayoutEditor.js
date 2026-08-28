'use strict';

const { MAX_VISIBLE_OPTIONAL_COLUMNS, listUnitBrowserOptionalColumns } = require('../config/unitBrowserColumnRegistry');

class LotUnitBrowserLayoutEditorError extends Error {
  constructor(messages) {
    const normalizedMessages = Array.isArray(messages) ? messages : [String(messages || 'Invalid Unit Browser configuration.')];
    super(normalizedMessages[0]);
    this.name = 'LotUnitBrowserLayoutEditorError';
    this.messages = normalizedMessages;
    this.code = 'BWT_LOT_UNIT_BROWSER_LAYOUT_INVALID';
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function normalizeSubmittedLotUnitBrowserLayout({ columnOrder, visibleColumns }) {
  const definitions = listUnitBrowserOptionalColumns();
  const expectedKeys = definitions.map((column) => column.key);
  const expectedKeySet = new Set(expectedKeys);
  const orderedKeys = toStringArray(columnOrder);
  const visibleKeys = toStringArray(visibleColumns);
  const errors = [];

  if (orderedKeys.length !== expectedKeys.length) {
    errors.push('The Unit Browser display-group order is incomplete. Reload the modal and try again.');
  }

  if (new Set(orderedKeys).size !== orderedKeys.length) {
    errors.push('The Unit Browser display-group order contains a duplicate entry.');
  }

  const unknownOrderedKeys = orderedKeys.filter((key) => !expectedKeySet.has(key));
  if (unknownOrderedKeys.length > 0) {
    errors.push(`Unknown Unit Browser display group: ${unknownOrderedKeys[0]}.`);
  }

  const missingKeys = expectedKeys.filter((key) => !orderedKeys.includes(key));
  if (missingKeys.length > 0) {
    errors.push(`Missing Unit Browser display group: ${missingKeys[0]}.`);
  }

  const unknownVisibleKeys = visibleKeys.filter((key) => !expectedKeySet.has(key));
  if (unknownVisibleKeys.length > 0) {
    errors.push(`Unknown visible Unit Browser display group: ${unknownVisibleKeys[0]}.`);
  }

  if (new Set(visibleKeys).size !== visibleKeys.length) {
    errors.push('The Unit Browser visible display groups contain a duplicate entry.');
  }

  if (visibleKeys.length > MAX_VISIBLE_OPTIONAL_COLUMNS) {
    errors.push(`Choose no more than ${MAX_VISIBLE_OPTIONAL_COLUMNS} optional Unit Browser display groups.`);
  }

  if (errors.length > 0) {
    throw new LotUnitBrowserLayoutEditorError(errors);
  }

  const visibleKeySet = new Set(visibleKeys);
  return orderedKeys.map((key, index) => ({
    columnKey: key,
    isVisible: visibleKeySet.has(key),
    sortOrder: (index + 1) * 10
  }));
}

module.exports = {
  LotUnitBrowserLayoutEditorError,
  normalizeSubmittedLotUnitBrowserLayout
};
