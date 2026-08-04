'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('core Unit persistence skips hidden identifiers, modules, and configurable columns', () => {
  const source = readProjectFile('models/techUnitModel.js');

  assert.match(source, /\['unit_serial_number', 'unit_serial_number'\]/);
  assert.match(source, /\['bios_serial_number', 'bios_serial_number'\]/);
  assert.match(source, /isUnitFormFieldManaged\(formData, fieldKey\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'memory_modules'\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'storage_devices'\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'manufacturer'\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'operating_system'\)/);
});

test('issue and comment persistence only replaces sections managed by the current Lot profile', () => {
  const source = readProjectFile('models/unitIssueEntryModel.js');

  assert.match(source, /isUnitFormFieldManaged\(formData, 'cosmetic_issues'\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'hardware_issues'\)/);
  assert.match(source, /isUnitFormFieldManaged\(formData, 'general_comment'\)/);
});

test('expanded Unit persistence updates only managed specifications, grade, and outcome fields', () => {
  const source = readProjectFile('models/unitExpandedFormModel.js');

  assert.match(source, /managedFields = specificationFields\.filter/);
  assert.match(source, /isAnyUnitFormFieldManaged\(formData, \['overall_grade', 'overall_grade_notes'\]\)/);
  assert.match(source, /isAnyUnitFormFieldManaged\(formData, \['unit_outcome', 'outcome_notes'\]\)/);
});

test('Create and Edit handlers apply the latest profile before ordinary validation and persistence', () => {
  const source = readProjectFile('controllers/techController.js');

  assert.match(source, /getRequirementAwareUnitFormProfileForLot\(lotId\)/);
  assert.match(source, /applyUnitFormSubmissionPolicy\(/);
  assert.match(source, /buildManagedValidationFormData\(formData\)/);
  assert.match(source, /prepareTechUnitFormSubmission\(\{/);
});
