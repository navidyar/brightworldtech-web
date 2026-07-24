'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLotUnitFormProfile } = require('./lotUnitFormProfileResolver');
const {
  UnitFormProfilePresentationError,
  buildUnitFormProfilePresentation
} = require('./unitFormProfilePresentation');

const lineage = [{ lotId: 10, parentLotId: null, name: 'Production Lot' }];

test('builds a compact client presentation from the resolved profile', () => {
  const profile = resolveLotUnitFormProfile({
    lineage,
    rules: [
      { lotId: 10, fieldKey: 'bios_serial_number', visibilityMode: 'visible', requirementMode: 'required' },
      { lotId: 10, fieldKey: 'cosmetic_issues', visibilityMode: 'hidden', requirementMode: 'optional' }
    ]
  });
  const presentation = buildUnitFormProfilePresentation(profile);
  const bios = presentation.fields.find((field) => field.key === 'bios_serial_number');
  const cosmeticIssues = presentation.fields.find((field) => field.key === 'cosmetic_issues');

  assert.equal(presentation.lotId, 10);
  assert.equal(presentation.lotName, 'Production Lot');
  assert.equal(presentation.fields.length, 26);
  assert.equal(bios.visible, true);
  assert.equal(bios.required, true);
  assert.equal(cosmeticIssues.visible, false);
  assert.equal(cosmeticIssues.required, false);
  assert.equal(presentation.summary.hiddenFields, 1);
  assert.equal(presentation.summary.requiredFields, 1);
});

test('does not expose protected controls in the client presentation', () => {
  const profile = resolveLotUnitFormProfile({ lineage });
  const presentation = buildUnitFormProfilePresentation(profile);
  const keys = presentation.fields.map((field) => field.key);

  assert.equal(keys.includes('assignable_lot'), false);
  assert.equal(keys.includes('unit_category'), false);
  assert.equal(keys.includes('production_weight_override'), false);
});

test('rejects unresolved or incomplete profiles', () => {
  assert.throws(
    () => buildUnitFormProfilePresentation(null),
    UnitFormProfilePresentationError
  );

  assert.throws(
    () => buildUnitFormProfilePresentation({ selectedLot: { lotId: 10, name: 'Broken' }, fieldsByKey: new Map() }),
    /missing unit_serial_number/
  );
});
