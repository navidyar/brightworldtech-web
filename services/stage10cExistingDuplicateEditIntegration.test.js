'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const { filterNewDuplicateMatchesForEdit } = require('./unitDuplicateEditPolicy');

test('edit duplicate filtering preserves serial identities already attached to the current Unit', () => {
  const matches = [
    {
      identifierTypeCode: 'bios_serial_number',
      identifierValue: 'APPROVED-123',
      normalizedValue: 'APPROVED123',
      unitId: 22
    },
    {
      identifierTypeCode: 'unit_serial_number',
      identifierValue: 'NEW-DUPLICATE-456',
      normalizedValue: 'NEWDUPLICATE456',
      unitId: 33
    }
  ];

  const result = filterNewDuplicateMatchesForEdit(matches, new Set(['APPROVED123']));

  assert.equal(result.length, 1);
  assert.equal(result[0].normalizedValue, 'NEWDUPLICATE456');
});

test('edit duplicate filtering treats Unit Serial and BIOS Serial as one serial identity namespace', () => {
  const matches = [{
    identifierTypeCode: 'bios_serial_number',
    identifierValue: 'SERIAL-ABC',
    normalizedValue: 'SERIALABC',
    unitId: 22
  }];

  const result = filterNewDuplicateMatchesForEdit(matches, new Set(['SERIALABC']));

  assert.deepEqual(result, []);
});

test('edit duplicate filtering never relaxes Asset Tag uniqueness', () => {
  const matches = [{
    identifierTypeCode: 'asset_tag',
    identifierValue: 'BWT1001',
    normalizedValue: '1001',
    unitId: 22
  }];

  const result = filterNewDuplicateMatchesForEdit(matches, new Set(['1001']));

  assert.equal(result.length, 1);
  assert.equal(result[0].identifierTypeCode, 'asset_tag');
});

test('Edit Unit uses the existing-identity-aware duplicate check before saving', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /async function findNewDuplicateUnitsForEdit/);
  assert.match(model, /getStoredSerialNormalizedValuesForUnit/);
  assert.match(model, /const duplicateMatches = await findNewDuplicateUnitsForEdit\(\s*formData,\s*unitId,\s*unit\.asset_number/);
  assert.doesNotMatch(
    model.slice(model.indexOf('async function updateExistingTechUnit'), model.indexOf('async function updateTechUnit')),
    /findDuplicateUnitsFromIdentifiers\(\s*buildIdentifierEntries\(formData/
  );
});

test('the live duplicate check sends the current Unit ID and suppresses Create-only actions during Edit', () => {
  const client = read('public/js/tech-unit-form.js');
  const controller = read('controllers/techController.js');
  const view = read('views/fragments/tech-unit-duplicate-check.ejs');

  assert.match(client, /params\.set\('currentUnitId', currentUnitIdInput\.value\)/);
  assert.match(controller, /actorUserId:[\s\S]*currentUnitId/);
  assert.match(controller, /isEditDuplicateCheck: Boolean\(currentUnitId\)/);
  assert.match(view, /No new duplicate serial identity was introduced/);
  assert.match(view, /Existing approved duplicate values may be retained/);
  assert.match(view, /!editDuplicateCheck && assumption\.allowed/);
});
