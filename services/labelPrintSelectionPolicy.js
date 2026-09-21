'use strict';

class LabelPrintSelectionError extends Error {
  constructor(messages) {
    const safeMessages = Array.isArray(messages) ? messages.filter(Boolean) : [messages].filter(Boolean);
    super(safeMessages.join(' '));
    this.name = 'LabelPrintSelectionError';
    this.messages = safeMessages;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function getQuantityMap(body = {}) {
  return body.quantity && typeof body.quantity === 'object' && !Array.isArray(body.quantity)
    ? body.quantity
    : {};
}

function buildDefaultSelections(options = []) {
  return (Array.isArray(options) ? options : []).map((option) => ({
    key: option.key,
    selected: Boolean(option.available && option.isRequired),
    quantity: Math.max(1, Math.min(10, Number(option.defaultQuantity) || 1))
  }));
}

function normalizeUnitLabelPrintSelection(body = {}, options = [], maxCopies = 10) {
  const optionByKey = new Map((Array.isArray(options) ? options : []).map((option) => [String(option.key), option]));
  const selectedKeys = asArray(body.templateKey).map((value) => String(value || '').trim()).filter(Boolean);
  const quantities = getQuantityMap(body);
  const errors = [];
  const selections = [];
  const seen = new Set();

  for (const key of selectedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const option = optionByKey.get(key);
    if (!option) {
      errors.push('One of the selected label templates is no longer available for this Lot.');
      continue;
    }
    if (!option.available) {
      errors.push(option.unavailableReason || `Label template “${option.name}” is unavailable.`);
      continue;
    }
    const rawQuantity = quantities[key];
    const quantity = Number(rawQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxCopies) {
      errors.push(`Copies for “${option.name}” must be between 1 and ${maxCopies}.`);
      continue;
    }
    selections.push(Object.freeze({ option, quantity }));
  }

  if (!selections.length && !errors.length) errors.push('Select at least one label to print.');
  if (errors.length) throw new LabelPrintSelectionError(errors);
  return Object.freeze(selections);
}

module.exports = {
  LabelPrintSelectionError,
  asArray,
  buildDefaultSelections,
  normalizeUnitLabelPrintSelection
};
