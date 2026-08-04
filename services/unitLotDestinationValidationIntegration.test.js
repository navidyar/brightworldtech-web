'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('duplicate assumptions and return-to-active validate the destination before moving the Unit', () => {
  const source = read('controllers/techController.js');
  const assumptionValidation = source.indexOf('assertExistingUnitDestination({\n      unitId,\n      destinationLotId: formData.destinationLotId');
  const assumptionMove = source.indexOf('assumeExistingTechUnitFromDuplicateMatch({', assumptionValidation);
  const returnValidation = source.indexOf('assertExistingUnitDestination({\n      unitId,\n      destinationLotId: formData.destinationLotId', assumptionMove);
  const returnMove = source.indexOf('returnTechUnitToActive({', returnValidation);

  assert.ok(assumptionValidation >= 0);
  assert.ok(assumptionMove > assumptionValidation);
  assert.ok(returnValidation > assumptionMove);
  assert.ok(returnMove > returnValidation);
});

test('override approval validates both destination Lot moves and same-Lot reassignment', () => {
  const source = read('models/overrideRequestModel.js');

  assert.match(source, /isManualTechOverride && request\.unit_id && approvedDestinationLotId/);
  assert.match(source, /assertExistingUnitDestination\(\{/);
  assert.match(source, /destinationValidation\.warningMessages/);
});

test('Intentional Duplicate approval rechecks the saved intake against current destination rules', () => {
  const source = read('models/unitRequestModel.js');
  const assignableCheck = source.indexOf('assertRequestedDestinationLotIsAssignable');
  const validationCheck = source.indexOf('assertSubmittedUnitDestination', assignableCheck);
  const createCall = source.indexOf('createIntentionalDuplicateTechUnitWithConnection', validationCheck);

  assert.ok(assignableCheck >= 0);
  assert.ok(validationCheck > assignableCheck);
  assert.ok(createCall > validationCheck);
});

test('ordinary Unit Edit continues to validate the selected destination through Stage 5E and 5F', () => {
  const source = read('controllers/techController.js');
  const prepare = source.indexOf('prepareTechUnitFormSubmission({');
  const update = source.indexOf('updateTechUnitWithAudit({', prepare);

  assert.ok(prepare >= 0);
  assert.ok(update > prepare);
});


test('Lot moves expire prior Management acceptance inside the same transaction', () => {
  const techSource = read('models/techUnitModel.js');
  const overrideSource = read('models/overrideRequestModel.js');

  assert.match(techSource, /lotChanged && previousLotId[\s\S]*expireMovedUnitOverrides\(previousLotId, connection\)/);
  assert.match(techSource, /currentLotId[\s\S]*expireMovedUnitOverrides\(currentLotId, connection\)/);
  assert.match(overrideSource, /lotChanged && currentLotId[\s\S]*expireMovedUnitOverrides\(currentLotId, connection\)/);
});
