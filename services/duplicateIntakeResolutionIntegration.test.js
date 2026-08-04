'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('duplicate intake presents the three distinct physical-unit decisions', () => {
  const view = read('views/fragments/tech-unit-duplicate-check.ejs');

  assert.match(view, /Move \/ Take Over Existing Unit/);
  assert.match(view, /Request Move \/ Takeover/);
  assert.match(view, /Request Intentional Duplicate/);
  assert.match(view, /Open Existing Unit/);
  assert.match(view, /Same physical unit:/);
  assert.match(view, /Different physical unit:/);
  assert.ok(view.includes('href="/tech/units/<%= match.unitId %>" target="_blank" rel="noopener"'));
});

test('a Lot that disables direct duplicate assumption routes the Tech to explicit approval', () => {
  const model = read('models/techUnitModel.js');
  const disabledPolicy = model.indexOf("code: 'BWT_DUPLICATE_ASSUMPTION_DESTINATION_DISABLED'");
  const requiresOverride = model.lastIndexOf('requiresOverride: true', disabledPolicy);

  assert.ok(disabledPolicy >= 0);
  assert.ok(requiresOverride >= 0);
  assert.ok(disabledPolicy - requiresOverride < 180);
  assert.match(model, /Submit a Move \/ Takeover request for Tech Lead\+ review/);
});

test('duplicate intake forwards its destination and request context into the existing-unit request', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /params\.set\('destinationLotId', destinationLotId\)/);
  assert.match(source, /params\.set\('requestContext', 'duplicate_intake'\)/);
  assert.match(source, /params\.set\('duplicateAssumptionNonce', duplicateAssumptionNonce\.value\)/);
  assert.match(source, /params\.set\('unitSerialNumber', unitSerialInput\.value\)/);
  assert.match(source, /Request Move \/ Takeover request could not be opened|Move \/ Takeover request could not be opened/);
});

test('duplicate-intake requests distinguish a Lot Move from taking over another Tech assignment', () => {
  const controller = read('controllers/overrideController.js');
  const view = read('views/fragments/tech-override-request-modal.ejs');

  assert.match(controller, /requestContext === 'duplicate_intake'/);
  assert.match(controller, /getDuplicateIntakeActionKind/);
  assert.match(controller, /already assigned to you in the selected destination Lot/);
  assert.match(controller, /duplicate_intake_existing_unit_request/);
  assert.match(controller, /hasVerifiedDuplicateIntakeContext/);
  assert.match(controller, /session\.duplicateAssumptionCreateNonce/);
  assert.match(view, /name="requestContext" value="<%= isDuplicateIntakeRequest \? 'duplicate_intake' : 'manual' %>"/);
  assert.match(view, /name="duplicateAssumptionNonce"/);
  assert.match(view, /Request Lot Move/);
  assert.match(view, /Request Move \/ Takeover Existing Unit/);
  assert.match(view, /No new Asset Tag will be created/);
  assert.match(read('models/overrideRequestModel.js'), /isDuplicateIntakeMoveRequest/);
  assert.match(read('views/pages/override-request-detail.ejs'), /Create Unit duplicate intake/);
});

test('Intentional Duplicate snapshots preserve and compare proposed identity details', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /version: 2/);
  assert.match(controller, /existingManufacturerLabel/);
  assert.match(controller, /manufacturerDiffers/);
  assert.match(controller, /modelDiffers/);
  assert.match(controller, /manufacturerLabel: candidate && candidate\.manufacturerLabel/);
  assert.match(model, /manufacturerLabel: row\.manufacturer_label/);
  assert.match(model, /modelLabel: row\.model_label/);
});

test('Intentional Duplicate review shows existing and proposed Manufacturer and Model values', () => {
  const modal = read('views/fragments/tech-unit-intentional-duplicate-request-modal.ejs');
  const detail = read('views/pages/unit-request-detail.ejs');

  assert.match(modal, /The proposed identity differs from the matching record/);
  assert.match(modal, /display\.existingManufacturerLabel/);
  assert.match(modal, /display\.existingModelLabel/);
  assert.match(detail, /Identity Differences/);
  assert.match(detail, /request\.matchedUnitSnapshot\.manufacturerLabel/);
  assert.match(detail, /request\.snapshotDisplay\.manufacturerDiffers/);
});

test('save-time duplicate fallback points back to the three controlled intake actions', () => {
  const modal = read('views/fragments/tech-unit-duplicate-modal.ejs');

  assert.match(modal, /Move \/ Take Over Existing Unit/);
  assert.match(modal, /Request Intentional Duplicate/);
  assert.match(modal, /Open Existing Unit/);
  assert.doesNotMatch(modal, /closed-lot candidates remain controlled through the override workflow/);
});

test('direct existing-unit confirmation uses move and takeover terminology', () => {
  const modal = read('views/fragments/tech-unit-duplicate-assume-modal.ejs');

  assert.match(modal, /Move \/ Take Over Existing Unit/);
  assert.match(modal, /same physical unit/i);
  assert.doesNotMatch(modal, />Assume Existing Unit</);
});
