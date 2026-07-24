'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateUnitFormFieldBindings } = require('../services/unitFormFieldBindingValidator');

const formPath = path.join(__dirname, '..', 'views', 'fragments', 'tech-unit-form.ejs');
const markup = fs.readFileSync(formPath, 'utf8');
const result = validateUnitFormFieldBindings(markup);

if (!result.valid) {
  console.error('Unit form field binding validation failed.');

  if (result.missingKeys.length > 0) {
    console.error(`Missing bindings: ${result.missingKeys.join(', ')}`);
  }

  if (result.duplicateKeys.length > 0) {
    console.error(`Duplicate bindings: ${result.duplicateKeys.join(', ')}`);
  }

  if (result.unknownKeys.length > 0) {
    console.error(`Unknown bindings: ${result.unknownKeys.join(', ')}`);
  }

  if (result.unknownFollowerKeys.length > 0) {
    console.error(`Unknown follower keys: ${result.unknownFollowerKeys.join(', ')}`);
  }

  if (result.unknownCompanionKeys.length > 0) {
    console.error(`Unknown companion keys: ${result.unknownCompanionKeys.join(', ')}`);
  }

  process.exitCode = 1;
} else {
  console.log(`Unit form field bindings valid: ${result.actualCount} Lot-configurable controls.`);
}
