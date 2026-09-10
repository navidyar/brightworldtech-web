'use strict';

class BulkLabelPrintSelectionError extends Error {
  constructor(messages) {
    super(Array.isArray(messages) && messages.length ? messages[0] : 'Bulk label selection is invalid.');
    this.name = 'BulkLabelPrintSelectionError';
    this.messages = Array.isArray(messages) ? messages : [String(messages || this.message)];
  }
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function canOfferBulkLabelPrint(filters = {}) {
  return Boolean(
    normalizePositiveInteger(filters.lotId)
    && String(filters.lotScope || 'direct') !== 'descendants'
    && String(filters.unitState || 'active') !== 'parked'
  );
}

function normalizeSelectedUnitIds(body = {}, allowedUnitIds = []) {
  const rawValues = Array.isArray(body.unitId)
    ? body.unitId
    : body.unitId !== undefined && body.unitId !== null && body.unitId !== ''
      ? [body.unitId]
      : [];
  const allowed = new Set(
    (Array.isArray(allowedUnitIds) ? allowedUnitIds : [])
      .map(normalizePositiveInteger)
      .filter(Boolean)
  );
  const selected = [];
  const seen = new Set();
  const errors = [];

  for (const rawValue of rawValues) {
    const unitId = normalizePositiveInteger(rawValue);
    if (!unitId || !allowed.has(unitId)) {
      errors.push('One or more selected Units are no longer available on this filtered page. Refresh the bulk print modal and try again.');
      continue;
    }
    if (!seen.has(unitId)) {
      seen.add(unitId);
      selected.push(unitId);
    }
  }

  if (selected.length === 0) {
    errors.push('Select at least one completed Unit to print.');
  }

  if (errors.length > 0) {
    throw new BulkLabelPrintSelectionError([...new Set(errors)]);
  }

  return selected;
}

module.exports = {
  BulkLabelPrintSelectionError,
  canOfferBulkLabelPrint,
  normalizeSelectedUnitIds
};
