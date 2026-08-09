'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('duplicate actions resolve the visible Assignable Lot before reading the hidden destination value', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /function resolveAssignableLotIdForDuplicateAction\(form\)/);
  assert.match(source, /resolveExactAssignableLotMatch\(form\)/);
  assert.match(source, /async function openDuplicateAssumeModal[\s\S]*resolveAssignableLotIdForDuplicateAction\(form\)/);
  assert.match(source, /async function openIntentionalDuplicateRequestModal[\s\S]*resolveAssignableLotIdForDuplicateAction\(form\)/);
  assert.match(source, /async function openDuplicateOverrideModal[\s\S]*resolveAssignableLotIdForDuplicateAction\(form\)/);
});

test('the existing Unit detail route performs an exact search so another Tech receives a read-only record instead of a false not-found page', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /const exactUnitSearch = String\(/);
  assert.match(controller, /unitRecord\.asset_number/);
  assert.match(controller, /search: exactUnitSearch/);
  assert.match(controller, /restrictToCurrentAssignment: isRegularTechUnitBrowserUser\(req\)/);
});

test('the direct Move and Takeover confirmation identifies the destination and explains its no-approval policy', () => {
  const model = read('models/techUnitModel.js');
  const modal = read('views/fragments/tech-unit-duplicate-assume-modal.ejs');

  assert.match(model, /destinationLotName: destinationLot \? String\(destinationLot\.lot_name \|\| ''\) : ''/);
  assert.match(modal, /<dt>Destination Lot<\/dt>/);
  assert.match(modal, /allows duplicate-match Unit assumption/);
  assert.match(modal, /does not create an approval request and does not require a reviewer reason/);
});

test('Intentional Duplicate remains available after a destination Lot is selected while server validation protects submission', () => {
  const view = read('views/fragments/tech-unit-duplicate-check.ejs');
  const source = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');

  assert.match(view, /hasIntentionalDuplicateDestination/);
  assert.match(view, /different physical unit that reuses the serial/);
  assert.match(source, /const hasAssignableLot = Boolean\(lotSelect/);
  assert.doesNotMatch(source, /missingLabels\.push\('a Unit Category'\)/);
  assert.doesNotMatch(source, /missingLabels\.push\('a Unit Status'\)/);
  assert.match(controller, /const validationErrors = await validateUnitForm\(formData, formOptions, 'create'\)/);
});
