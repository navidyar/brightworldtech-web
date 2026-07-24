'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getResolvedUnitFormField,
  resolveLotUnitFormProfile
} = require('./lotUnitFormProfileResolver');

const rootOnly = [
  { lotId: 10, parentLotId: null, name: 'Root Lot' }
];

const threeLevels = [
  { lotId: 10, parentLotId: null, name: 'Root Lot' },
  { lotId: 20, parentLotId: 10, name: 'Child Lot' },
  { lotId: 30, parentLotId: 20, name: 'Leaf Lot' }
];

test('resolves application defaults without stored rules', () => {
  const profile = resolveLotUnitFormProfile({ lineage: rootOnly });

  assert.equal(profile.selectedLot.lotId, 10);
  assert.equal(profile.fields.length, 54);
  assert.equal(getResolvedUnitFormField(profile, 'assignable_lot').required, true);
  assert.equal(getResolvedUnitFormField(profile, 'bios_serial_number').visible, true);
  assert.equal(getResolvedUnitFormField(profile, 'bios_serial_number').required, false);
  assert.equal(profile.storedRuleCount, 0);
});

test('applies parent rules first and lets descendants override each mode independently', () => {
  const profile = resolveLotUnitFormProfile({
    lineage: threeLevels,
    rules: [
      { lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'visible', requirementMode: 'required' },
      { lotId: 20, fieldKey: 'bios_serial_number', visibilityMode: 'hidden', requirementMode: 'inherit' },
      { lotId: 30, fieldKey: 'bios_serial_number', visibilityMode: 'visible', requirementMode: 'inherit' }
    ]
  });

  const field = getResolvedUnitFormField(profile, 'bios_serial_number');

  assert.equal(field.visible, true);
  assert.equal(field.required, true);
  assert.equal(field.visibilitySource.lotId, 30);
  assert.equal(field.requirementSource.lotId, 10);
});

test('suppresses an inherited requirement while its field is hidden without deleting that inheritance', () => {
  const childProfile = resolveLotUnitFormProfile({
    lineage: threeLevels.slice(0, 2),
    rules: [
      { lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'inherit', requirementMode: 'required' },
      { lotId: 20, fieldKey: 'bios_serial_number', visibilityMode: 'hidden', requirementMode: 'inherit' }
    ]
  });

  const childField = getResolvedUnitFormField(childProfile, 'bios_serial_number');

  assert.equal(childField.visible, false);
  assert.equal(childField.required, false);
  assert.equal(childField.resolvedRequirementMode, 'required');
  assert.equal(childField.requiredSuppressedByHidden, true);
});

test('dependency rules force visible and required prerequisites', () => {
  const profile = resolveLotUnitFormProfile({
    lineage: rootOnly,
    rules: [
      { lotId: 10, fieldKey: 'manufacturer', visibilityMode: 'hidden', requirementMode: 'optional' },
      { lotId: 10, fieldKey: 'unit_model', visibilityMode: 'hidden', requirementMode: 'optional' },
      { lotId: 10, fieldKey: 'processor_model', visibilityMode: 'visible', requirementMode: 'required' }
    ]
  });

  const manufacturer = getResolvedUnitFormField(profile, 'manufacturer');
  const unitModel = getResolvedUnitFormField(profile, 'unit_model');
  const processor = getResolvedUnitFormField(profile, 'processor_model');

  assert.equal(processor.required, true);
  assert.equal(unitModel.visible, true);
  assert.equal(unitModel.required, true);
  assert.equal(manufacturer.visible, true);
  assert.equal(manufacturer.required, true);
  assert.deepEqual(unitModel.forcedRequiredBy, ['processor_model']);
  assert.ok(manufacturer.forcedRequiredBy.includes('unit_model'));
});


test('protected workflow controls do not override a Lot-configured parent field', () => {
  const profile = resolveLotUnitFormProfile({
    lineage: rootOnly,
    rules: [
      { lotId: 10, fieldKey: 'unit_outcome', visibilityMode: 'hidden', requirementMode: 'optional' },
      { lotId: 10, fieldKey: 'outcome_notes', visibilityMode: 'hidden', requirementMode: 'inherit' }
    ]
  });

  const outcome = getResolvedUnitFormField(profile, 'unit_outcome');

  assert.equal(outcome.visible, false);
  assert.equal(outcome.required, false);
  assert.deepEqual(outcome.forcedVisibleBy, []);
});

test('rejects unknown, protected, empty, contradictory, and duplicate stored rules', () => {
  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: rootOnly,
      rules: [{ lotId: 10, fieldKey: 'not_real', visibilityMode: 'visible', requirementMode: 'inherit' }]
    }),
    /unknown field key/
  );

  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: rootOnly,
      rules: [{ lotId: 10, fieldKey: 'assignable_lot', visibilityMode: 'visible', requirementMode: 'inherit' }]
    }),
    /protected/
  );

  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: rootOnly,
      rules: [{ lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'inherit', requirementMode: 'inherit' }]
    }),
    /stores no override/
  );

  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: rootOnly,
      rules: [{ lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'hidden', requirementMode: 'required' }]
    }),
    /Hidden and Required/
  );

  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: rootOnly,
      rules: [
        { lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'visible', requirementMode: 'inherit' },
        { lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'inherit', requirementMode: 'required' }
      ]
    }),
    /Duplicate Lot form rule/
  );
});

test('rejects malformed or cyclic lineage input', () => {
  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: [
        { lotId: 10, parentLotId: null, name: 'Root' },
        { lotId: 20, parentLotId: 99, name: 'Wrong Parent' }
      ]
    }),
    /must name 10 as its parent/
  );

  assert.throws(
    () => resolveLotUnitFormProfile({
      lineage: [
        { lotId: 10, parentLotId: null, name: 'Root' },
        { lotId: 10, parentLotId: 10, name: 'Cycle' }
      ]
    }),
    /duplicate or cyclic/
  );
});
