'use strict';

const {
  UNIT_FORM_FIELD_REGISTRY,
  listLotConfigurableUnitFormFields,
  assertValidUnitFormFieldRegistry
} = require('../config/unitFormFieldRegistry');

try {
  assertValidUnitFormFieldRegistry();

  console.log(
    `Unit form field registry valid: ${UNIT_FORM_FIELD_REGISTRY.length} total controls, ` +
      `${listLotConfigurableUnitFormFields().length} lot-configurable controls.`
  );
} catch (error) {
  console.error(`Unit form field registry validation failed: ${error.message}`);
  process.exitCode = 1;
}
