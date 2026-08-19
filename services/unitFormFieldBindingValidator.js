'use strict';

const {
  RULE_TYPE,
  getUnitFormFieldDefinition,
  listLotConfigurableUnitFormFields
} = require('../config/unitFormFieldRegistry');

function extractAttributeValues(markup, attributeName) {
  const pattern = new RegExp(`${attributeName}=["']([^"']+)["']`, 'g');
  const values = [];
  const source = String(markup || '');
  let match = pattern.exec(source);

  while (match) {
    values.push(match[1]);
    match = pattern.exec(source);
  }

  return values;
}

function extractUnitFormFieldBindingKeys(markup) {
  return extractAttributeValues(markup, 'data-unit-form-field-key');
}

function validateUnitFormFieldBindings(markup) {
  const expectedKeys = listLotConfigurableUnitFormFields().map((field) => field.key).sort();
  const expectedKeySet = new Set(expectedKeys);
  const actualKeys = extractUnitFormFieldBindingKeys(markup);
  const actualKeySet = new Set(actualKeys);
  const repeatedKeys = [...new Set(actualKeys.filter((key, index) => actualKeys.indexOf(key) !== index))].sort();
  const repeatableDuplicateKeys = repeatedKeys.filter((key) => getUnitFormFieldDefinition(key)?.ruleType === RULE_TYPE.REPEATABLE_CHILD);
  const duplicateKeys = repeatedKeys.filter((key) => !repeatableDuplicateKeys.includes(key));
  const missingKeys = expectedKeys.filter((key) => !actualKeySet.has(key));
  const unknownKeys = [...actualKeySet].filter((key) => !expectedKeySet.has(key)).sort();
  const followerKeys = extractAttributeValues(markup, 'data-unit-form-follows-key');
  const companionKeys = extractAttributeValues(markup, 'data-unit-form-companion-key');
  const unknownFollowerKeys = [...new Set(followerKeys.filter((key) => !expectedKeySet.has(key)))].sort();
  const unknownCompanionKeys = [...new Set(companionKeys.filter((key) => !expectedKeySet.has(key)))].sort();

  return Object.freeze({
    valid: duplicateKeys.length === 0
      && missingKeys.length === 0
      && unknownKeys.length === 0
      && unknownFollowerKeys.length === 0
      && unknownCompanionKeys.length === 0,
    expectedCount: expectedKeys.length,
    actualCount: actualKeys.length,
    uniqueActualCount: actualKeySet.size,
    duplicateKeys: Object.freeze(duplicateKeys),
    repeatableDuplicateKeys: Object.freeze(repeatableDuplicateKeys),
    missingKeys: Object.freeze(missingKeys),
    unknownKeys: Object.freeze(unknownKeys),
    followerKeys: Object.freeze(followerKeys),
    companionKeys: Object.freeze(companionKeys),
    unknownFollowerKeys: Object.freeze(unknownFollowerKeys),
    unknownCompanionKeys: Object.freeze(unknownCompanionKeys)
  });
}

module.exports = {
  extractAttributeValues,
  extractUnitFormFieldBindingKeys,
  validateUnitFormFieldBindings
};
