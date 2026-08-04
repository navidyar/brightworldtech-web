'use strict';

function normalizeComparableValue(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function toNormalizedValueSet(values) {
  const source = values instanceof Set
    ? [...values]
    : (Array.isArray(values) ? values : []);

  return new Set(source.map(normalizeComparableValue).filter(Boolean));
}

function filterNewDuplicateMatchesForEdit(duplicateMatches, existingSerialNormalizedValues) {
  const safeMatches = Array.isArray(duplicateMatches) ? duplicateMatches : [];
  const existingValues = toNormalizedValueSet(existingSerialNormalizedValues);

  return safeMatches.filter((match) => {
    const typeCode = String(match && match.identifierTypeCode || '').trim();

    if (!['unit_serial_number', 'bios_serial_number'].includes(typeCode)) {
      return true;
    }

    const normalizedValue = normalizeComparableValue(
      match && (match.normalizedValue || match.identifierValue)
    );

    return !normalizedValue || !existingValues.has(normalizedValue);
  });
}

module.exports = {
  filterNewDuplicateMatchesForEdit,
  normalizeComparableValue
};
