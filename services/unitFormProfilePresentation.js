'use strict';

const { UNIT_FORM_FIELD_REGISTRY } = require('../config/unitFormFieldRegistry');

class UnitFormProfilePresentationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnitFormProfilePresentationError';
  }
}

function buildUnitFormProfilePresentation(profile) {
  if (!profile || !profile.selectedLot || !(profile.fieldsByKey instanceof Map)) {
    throw new UnitFormProfilePresentationError('A resolved Lot Unit form profile is required.');
  }

  const fields = UNIT_FORM_FIELD_REGISTRY
    .filter((field) => field.enabledForLotRules)
    .map((field) => {
      const resolvedField = profile.fieldsByKey.get(field.key);

      if (!resolvedField) {
        throw new UnitFormProfilePresentationError(`Resolved profile is missing ${field.key}.`);
      }

      return Object.freeze({
        key: field.key,
        label: field.label,
        visible: Boolean(resolvedField.visible),
        required: Boolean(resolvedField.required),
        requiredSuppressedByHidden: Boolean(resolvedField.requiredSuppressedByHidden)
      });
    });

  return Object.freeze({
    lotId: Number(profile.selectedLot.lotId),
    lotName: String(profile.selectedLot.name || `Lot ${profile.selectedLot.lotId}`),
    fields: Object.freeze(fields),
    summary: Object.freeze({
      totalFields: fields.length,
      visibleFields: fields.filter((field) => field.visible).length,
      requiredFields: fields.filter((field) => field.required).length,
      hiddenFields: fields.filter((field) => !field.visible).length
    })
  });
}

module.exports = {
  UnitFormProfilePresentationError,
  buildUnitFormProfilePresentation
};
